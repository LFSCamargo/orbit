use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use uuid::Uuid;

use crate::database::migrations::run_migrations;
use crate::models::{
    CreateGameRequest, Game, GameArtwork, GameOverrides, GamePlatform, GameProvider, GameSession,
    ImportedGame, LaunchConfiguration, SessionStopReason, UpdateGameRequest, UpsertResult,
};
use crate::services::artwork::{is_heavy_base64_data_url, materialize_heavy_artwork};
use crate::services::metadata_merge::{is_placeholder_description, merge_artwork};

pub struct GameRepository {
    conn: Mutex<Connection>,
}

impl GameRepository {
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path).context("Failed to open SQLite database")?;
        conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")?;
        run_migrations(&conn)?;
        let repo = Self {
            conn: Mutex::new(conn),
        };
        Ok(repo)
    }

    #[cfg(test)]
    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory().context("Failed to open in-memory SQLite")?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        run_migrations(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn list_games(&self) -> Result<Vec<Game>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, title, sort_title, provider, platform, source_id, launch_config_json,
                    artwork_json, favorite, hidden, date_added, last_played_at, total_playtime_seconds,
                    description, install_size_bytes, achievements_json
             FROM games
             ORDER BY sort_title COLLATE NOCASE ASC",
        )?;
        let rows = stmt.query_map([], map_game_row)?;
        let mut games: Vec<Game> = rows.filter_map(|row| row.ok()).collect();
        let mut overrides = load_all_overrides(&conn)?;
        for game in &mut games {
            if let Some(over) = overrides.get_mut(&game.id) {
                // Overrides can still hold legacy inline base64 — spill before applying.
                if materialize_override_artwork(&game.id, over) {
                    persist_override_json(&conn, &game.id, over)?;
                }
                apply_override_values(game, over);
            }
            if materialize_heavy_artwork(&game.id, &mut game.artwork) {
                persist_artwork_json(&conn, &game.id, &game.artwork)?;
            }
            // Safety net: never send multi-MB data URLs over IPC for list views.
            lighten_artwork(&mut game.artwork);
        }
        Ok(games)
    }

    pub fn get_game(&self, game_id: &str) -> Result<Option<Game>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, title, sort_title, provider, platform, source_id, launch_config_json,
                    artwork_json, favorite, hidden, date_added, last_played_at, total_playtime_seconds,
                    description, install_size_bytes, achievements_json
             FROM games WHERE id = ?1",
        )?;
        let mut rows = stmt.query_map(params![game_id], map_game_row)?;
        let mut game = rows.next().transpose()?;
        if let Some(ref mut g) = game {
            apply_overrides(&conn, g)?;
        }
        Ok(game)
    }

    pub fn upsert_imported(&self, imported: &[ImportedGame]) -> Result<UpsertResult> {
        let conn = self.conn.lock().unwrap();
        let mut upserted = 0usize;
        let mut new_game_ids = Vec::new();
        let mut game_ids = Vec::new();
        let now = chrono::Utc::now().to_rfc3339();
        // O(n) preload: one query for existing rows instead of N SELECTs by stable_key.
        let mut existing_by_key = load_existing_by_stable_key(&conn)?;

        for game in imported {
            let launch_json = serde_json::to_string(&game.launch_config)?;
            let achievements_json = serde_json::to_string(&game.achievements)?;

            if let Some((id, existing_description, existing_artwork_json, _existing_title)) =
                existing_by_key.remove(&game.stable_key)
            {
                game_ids.push(id.clone());
                let existing_artwork: GameArtwork =
                    serde_json::from_str(&existing_artwork_json).unwrap_or_default();
                let mut artwork = merge_artwork(&existing_artwork, &game.artwork);
                materialize_heavy_artwork(&id, &mut artwork);
                let artwork_json = serde_json::to_string(&artwork)?;

                // Keep enriched / user descriptions; only replace empty or placeholder text.
                let description = if is_placeholder_description(existing_description.as_deref()) {
                    game.description.clone().or(existing_description)
                } else {
                    existing_description
                };

                conn.execute(
                    "UPDATE games
                     SET title = ?1,
                         sort_title = ?2,
                         provider = ?3,
                         platform = ?4,
                         source_id = ?5,
                         launch_config_json = ?6,
                         artwork_json = ?7,
                         description = ?8,
                         install_size_bytes = ?9,
                         achievements_json = ?10,
                         total_playtime_seconds = CASE
                            WHEN ?11 > total_playtime_seconds THEN ?11
                            ELSE total_playtime_seconds
                         END
                     WHERE id = ?12",
                    params![
                        game.title,
                        game.sort_title,
                        game.provider.as_str(),
                        game.platform.as_str(),
                        game.source_id,
                        launch_json,
                        artwork_json,
                        description,
                        game.install_size_bytes,
                        achievements_json,
                        game.total_playtime_seconds,
                        id,
                    ],
                )?;
            } else {
                let id = Uuid::new_v4().to_string();
                let mut artwork = game.artwork.clone();
                materialize_heavy_artwork(&id, &mut artwork);
                let artwork_json = serde_json::to_string(&artwork)?;
                conn.execute(
                    "INSERT INTO games (
                        id, stable_key, title, sort_title, provider, platform, source_id,
                        launch_config_json, artwork_json, favorite, hidden, date_added,
                        last_played_at, total_playtime_seconds, description,
                        install_size_bytes, achievements_json
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, 0, ?10, NULL, ?11, ?12, ?13, ?14)",
                    params![
                        id,
                        game.stable_key,
                        game.title,
                        game.sort_title,
                        game.provider.as_str(),
                        game.platform.as_str(),
                        game.source_id,
                        launch_json,
                        artwork_json,
                        now,
                        game.total_playtime_seconds,
                        game.description,
                        game.install_size_bytes,
                        achievements_json,
                    ],
                )?;
                // Track newly inserted keys so duplicate keys in the same batch update, not re-insert.
                existing_by_key.insert(
                    game.stable_key.clone(),
                    (
                        id.clone(),
                        game.description.clone(),
                        artwork_json,
                        game.title.clone(),
                    ),
                );
                game_ids.push(id.clone());
                new_game_ids.push(id);
            }
            upserted += 1;
        }

        Ok(UpsertResult {
            imported: upserted,
            new_game_ids,
            game_ids,
        })
    }

    pub fn create_game(&self, request: CreateGameRequest) -> Result<Game> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let sort_title = request.title.to_lowercase();
        let mut artwork = request.artwork.unwrap_or_default();
        materialize_heavy_artwork(&id, &mut artwork);
        let launch_json = serde_json::to_string(&request.launch_config)?;
        let artwork_json = serde_json::to_string(&artwork)?;
        let stable_key = format!("manual:{id}");
        let install_size_bytes =
            request
                .install_size_bytes
                .or_else(|| match &request.launch_config {
                    LaunchConfiguration::OpenFile { file_path, .. } => {
                        crate::utils::size::path_size_bytes(std::path::Path::new(file_path))
                    }
                    LaunchConfiguration::OpenApplication {
                        application_path, ..
                    } => {
                        crate::utils::size::path_size_bytes(std::path::Path::new(application_path))
                    }
                    _ => None,
                });

        {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO games (
                    id, stable_key, title, sort_title, provider, platform, source_id,
                    launch_config_json, artwork_json, favorite, hidden, date_added,
                    last_played_at, total_playtime_seconds, description,
                    install_size_bytes, achievements_json
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?8, 0, 0, ?9, NULL, 0, ?10, ?11, '[]')",
                params![
                    id,
                    stable_key,
                    request.title,
                    sort_title,
                    request.provider.as_str(),
                    request.platform.as_str(),
                    launch_json,
                    artwork_json,
                    now,
                    request.description,
                    install_size_bytes,
                ],
            )?;
        }

        self.get_game(&id)?
            .ok_or_else(|| anyhow::anyhow!("Failed to create game"))
    }

    pub fn update_game(&self, game_id: &str, request: UpdateGameRequest) -> Result<Game> {
        let existing = self
            .get_game(game_id)?
            .ok_or_else(|| anyhow::anyhow!("Game not found"))?;

        let title = request.title.unwrap_or(existing.title);
        let sort_title = title.to_lowercase();
        let description = request.description.or(existing.description);
        let mut artwork = request.artwork.unwrap_or(existing.artwork);
        materialize_heavy_artwork(game_id, &mut artwork);
        let launch_config_changed = request.launch_config.is_some();
        let launch_config = request
            .launch_config
            .unwrap_or(existing.launch_config.clone());
        let install_size_bytes = if launch_config_changed {
            install_size_for_launch(&launch_config).or(existing.install_size_bytes)
        } else {
            request.install_size_bytes.or(existing.install_size_bytes)
        };

        let launch_json = serde_json::to_string(&launch_config)?;
        let artwork_json = serde_json::to_string(&artwork)?;

        {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "UPDATE games
                 SET title = ?1,
                     sort_title = ?2,
                     description = ?3,
                     artwork_json = ?4,
                     launch_config_json = ?5,
                     install_size_bytes = ?6
                 WHERE id = ?7",
                params![
                    title,
                    sort_title,
                    description,
                    artwork_json,
                    launch_json,
                    install_size_bytes,
                    game_id,
                ],
            )?;

            // Persist user-facing property edits as overrides so re-imports don't clobber them.
            let overrides = GameOverrides {
                title: Some(title.clone()),
                description: description.clone(),
                cover: artwork.cover.clone(),
                hero: artwork.hero.clone(),
                logo: artwork.logo.clone(),
                icon: artwork.icon.clone(),
            };
            let override_json = serde_json::to_string(&overrides)?;
            conn.execute(
                "INSERT INTO user_overrides (game_id, override_json) VALUES (?1, ?2)
                 ON CONFLICT(game_id) DO UPDATE SET override_json = excluded.override_json",
                params![game_id, override_json],
            )?;
        }

        self.get_game(game_id)?
            .ok_or_else(|| anyhow::anyhow!("Game not found after update"))
    }

    pub fn toggle_favorite(&self, game_id: &str) -> Result<Game> {
        {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "UPDATE games SET favorite = CASE favorite WHEN 1 THEN 0 ELSE 1 END WHERE id = ?1",
                params![game_id],
            )?;
        }
        self.get_game(game_id)?
            .ok_or_else(|| anyhow::anyhow!("Game not found"))
    }

    pub fn set_hidden(&self, game_id: &str, hidden: bool) -> Result<Game> {
        {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "UPDATE games SET hidden = ?1 WHERE id = ?2",
                params![hidden as i64, game_id],
            )?;
        }
        self.get_game(game_id)?
            .ok_or_else(|| anyhow::anyhow!("Game not found"))
    }

    pub fn delete_game(&self, game_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            "DELETE FROM play_sessions WHERE game_id = ?1",
            params![game_id],
        )?;
        tx.execute(
            "DELETE FROM user_overrides WHERE game_id = ?1",
            params![game_id],
        )?;
        tx.execute(
            "DELETE FROM collection_games WHERE game_id = ?1",
            params![game_id],
        )?;
        let deleted = tx.execute("DELETE FROM games WHERE id = ?1", params![game_id])?;
        if deleted == 0 {
            return Err(anyhow::anyhow!("Game not found"));
        }
        tx.commit()?;
        Ok(())
    }

    pub fn clear_library(&self) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        let tx = conn.unchecked_transaction()?;
        tx.execute("DELETE FROM play_sessions", [])?;
        tx.execute("DELETE FROM user_overrides", [])?;
        tx.execute("DELETE FROM collection_games", [])?;
        let deleted = tx.execute("DELETE FROM games", [])?;
        tx.commit()?;
        Ok(deleted)
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<serde_json::Value>> {
        let conn = self.conn.lock().unwrap();
        let result: Result<String, _> = conn.query_row(
            "SELECT value_json FROM settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        );
        match result {
            Ok(json) => Ok(Some(serde_json::from_str(&json)?)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(err) => Err(err.into()),
        }
    }

    pub fn set_setting(&self, key: &str, value: &serde_json::Value) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let json = serde_json::to_string(value)?;
        conn.execute(
            "INSERT INTO settings (key, value_json) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
            params![key, json],
        )?;
        Ok(())
    }

    pub fn record_play_start(&self, session: &GameSession) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO play_sessions (id, game_id, provider, pid, started_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                session.id,
                session.game_id,
                session.provider.as_str(),
                session.pid.map(|pid| pid as i64),
                session.started_at,
            ],
        )?;
        Ok(())
    }

    pub fn record_play_end(&self, session: &GameSession) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE play_sessions
             SET ended_at = ?1, exit_code = ?2, stop_reason = ?3, duration_seconds = ?4
             WHERE id = ?5",
            params![
                session.ended_at,
                session.exit_code,
                session.stop_reason.as_ref().map(SessionStopReason::as_str),
                session.duration_seconds,
                session.id,
            ],
        )?;

        if let Some(duration) = session.duration_seconds {
            if duration > 0 {
                conn.execute(
                    "UPDATE games
                     SET last_played_at = ?1,
                         total_playtime_seconds = total_playtime_seconds + ?2
                     WHERE id = ?3",
                    params![session.ended_at, duration, session.game_id],
                )?;
            }
        }
        Ok(())
    }
}

