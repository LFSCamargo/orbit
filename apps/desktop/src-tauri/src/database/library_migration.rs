//! Remove the retired provider only after a consistent, recoverable SQLite snapshot.
use anyhow::{Context, Result};
use rusqlite::Connection;
use std::path::Path;

pub fn migrate(conn: &Connection, database_path: &Path) -> Result<()> {
    let done: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM settings WHERE key = 'unified-library-v1')", [], |r| r.get(0))?;
    if done { return Ok(()); }
    let legacy: i64 = conn.query_row("SELECT COUNT(*) FROM games WHERE provider = 'gamehub'", [], |r| r.get(0))?;
    if legacy > 0 {
        let backup = database_path.with_extension(format!("pre-unified-{}.sqlite3", uuid::Uuid::new_v4()));
        conn.execute("VACUUM INTO ?1", [backup.to_string_lossy().as_ref()]).context("Could not back up the library; migration was not applied")?;
    }
    let tx = conn.unchecked_transaction()?;
    // Keep stable IDs, overrides, collection membership and historical sessions for verified Steam installs.
    tx.execute("UPDATE games SET provider = 'steam' WHERE provider = 'gamehub' AND source_id != '' AND source_id NOT GLOB '*[^0-9]*' AND CAST(source_id AS INTEGER) > 0 AND json_extract(launch_config_json, '$.type') = 'wine'", [])?;
    tx.execute("DELETE FROM play_sessions WHERE game_id IN (SELECT id FROM games WHERE provider = 'gamehub')", [])?;
    tx.execute("DELETE FROM user_overrides WHERE game_id IN (SELECT id FROM games WHERE provider = 'gamehub')", [])?;
    tx.execute("DELETE FROM collection_games WHERE game_id IN (SELECT id FROM games WHERE provider = 'gamehub')", [])?;
    tx.execute("DELETE FROM games WHERE provider = 'gamehub'", [])?;
    tx.execute("DELETE FROM import_sources WHERE provider = 'gamehub'", [])?;
    tx.execute("INSERT INTO settings(key, value_json) VALUES ('unified-library-v1', 'true')", [])?;
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn migration_is_idempotent_and_preserves_steam_history() {
        let root = std::env::temp_dir().join(format!("orbit-migration-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("orbit.sqlite3");
        let conn = Connection::open(&path).unwrap();
        crate::database::migrations::run_migrations(&conn).unwrap();
        for (id, source, config) in [("steam", "1593500", r#"{"type":"wine"}"#), ("legacy", "old", r#"{"type":"gamehub"}"#)] {
            conn.execute("INSERT INTO games(id,stable_key,title,sort_title,provider,platform,source_id,launch_config_json,artwork_json,date_added) VALUES (?1,?1,?1,?1,'gamehub','windows',?2,?3,'{}','today')", rusqlite::params![id, source, config]).unwrap();
            conn.execute("INSERT INTO play_sessions(id,game_id,provider,started_at) VALUES (?1,?1,'gamehub','today')", [id]).unwrap();
        }
        migrate(&conn, &path).unwrap(); migrate(&conn, &path).unwrap();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM games WHERE provider='steam'", [], |r| r.get(0)).unwrap(); assert_eq!(count, 1);
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM play_sessions", [], |r| r.get(0)).unwrap(); assert_eq!(count, 1);
        let backups: Vec<_> = std::fs::read_dir(&root).unwrap().flatten().filter(|p| p.file_name().to_string_lossy().contains("pre-unified")).collect();
        assert_eq!(backups.len(), 1);
        let saved = Connection::open(backups[0].path()).unwrap();
        let count: i64 = saved.query_row("SELECT COUNT(*) FROM games", [], |r| r.get(0)).unwrap(); assert_eq!(count, 2);
        drop(saved); drop(conn); std::fs::remove_dir_all(root).unwrap();
    }
}
