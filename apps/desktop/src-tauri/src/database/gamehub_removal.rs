//! Drop what the retired GameHub integration left in SQLite, once, after a
//! recoverable snapshot: rows with GameHub launch configs and Steam rows whose
//! paths pointed into GameHub's private engine folder.
use anyhow::{Context, Result};
use rusqlite::Connection;
use std::path::Path;

const DONE_KEY: &str = "gamehub-removal-v1";
const RETIRED_ROOT: &str = "com.gamemac.www";

pub fn migrate(conn: &Connection, database_path: &Path) -> Result<()> {
    let done: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM settings WHERE key = ?1)",
        [DONE_KEY],
        |r| r.get(0),
    )?;
    if done {
        return Ok(());
    }
    let affected: i64 = conn.query_row(
        "SELECT COUNT(*) FROM games WHERE provider = 'gamehub'
            OR json_extract(launch_config_json, '$.type') = 'gamehub'
            OR instr(launch_config_json, ?1) > 0",
        [RETIRED_ROOT],
        |r| r.get(0),
    )?;
    if affected > 0 {
        let backup = database_path.with_extension(format!(
            "pre-gamehub-removal-{}.sqlite3",
            uuid::Uuid::new_v4()
        ));
        conn.execute("VACUUM INTO ?1", [backup.to_string_lossy().as_ref()])
            .context("Could not back up the library; migration was not applied")?;
    }
    let tx = conn.unchecked_transaction()?;
    // Shortcut rows have nothing Orbit can launch; their history goes with them.
    let retired = "SELECT id FROM games WHERE provider = 'gamehub'
        OR json_extract(launch_config_json, '$.type') = 'gamehub'";
    for table in ["play_sessions", "user_overrides", "collection_games"] {
        tx.execute(
            &format!("DELETE FROM {table} WHERE game_id IN ({retired})"),
            [],
        )?;
    }
    tx.execute(&format!("DELETE FROM games WHERE id IN ({retired})"), [])?;
    tx.execute("DELETE FROM import_sources WHERE provider = 'gamehub'", [])?;
    // Steam rows keep their identity and history; Play rewrites the paths from
    // Orbit's own install on the next launch.
    tx.execute(
        "UPDATE games SET launch_config_json = json_set(launch_config_json,
            '$.profile.executable', '', '$.profile.runtimePath', '')
         WHERE json_extract(launch_config_json, '$.type') = 'wine'
           AND instr(launch_config_json, ?1) > 0",
        [RETIRED_ROOT],
    )?;
    tx.execute(
        "INSERT INTO settings(key, value_json) VALUES (?1, 'true')",
        [DONE_KEY],
    )?;
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn insert(conn: &Connection, id: &str, provider: &str, config: &str) {
        conn.execute(
            "INSERT INTO games(id,stable_key,title,sort_title,provider,platform,source_id,launch_config_json,artwork_json,date_added)
             VALUES (?1,?1,?1,?1,?2,'windows','1593500',?3,'{}','today')",
            rusqlite::params![id, provider, config],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO play_sessions(id,game_id,provider,started_at) VALUES (?1,?1,?2,'today')",
            rusqlite::params![id, provider],
        )
        .unwrap();
    }

    #[test]
    fn retired_rows_go_and_steam_rows_lose_only_engine_paths() {
        let root = std::env::temp_dir().join(format!("orbit-gh-removal-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("orbit.sqlite3");
        let conn = Connection::open(&path).unwrap();
        crate::database::migrations::run_migrations(&conn).unwrap();
        let engine = "/Users/me/Library/Application Support/com.gamemac.www/wine-engine";
        insert(
            &conn,
            "gow",
            "steam",
            &format!(
                r#"{{"type":"wine","profile":{{"executable":"{engine}/containers/virtual_containers/3/drive_c/Program Files (x86)/Steam/steam.exe","runtimePath":"{engine}/containers/wine_installations/10000073/bin/wine","arguments":[],"environment":{{}}}}}}"#
            ),
        );
        insert(
            &conn,
            "shortcut",
            "manual",
            r#"{"type":"gamehub","gamehubAppPath":"/Applications/GameHub.app","shortcutAppPath":"/Applications/Hades.app"}"#,
        );
        insert(
            &conn,
            "orbit",
            "steam",
            r#"{"type":"wine","profile":{"executable":"/Games/Hades.exe","runtimePath":"/wine/bin/wine","arguments":[],"environment":{}}}"#,
        );

        migrate(&conn, &path).unwrap();
        migrate(&conn, &path).unwrap();

        let ids: Vec<String> = conn
            .prepare("SELECT id FROM games ORDER BY id")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert_eq!(ids, ["gow", "orbit"]);
        let sessions: i64 = conn
            .query_row("SELECT COUNT(*) FROM play_sessions", [], |r| r.get(0))
            .unwrap();
        assert_eq!(sessions, 2, "Steam history is kept");
        let gow: String = conn
            .query_row(
                "SELECT launch_config_json FROM games WHERE id='gow'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(!gow.contains(RETIRED_ROOT));
        let config: crate::models::LaunchConfiguration = serde_json::from_str(&gow).unwrap();
        assert!(matches!(
            config,
            crate::models::LaunchConfiguration::Wine { .. }
        ));
        let orbit: String = conn
            .query_row(
                "SELECT launch_config_json FROM games WHERE id='orbit'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(
            orbit.contains("/Games/Hades.exe"),
            "unrelated rows are untouched"
        );
        let backups = std::fs::read_dir(&root)
            .unwrap()
            .filter(|entry| {
                entry
                    .as_ref()
                    .unwrap()
                    .file_name()
                    .to_string_lossy()
                    .contains("pre-gamehub-removal")
            })
            .count();
        assert_eq!(backups, 1, "one snapshot, not one per run");
        drop(conn);
        let _ = std::fs::remove_dir_all(root);
    }
}