fn apply_overrides(conn: &Connection, game: &mut Game) -> Result<()> {
    let json: Result<String, _> = conn.query_row(
        "SELECT override_json FROM user_overrides WHERE game_id = ?1",
        params![game.id],
        |row| row.get(0),
    );
    let Ok(json) = json else {
        return Ok(());
    };
    let overrides: GameOverrides = serde_json::from_str(&json)?;
    apply_override_values(game, &overrides);
    Ok(())
}

fn apply_override_values(game: &mut Game, overrides: &GameOverrides) {
    if let Some(title) = overrides.title.clone() {
        game.sort_title = title.to_lowercase();
        game.title = title;
    }
    if overrides.description.is_some() {
        game.description = overrides.description.clone();
    }
    if overrides.cover.is_some() {
        game.artwork.cover = overrides.cover.clone();
    }
    if overrides.hero.is_some() {
        game.artwork.hero = overrides.hero.clone();
    }
    if overrides.logo.is_some() {
        game.artwork.logo = overrides.logo.clone();
    }
    if overrides.icon.is_some() {
        game.artwork.icon = overrides.icon.clone();
    }
}

fn load_all_overrides(conn: &Connection) -> Result<HashMap<String, GameOverrides>> {
    let mut stmt = conn.prepare("SELECT game_id, override_json FROM user_overrides")?;
    let rows = stmt.query_map([], |row| {
        let game_id: String = row.get(0)?;
        let json: String = row.get(1)?;
        Ok((game_id, json))
    })?;
    let mut map = HashMap::new();
    for row in rows {
        let (game_id, json) = row?;
        if let Ok(overrides) = serde_json::from_str::<GameOverrides>(&json) {
            map.insert(game_id, overrides);
        }
    }
    Ok(map)
}

