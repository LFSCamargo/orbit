use anyhow::{Context, Result};
use rusqlite::Connection;

const MIGRATIONS: &[&str] = &[
    r#"
    CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY NOT NULL,
        applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY NOT NULL,
        stable_key TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        sort_title TEXT NOT NULL,
        provider TEXT NOT NULL,
        platform TEXT NOT NULL,
        source_id TEXT,
        launch_config_json TEXT NOT NULL,
        artwork_json TEXT NOT NULL,
        favorite INTEGER NOT NULL DEFAULT 0,
        hidden INTEGER NOT NULL DEFAULT 0,
        date_added TEXT NOT NULL,
        last_played_at TEXT,
        total_playtime_seconds INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS import_sources (
        id TEXT PRIMARY KEY NOT NULL,
        provider TEXT NOT NULL,
        path TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_synced_at TEXT,
        UNIQUE(provider, path)
    );

    CREATE TABLE IF NOT EXISTS play_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        game_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        pid INTEGER,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        exit_code INTEGER,
        stop_reason TEXT,
        duration_seconds INTEGER,
        FOREIGN KEY(game_id) REFERENCES games(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL,
        value_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS collection_games (
        collection_id TEXT NOT NULL,
        game_id TEXT NOT NULL,
        PRIMARY KEY(collection_id, game_id)
    );

    CREATE TABLE IF NOT EXISTS user_overrides (
        game_id TEXT PRIMARY KEY NOT NULL,
        override_json TEXT NOT NULL
    );
    "#,
    r#"
    ALTER TABLE games ADD COLUMN description TEXT;
    ALTER TABLE games ADD COLUMN install_size_bytes INTEGER;
    ALTER TABLE games ADD COLUMN achievements_json TEXT NOT NULL DEFAULT '[]';
    "#,
    r#"
    DELETE FROM play_sessions WHERE game_id IN (SELECT id FROM games WHERE id LIKE 'mock-%');
    DELETE FROM user_overrides WHERE game_id IN (SELECT id FROM games WHERE id LIKE 'mock-%');
    DELETE FROM collection_games WHERE game_id IN (SELECT id FROM games WHERE id LIKE 'mock-%');
    DELETE FROM games WHERE id LIKE 'mock-%';
    "#,
];

pub fn run_migrations(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY NOT NULL,
            applied_at TEXT NOT NULL
        );",
    )?;

    let current: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    for (index, sql) in MIGRATIONS.iter().enumerate() {
        let version = (index + 1) as i64;
        if version <= current {
            continue;
        }
        conn.execute_batch(sql)
            .with_context(|| format!("Failed applying migration {version}"))?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, ?2)",
            rusqlite::params![version, chrono::Utc::now().to_rfc3339()],
        )?;
    }

    Ok(())
}
