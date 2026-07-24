use std::path::Path;
use std::sync::Mutex;

use anyhow::{Context, Result};
use rusqlite::{params, Connection};

#[derive(Debug, Clone)]
pub struct CachedMetadataRow {
    pub game_id: String,
    pub tgdb_id: Option<i64>,
    pub title: String,
    pub summary: Option<String>,
    pub release_date: Option<String>,
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub cover_path: Option<String>,
    pub background_path: Option<String>,
    pub icon_path: Option<String>,
    pub updated_at: String,
}

pub struct MetadataCacheRepository {
    conn: Mutex<Connection>,
}

impl MetadataCacheRepository {
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("Failed to create metadata cache dir {}", parent.display()))?;
        }
        let conn = Connection::open(path)
            .with_context(|| format!("Failed to open metadata cache at {}", path.display()))?;
        Self::from_connection(conn)
    }

    #[cfg(test)]
    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory().context("Failed to open in-memory metadata cache")?;
        Self::from_connection(conn)
    }

    fn from_connection(conn: Connection) -> Result<Self> {
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS game_metadata (
                game_id TEXT PRIMARY KEY NOT NULL,
                tgdb_id INTEGER,
                title TEXT NOT NULL,
                summary TEXT,
                release_date TEXT,
                developer TEXT,
                publisher TEXT,
                cover_path TEXT,
                background_path TEXT,
                icon_path TEXT,
                metadata_provider TEXT NOT NULL DEFAULT 'thegamesdb',
                metadata_updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS game_external_ids (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id TEXT NOT NULL,
                source TEXT NOT NULL,
                external_id TEXT NOT NULL,
                UNIQUE(source, external_id)
            );

            CREATE INDEX IF NOT EXISTS idx_game_external_ids_game_id ON game_external_ids(game_id);
            "#,
        )?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn count(&self) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM game_metadata", [], |row| row.get(0))?;
        Ok(count as usize)
    }

    pub fn get(&self, game_id: &str) -> Result<Option<CachedMetadataRow>> {
        let conn = self.conn.lock().unwrap();
        match conn.query_row(
            "SELECT game_id, tgdb_id, title, summary, release_date, developer, publisher,
                    cover_path, background_path, icon_path, metadata_updated_at
             FROM game_metadata WHERE game_id = ?1",
            params![game_id],
            |row| {
                Ok(CachedMetadataRow {
                    game_id: row.get(0)?,
                    tgdb_id: row.get(1)?,
                    title: row.get(2)?,
                    summary: row.get(3)?,
                    release_date: row.get(4)?,
                    developer: row.get(5)?,
                    publisher: row.get(6)?,
                    cover_path: row.get(7)?,
                    background_path: row.get(8)?,
                    icon_path: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            },
        ) {
            Ok(row) => Ok(Some(row)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(err) => Err(err.into()),
        }
    }

    pub fn upsert(&self, row: &CachedMetadataRow) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"
            INSERT INTO game_metadata (
                game_id, tgdb_id, title, summary, release_date, developer, publisher,
                cover_path, background_path, icon_path, metadata_updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            ON CONFLICT(game_id) DO UPDATE SET
                tgdb_id = excluded.tgdb_id,
                title = excluded.title,
                summary = excluded.summary,
                release_date = excluded.release_date,
                developer = excluded.developer,
                publisher = excluded.publisher,
                cover_path = excluded.cover_path,
                background_path = excluded.background_path,
                icon_path = excluded.icon_path,
                metadata_updated_at = excluded.metadata_updated_at
            "#,
            params![
                row.game_id,
                row.tgdb_id,
                row.title,
                row.summary,
                row.release_date,
                row.developer,
                row.publisher,
                row.cover_path,
                row.background_path,
                row.icon_path,
                row.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn upsert_external_id(&self, game_id: &str, source: &str, external_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"
            INSERT INTO game_external_ids (game_id, source, external_id)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(source, external_id) DO UPDATE SET game_id = excluded.game_id
            "#,
            params![game_id, source, external_id],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_row(game_id: &str, title: &str) -> CachedMetadataRow {
        CachedMetadataRow {
            game_id: game_id.into(),
            tgdb_id: Some(42),
            title: title.into(),
            summary: Some("A great game.".into()),
            release_date: Some("2018-01-25".into()),
            developer: Some("Team Cherry".into()),
            publisher: Some("Team Cherry".into()),
            cover_path: Some("/cache/cover.png".into()),
            background_path: Some("/cache/bg.png".into()),
            icon_path: None,
            updated_at: "2026-01-01T00:00:00Z".into(),
        }
    }

    #[test]
    fn external_ids_index_exists() {
        let cache = MetadataCacheRepository::open_in_memory().expect("cache");
        let conn = cache.conn.lock().unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_game_external_ids_game_id'",
                [],
                |row| row.get(0),
            )
            .expect("index query");
        assert_eq!(count, 1);
    }

    #[test]
    fn upsert_get_round_trip() {
        let cache = MetadataCacheRepository::open_in_memory().expect("cache");
        assert_eq!(cache.count().expect("count"), 0);
        assert!(cache.get("missing").expect("get").is_none());

        let row = sample_row("game-1", "Hollow Knight");
        cache.upsert(&row).expect("upsert");
        assert_eq!(cache.count().expect("count"), 1);

        let fetched = cache.get("game-1").expect("get").expect("exists");
        assert_eq!(fetched.game_id, "game-1");
        assert_eq!(fetched.tgdb_id, Some(42));
        assert_eq!(fetched.title, "Hollow Knight");
        assert_eq!(fetched.summary.as_deref(), Some("A great game."));
        assert_eq!(fetched.developer.as_deref(), Some("Team Cherry"));
        assert_eq!(fetched.cover_path.as_deref(), Some("/cache/cover.png"));
        assert_eq!(fetched.updated_at, "2026-01-01T00:00:00Z");

        let updated = CachedMetadataRow {
            title: "Hollow Knight: Silksong".into(),
            summary: Some("Sequel.".into()),
            updated_at: "2026-02-01T00:00:00Z".into(),
            ..row
        };
        cache.upsert(&updated).expect("re-upsert");
        assert_eq!(cache.count().expect("count"), 1);

        let fetched = cache.get("game-1").expect("get").expect("exists");
        assert_eq!(fetched.title, "Hollow Knight: Silksong");
        assert_eq!(fetched.summary.as_deref(), Some("Sequel."));
        assert_eq!(fetched.updated_at, "2026-02-01T00:00:00Z");
    }

    #[test]
    fn upsert_external_id_and_count() {
        let cache = MetadataCacheRepository::open_in_memory().expect("cache");
        cache.upsert(&sample_row("game-a", "A")).expect("upsert a");
        cache.upsert(&sample_row("game-b", "B")).expect("upsert b");
        assert_eq!(cache.count().expect("count"), 2);

        cache
            .upsert_external_id("game-a", "steam", "570")
            .expect("external steam");
        cache
            .upsert_external_id("game-a", "tgdb", "12345")
            .expect("external tgdb");
        // Same source+external_id remaps to another game_id.
        cache
            .upsert_external_id("game-b", "steam", "570")
            .expect("remap steam");

        let conn = cache.conn.lock().unwrap();
        let external_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM game_external_ids", [], |row| row.get(0))
            .expect("external count");
        assert_eq!(external_count, 2);

        let steam_game: String = conn
            .query_row(
                "SELECT game_id FROM game_external_ids WHERE source = ?1 AND external_id = ?2",
                params!["steam", "570"],
                |row| row.get(0),
            )
            .expect("steam mapping");
        assert_eq!(steam_game, "game-b");
    }
}