type ExistingGameRow = (String, Option<String>, String, String);

fn load_existing_by_stable_key(conn: &Connection) -> Result<HashMap<String, ExistingGameRow>> {
    let mut stmt =
        conn.prepare("SELECT stable_key, id, description, artwork_json, title FROM games")?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            (
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ),
        ))
    })?;
    let mut map = HashMap::new();
    for row in rows {
        let (stable_key, existing) = row?;
        map.insert(stable_key, existing);
    }
    Ok(map)
}

fn lighten_artwork_slot(slot: Option<String>) -> Option<String> {
    match slot {
        Some(value) if is_heavy_base64_data_url(&value) => None,
        other => other,
    }
}

/// Drop huge inline base64 artwork from list payloads; keep file paths and small refs.
fn lighten_artwork(artwork: &mut GameArtwork) {
    artwork.cover = lighten_artwork_slot(artwork.cover.take());
    artwork.hero = lighten_artwork_slot(artwork.hero.take());
    artwork.logo = lighten_artwork_slot(artwork.logo.take());
    artwork.icon = lighten_artwork_slot(artwork.icon.take());
}

fn materialize_override_artwork(game_id: &str, overrides: &mut GameOverrides) -> bool {
    let mut artwork = GameArtwork {
        cover: overrides.cover.clone(),
        hero: overrides.hero.clone(),
        logo: overrides.logo.clone(),
        icon: overrides.icon.clone(),
    };
    if !materialize_heavy_artwork(game_id, &mut artwork) {
        return false;
    }
    overrides.cover = artwork.cover;
    overrides.hero = artwork.hero;
    overrides.logo = artwork.logo;
    overrides.icon = artwork.icon;
    true
}

