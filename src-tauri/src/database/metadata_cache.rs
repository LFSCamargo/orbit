use std::path::Path;

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
    conn: Connection,
}

impl MetadataCacheRepository {
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("Failed to create metadata cache dir {}", parent.display()))?;
        }
        let conn = Connection::open(path)
            .with_context(|| format!("Failed to open metadata cache at {}", path.display()))?;
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
            "#,
        )?;
        Ok(Self { conn })
    }

    pub fn count(&self) -> Result<usize> {
        let count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM game_metadata", [], |row| row.get(0))?;
        Ok(count as usize)
    }

    pub fn get(&self, game_id: &str) -> Result<Option<CachedMetadataRow>> {
        match self.conn.query_row(
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
        self.conn.execute(
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
        self.conn.execute(
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