fn persist_artwork_json(conn: &Connection, game_id: &str, artwork: &GameArtwork) -> Result<()> {
    let artwork_json = serde_json::to_string(artwork)?;
    conn.execute(
        "UPDATE games SET artwork_json = ?1 WHERE id = ?2",
        params![artwork_json, game_id],
    )?;
    Ok(())
}

fn persist_override_json(
    conn: &Connection,
    game_id: &str,
    overrides: &GameOverrides,
) -> Result<()> {
    let override_json = serde_json::to_string(overrides)?;
    conn.execute(
        "INSERT INTO user_overrides (game_id, override_json) VALUES (?1, ?2)
         ON CONFLICT(game_id) DO UPDATE SET override_json = excluded.override_json",
        params![game_id, override_json],
    )?;
    Ok(())
}

fn install_size_for_launch(config: &LaunchConfiguration) -> Option<i64> {
    match config {
        LaunchConfiguration::OpenFile { file_path, .. } => {
            crate::utils::size::path_size_bytes(Path::new(file_path))
        }
        LaunchConfiguration::OpenApplication {
            application_path, ..
        } => crate::utils::size::path_size_bytes(Path::new(application_path)),
        LaunchConfiguration::Gamehub {
            shortcut_app_path, ..
        } => crate::utils::size::path_size_bytes(Path::new(shortcut_app_path)),
        _ => None,
    }
}

fn map_game_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Game> {
    let launch_config_json: String = row.get(6)?;
    let artwork_json: String = row.get(7)?;
    let provider: String = row.get(3)?;
    let platform: String = row.get(4)?;
    let achievements_json: String = row.get(15).unwrap_or_else(|_| "[]".into());

    Ok(Game {
        id: row.get(0)?,
        title: row.get(1)?,
        sort_title: row.get(2)?,
        provider: GameProvider::parse(&provider),
        platform: GamePlatform::parse(&platform),
        source_id: row.get(5)?,
        launch_config: serde_json::from_str(&launch_config_json).unwrap_or(
            LaunchConfiguration::OpenUrl {
                url: "https://example.com".into(),
            },
        ),
        artwork: serde_json::from_str(&artwork_json).unwrap_or_default(),
        favorite: row.get::<_, i64>(8)? != 0,
        hidden: row.get::<_, i64>(9)? != 0,
        date_added: row.get(10)?,
        last_played_at: row.get(11)?,
        total_playtime_seconds: row.get(12)?,
        description: row.get(13)?,
        install_size_bytes: row.get(14)?,
        achievements: serde_json::from_str(&achievements_json).unwrap_or_default(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn heavy_data_url() -> String {
        format!(
            "data:image/png;base64,{}",
            "A".repeat(crate::services::artwork::MAX_INLINE_ARTWORK_CHARS + 64)
        )
    }

    fn sample_imported(stable_key: &str, title: &str) -> ImportedGame {
        ImportedGame {
            stable_key: stable_key.into(),
            title: title.into(),
            sort_title: title.to_lowercase(),
            description: Some("desc".into()),
            provider: GameProvider::Manual,
            platform: GamePlatform::Macos,
            source_id: None,
            launch_config: LaunchConfiguration::OpenUrl {
                url: "https://example.com".into(),
            },
            artwork: GameArtwork::default(),
            total_playtime_seconds: 0,
            install_size_bytes: None,
            achievements: vec![],
        }
    }

    #[test]
    fn list_games_materializes_heavy_base64_to_cache_paths() {
        let repo = GameRepository::open_in_memory().expect("db");
        let heavy = heavy_data_url();
        let path = "/tmp/orbit-cache/cover.png".to_string();

        let game = repo
            .create_game(CreateGameRequest {
                title: "Portal".into(),
                description: None,
                provider: GameProvider::Manual,
                platform: GamePlatform::Macos,
                launch_config: LaunchConfiguration::OpenUrl {
                    url: "https://example.com".into(),
                },
                artwork: Some(GameArtwork {
                    cover: Some(heavy.clone()),
                    hero: Some(path.clone()),
                    logo: None,
                    icon: Some(heavy.clone()),
                }),
                install_size_bytes: None,
            })
            .expect("create");

        let listed = repo.list_games().expect("list");
        assert_eq!(listed.len(), 1);
        let listed_cover = listed[0].artwork.cover.as_deref().expect("cover path");
        let listed_icon = listed[0].artwork.icon.as_deref().expect("icon path");
        assert!(!listed_cover.starts_with("data:"));
        assert!(!listed_icon.starts_with("data:"));
        assert!(std::path::Path::new(listed_cover).is_file());
        assert!(std::path::Path::new(listed_icon).is_file());
        assert_eq!(listed[0].artwork.hero.as_deref(), Some(path.as_str()));

        let detail = repo.get_game(&game.id).expect("get").expect("exists");
        assert_eq!(detail.artwork.cover.as_deref(), Some(listed_cover));
        assert_eq!(detail.artwork.hero.as_deref(), Some(path.as_str()));
        assert_eq!(detail.artwork.icon.as_deref(), Some(listed_icon));

        if let Some(parent) = std::path::Path::new(listed_cover).parent() {
            let _ = std::fs::remove_dir_all(parent);
        }
    }

    #[test]
    fn list_games_applies_batched_overrides() {
        let repo = GameRepository::open_in_memory().expect("db");
        let a = repo
            .create_game(CreateGameRequest {
                title: "Alpha".into(),
                description: Some("base".into()),
                provider: GameProvider::Manual,
                platform: GamePlatform::Macos,
                launch_config: LaunchConfiguration::OpenUrl {
                    url: "https://example.com/a".into(),
                },
                artwork: None,
                install_size_bytes: None,
            })
            .expect("create a");
        let b = repo
            .create_game(CreateGameRequest {
                title: "Beta".into(),
                description: None,
                provider: GameProvider::Manual,
                platform: GamePlatform::Macos,
                launch_config: LaunchConfiguration::OpenUrl {
                    url: "https://example.com/b".into(),
                },
                artwork: None,
                install_size_bytes: None,
            })
            .expect("create b");

        {
            let conn = repo.conn.lock().unwrap();
            let override_a = serde_json::to_string(&GameOverrides {
                title: Some("Alpha Renamed".into()),
                description: Some("overridden".into()),
                cover: Some("/cache/a.png".into()),
                ..Default::default()
            })
            .unwrap();
            let override_b = serde_json::to_string(&GameOverrides {
                title: Some("Beta Renamed".into()),
                ..Default::default()
            })
            .unwrap();
            conn.execute(
                "INSERT INTO user_overrides (game_id, override_json) VALUES (?1, ?2)",
                params![a.id, override_a],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO user_overrides (game_id, override_json) VALUES (?1, ?2)",
                params![b.id, override_b],
            )
            .unwrap();
        }

        let listed = repo.list_games().expect("list");
        let by_id: HashMap<_, _> = listed.into_iter().map(|g| (g.id.clone(), g)).collect();
        assert_eq!(by_id[&a.id].title, "Alpha Renamed");
        assert_eq!(by_id[&a.id].description.as_deref(), Some("overridden"));
        assert_eq!(by_id[&a.id].artwork.cover.as_deref(), Some("/cache/a.png"));
        assert_eq!(by_id[&b.id].title, "Beta Renamed");
    }

    #[test]
    fn upsert_imported_batches_existing_stable_keys() {
        let repo = GameRepository::open_in_memory().expect("db");
        let first = sample_imported("manual:one", "One");
        let second = sample_imported("manual:two", "Two");

        let insert = repo
            .upsert_imported(&[first.clone(), second.clone()])
            .expect("insert");
        assert_eq!(insert.imported, 2);
        assert_eq!(insert.new_game_ids.len(), 2);

        let mut updated_one = first;
        updated_one.title = "One Updated".into();
        updated_one.sort_title = "one updated".into();
        updated_one.description = Some("new desc".into());

        let update = repo
            .upsert_imported(&[updated_one, sample_imported("manual:three", "Three")])
            .expect("update");
        assert_eq!(update.imported, 2);
        assert_eq!(update.new_game_ids.len(), 1);

        let games = repo.list_games().expect("list");
        assert_eq!(games.len(), 3);
        let one = games
            .iter()
            .find(|g| g.title == "One Updated")
            .expect("updated title");
        // Non-placeholder existing description is preserved.
        assert_eq!(one.description.as_deref(), Some("desc"));
    }

    #[test]
    fn lighten_artwork_keeps_small_data_urls() {
        let mut artwork = GameArtwork {
            cover: Some("data:image/png;base64,abc".into()),
            hero: Some(heavy_data_url()),
            logo: Some("/path/logo.png".into()),
            icon: None,
        };
        lighten_artwork(&mut artwork);
        assert_eq!(artwork.cover.as_deref(), Some("data:image/png;base64,abc"));
        assert!(artwork.hero.is_none());
        assert_eq!(artwork.logo.as_deref(), Some("/path/logo.png"));
    }

    fn sample_create(title: &str) -> CreateGameRequest {
        CreateGameRequest {
            title: title.into(),
            description: Some(format!("{title} desc")),
            provider: GameProvider::Manual,
            platform: GamePlatform::Macos,
            launch_config: LaunchConfiguration::OpenUrl {
                url: format!("https://example.com/{title}"),
            },
            artwork: None,
            install_size_bytes: None,
        }
    }

    #[test]
    fn create_get_update_delete_game_round_trip() {
        let repo = GameRepository::open_in_memory().expect("db");
        let created = repo.create_game(sample_create("Celeste")).expect("create");
        assert_eq!(created.title, "Celeste");
        assert_eq!(created.sort_title, "celeste");
        assert!(!created.favorite);
        assert!(!created.hidden);
        assert_eq!(created.total_playtime_seconds, 0);

        let fetched = repo.get_game(&created.id).expect("get").expect("exists");
        assert_eq!(fetched.id, created.id);
        assert_eq!(fetched.description.as_deref(), Some("Celeste desc"));

        let updated = repo
            .update_game(
                &created.id,
                UpdateGameRequest {
                    title: Some("Celeste Remastered".into()),
                    description: Some("updated desc".into()),
                    artwork: Some(GameArtwork {
                        cover: Some("/covers/celeste.png".into()),
                        ..Default::default()
                    }),
                    ..Default::default()
                },
            )
            .expect("update");
        assert_eq!(updated.title, "Celeste Remastered");
        assert_eq!(updated.sort_title, "celeste remastered");
        assert_eq!(updated.description.as_deref(), Some("updated desc"));
        assert_eq!(
            updated.artwork.cover.as_deref(),
            Some("/covers/celeste.png")
        );

        repo.delete_game(&created.id).expect("delete");
        assert!(repo
            .get_game(&created.id)
            .expect("get after delete")
            .is_none());
        assert!(repo.delete_game(&created.id).is_err());
    }

    #[test]
    fn toggle_favorite_and_set_hidden() {
        let repo = GameRepository::open_in_memory().expect("db");
        let game = repo.create_game(sample_create("Hades")).expect("create");
        assert!(!game.favorite);
        assert!(!game.hidden);

        let favorited = repo.toggle_favorite(&game.id).expect("favorite on");
        assert!(favorited.favorite);
        let unfavorited = repo.toggle_favorite(&game.id).expect("favorite off");
        assert!(!unfavorited.favorite);

        let hidden = repo.set_hidden(&game.id, true).expect("hide");
        assert!(hidden.hidden);
        let shown = repo.set_hidden(&game.id, false).expect("unhide");
        assert!(!shown.hidden);
    }

    #[test]
    fn record_play_session_updates_total_playtime() {
        let repo = GameRepository::open_in_memory().expect("db");
        let game = repo
            .create_game(sample_create("Hollow Knight"))
            .expect("create");
        assert_eq!(game.total_playtime_seconds, 0);
        assert!(game.last_played_at.is_none());

        let session = GameSession {
            id: Uuid::new_v4().to_string(),
            game_id: game.id.clone(),
            provider: GameProvider::Manual,
            pid: Some(4242),
            started_at: "2026-01-01T10:00:00Z".into(),
            ended_at: None,
            exit_code: None,
            stop_reason: None,
            duration_seconds: None,
        };
        repo.record_play_start(&session).expect("start");

        let ended = GameSession {
            ended_at: Some("2026-01-01T10:05:00Z".into()),
            exit_code: Some(0),
            stop_reason: Some(SessionStopReason::ProcessExited),
            duration_seconds: Some(300),
            ..session
        };
        repo.record_play_end(&ended).expect("end");

        let after = repo.get_game(&game.id).expect("get").expect("exists");
        assert_eq!(after.total_playtime_seconds, 300);
        assert_eq!(
            after.last_played_at.as_deref(),
            Some("2026-01-01T10:05:00Z")
        );

        let second = GameSession {
            id: Uuid::new_v4().to_string(),
            game_id: game.id.clone(),
            provider: GameProvider::Manual,
            pid: None,
            started_at: "2026-01-02T10:00:00Z".into(),
            ended_at: Some("2026-01-02T10:02:00Z".into()),
            exit_code: Some(0),
            stop_reason: Some(SessionStopReason::UserStopped),
            duration_seconds: Some(120),
        };
        repo.record_play_start(&second).expect("start 2");
        repo.record_play_end(&second).expect("end 2");

        let after_second = repo.get_game(&game.id).expect("get").expect("exists");
        assert_eq!(after_second.total_playtime_seconds, 420);
        assert_eq!(
            after_second.last_played_at.as_deref(),
            Some("2026-01-02T10:02:00Z")
        );
    }

    #[test]
    fn clear_library_removes_all_games() {
        let repo = GameRepository::open_in_memory().expect("db");
        let a = repo.create_game(sample_create("A")).expect("create a");
        let b = repo.create_game(sample_create("B")).expect("create b");
        repo.toggle_favorite(&a.id).expect("favorite");

        let session = GameSession {
            id: Uuid::new_v4().to_string(),
            game_id: b.id.clone(),
            provider: GameProvider::Manual,
            pid: None,
            started_at: "2026-01-01T00:00:00Z".into(),
            ended_at: None,
            exit_code: None,
            stop_reason: None,
            duration_seconds: None,
        };
        repo.record_play_start(&session).expect("session");

        let deleted = repo.clear_library().expect("clear");
        assert_eq!(deleted, 2);
        assert!(repo.list_games().expect("list").is_empty());
        assert!(repo.get_game(&a.id).expect("get a").is_none());
        assert!(repo.get_game(&b.id).expect("get b").is_none());

        let deleted_again = repo.clear_library().expect("clear empty");
        assert_eq!(deleted_again, 0);
    }
}
