use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use std::path::Path;
use std::sync::Mutex;
use uuid::Uuid;

use crate::database::migrations::run_migrations;
use crate::models::{
    Achievement, CreateGameRequest, Game, GameArtwork, GameOverrides, GamePlatform, GameProvider,
    GameSession, ImportedGame, LaunchConfiguration, SessionStopReason, UpdateGameRequest,
};

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
        for game in &mut games {
            apply_overrides(&conn, game)?;
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

    pub fn upsert_imported(&self, imported: &[ImportedGame]) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        let mut upserted = 0usize;
        let now = chrono::Utc::now().to_rfc3339();

        for game in imported {
            let existing: Option<(String, Option<String>)> = conn
                .query_row(
                    "SELECT id, description FROM games WHERE stable_key = ?1",
                    params![game.stable_key],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .ok();

            let launch_json = serde_json::to_string(&game.launch_config)?;
            let artwork_json = serde_json::to_string(&game.artwork)?;
            let achievements_json = serde_json::to_string(&game.achievements)?;

            if let Some((id, existing_description)) = existing {
                // Preserve user description overrides when already set via overrides table;
                // still refresh importer metadata / playtime / size / achievements.
                let description = existing_description
                    .filter(|d| !d.is_empty())
                    .or_else(|| game.description.clone());

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
            }
            upserted += 1;
        }

        Ok(upserted)
    }

    pub fn create_game(&self, request: CreateGameRequest) -> Result<Game> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let sort_title = request.title.to_lowercase();
        let artwork = request.artwork.unwrap_or_default();
        let launch_json = serde_json::to_string(&request.launch_config)?;
        let artwork_json = serde_json::to_string(&artwork)?;
        let stable_key = format!("manual:{id}");
        let install_size_bytes = request.install_size_bytes.or_else(|| {
            match &request.launch_config {
                LaunchConfiguration::OpenFile { file_path, .. } => {
                    crate::utils::size::path_size_bytes(std::path::Path::new(file_path))
                }
                LaunchConfiguration::OpenApplication {
                    application_path, ..
                } => crate::utils::size::path_size_bytes(std::path::Path::new(application_path)),
                _ => None,
            }
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
        let artwork = request.artwork.unwrap_or(existing.artwork);
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
        tx.execute("DELETE FROM play_sessions WHERE game_id = ?1", params![game_id])?;
        tx.execute("DELETE FROM user_overrides WHERE game_id = ?1", params![game_id])?;
        tx.execute("DELETE FROM collection_games WHERE game_id = ?1", params![game_id])?;
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
                session
                    .stop_reason
                    .as_ref()
                    .map(SessionStopReason::as_str),
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

    fn seed_mock_games_if_empty(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let count: i64 =
            conn.query_row("SELECT COUNT(*) FROM games", [], |row| row.get(0))?;
        if count > 0 {
            return Ok(());
        }

        let now = chrono::Utc::now().to_rfc3339();
        let mocks = mock_games(&now);
        for game in mocks {
            let launch_json = serde_json::to_string(&game.launch_config)?;
            let artwork_json = serde_json::to_string(&game.artwork)?;
            let achievements_json = serde_json::to_string(&game.achievements)?;
            let stable_key = format!("{}:{}", game.provider.as_str(), game.id);
            conn.execute(
                "INSERT INTO games (
                    id, stable_key, title, sort_title, provider, platform, source_id,
                    launch_config_json, artwork_json, favorite, hidden, date_added,
                    last_played_at, total_playtime_seconds, description,
                    install_size_bytes, achievements_json
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
                params![
                    game.id,
                    stable_key,
                    game.title,
                    game.sort_title,
                    game.provider.as_str(),
                    game.platform.as_str(),
                    game.source_id,
                    launch_json,
                    artwork_json,
                    game.favorite as i64,
                    game.hidden as i64,
                    game.date_added,
                    game.last_played_at,
                    game.total_playtime_seconds,
                    game.description,
                    game.install_size_bytes,
                    achievements_json,
                ],
            )?;
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
    if let Some(title) = overrides.title {
        game.sort_title = title.to_lowercase();
        game.title = title;
    }
    if overrides.description.is_some() {
        game.description = overrides.description;
    }
    if overrides.cover.is_some() {
        game.artwork.cover = overrides.cover;
    }
    if overrides.hero.is_some() {
        game.artwork.hero = overrides.hero;
    }
    if overrides.logo.is_some() {
        game.artwork.logo = overrides.logo;
    }
    if overrides.icon.is_some() {
        game.artwork.icon = overrides.icon;
    }
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
        LaunchConfiguration::Gamehub { shortcut_app_path, .. } => {
            crate::utils::size::path_size_bytes(Path::new(shortcut_app_path))
        }
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

fn mock_games(now: &str) -> Vec<Game> {
    vec![
        Game {
            id: "mock-astris-zelda".into(),
            title: "The Legend of Zelda: Tears of the Kingdom".into(),
            sort_title: "legend of zelda tears of the kingdom".into(),
            description: Some(
                "An epic adventure across the vast lands and skies of Hyrule.".into(),
            ),
            provider: GameProvider::Astris,
            platform: GamePlatform::NintendoSwitch,
            source_id: Some("0100F2C0115B6000".into()),
            launch_config: LaunchConfiguration::OpenUrl {
                url: "https://www.nintendo.com/us/store/products/the-legend-of-zelda-tears-of-the-kingdom-switch/".into(),
            },
            artwork: GameArtwork::default(),
            favorite: true,
            hidden: false,
            date_added: now.to_string(),
            last_played_at: Some(now.to_string()),
            total_playtime_seconds: 42_300,
            install_size_bytes: Some(16_000_000_000),
            achievements: Vec::new(),
        },
        Game {
            id: "mock-astris-mario".into(),
            title: "Super Mario Odyssey".into(),
            sort_title: "super mario odyssey".into(),
            description: Some("Join Mario on a massive, globe-trotting 3D adventure.".into()),
            provider: GameProvider::Astris,
            platform: GamePlatform::NintendoSwitch,
            source_id: Some("0100000000010000".into()),
            launch_config: LaunchConfiguration::OpenUrl {
                url: "https://www.nintendo.com/us/store/products/super-mario-odyssey-switch/".into(),
            },
            artwork: GameArtwork::default(),
            favorite: false,
            hidden: false,
            date_added: now.to_string(),
            last_played_at: None,
            total_playtime_seconds: 0,
            install_size_bytes: Some(5_700_000_000),
            achievements: Vec::new(),
        },
        Game {
            id: "mock-steam-hades".into(),
            title: "Hades".into(),
            sort_title: "hades".into(),
            description: Some(
                "Defy the god of the dead as you hack and slash out of the Underworld.".into(),
            ),
            provider: GameProvider::Steam,
            platform: GamePlatform::Macos,
            source_id: Some("1145360".into()),
            launch_config: LaunchConfiguration::Steam {
                app_id: "1145360".into(),
            },
            artwork: GameArtwork::default(),
            favorite: true,
            hidden: false,
            date_added: now.to_string(),
            last_played_at: Some(now.to_string()),
            total_playtime_seconds: 18_600,
            install_size_bytes: Some(15_000_000_000),
            achievements: vec![
                Achievement {
                    id: "escaped".into(),
                    name: "The first escape".into(),
                    description: Some("Escape the Underworld.".into()),
                    unlocked: true,
                    unlocked_at: Some(now.to_string()),
                    icon: None,
                },
                Achievement {
                    id: "weapon-master".into(),
                    name: "Weapon Master".into(),
                    description: Some("Clear with every weapon.".into()),
                    unlocked: false,
                    unlocked_at: None,
                    icon: None,
                },
            ],
        },
        Game {
            id: "mock-steam-celeste".into(),
            title: "Celeste".into(),
            sort_title: "celeste".into(),
            description: Some(
                "Help Madeline survive her inner demons on her journey to the top of Celeste Mountain."
                    .into(),
            ),
            provider: GameProvider::Steam,
            platform: GamePlatform::Macos,
            source_id: Some("504230".into()),
            launch_config: LaunchConfiguration::Steam {
                app_id: "504230".into(),
            },
            artwork: GameArtwork::default(),
            favorite: false,
            hidden: false,
            date_added: now.to_string(),
            last_played_at: None,
            total_playtime_seconds: 7_200,
            install_size_bytes: Some(1_200_000_000),
            achievements: vec![Achievement {
                id: "summit".into(),
                name: "Summit".into(),
                description: Some("Climb to the top.".into()),
                unlocked: true,
                unlocked_at: Some(now.to_string()),
                icon: None,
            }],
        },
        Game {
            id: "mock-native-chess".into(),
            title: "Chess".into(),
            sort_title: "chess".into(),
            description: Some("Classic Apple Chess.".into()),
            provider: GameProvider::Native,
            platform: GamePlatform::Macos,
            source_id: Some("com.apple.Chess".into()),
            launch_config: LaunchConfiguration::OpenApplication {
                application_path: "/System/Applications/Chess.app".into(),
                arguments: None,
            },
            artwork: GameArtwork::default(),
            favorite: false,
            hidden: false,
            date_added: now.to_string(),
            last_played_at: Some(now.to_string()),
            total_playtime_seconds: 1_200,
            install_size_bytes: Some(50_000_000),
            achievements: Vec::new(),
        },
        Game {
            id: "mock-gamehub-sample".into(),
            title: "GameHub Sample".into(),
            sort_title: "gamehub sample".into(),
            description: Some("Sample Windows executable mapped through GameHub.".into()),
            provider: GameProvider::Gamehub,
            platform: GamePlatform::Macos,
            source_id: Some("/Users/me/Applications/GameHub Sample.app".into()),
            launch_config: LaunchConfiguration::Gamehub {
                gamehub_app_path: "/Applications/GameHub.app".into(),
                shortcut_app_path: "/Users/me/Applications/GameHub Sample.app".into(),
            },
            artwork: GameArtwork::default(),
            favorite: false,
            hidden: false,
            date_added: now.to_string(),
            last_played_at: None,
            total_playtime_seconds: 0,
            install_size_bytes: Some(2_000_000_000),
            achievements: Vec::new(),
        },
        Game {
            id: "mock-manual-orbit-demo".into(),
            title: "Orbit Demo".into(),
            sort_title: "orbit demo".into(),
            description: Some("A manually curated Orbit demo entry.".into()),
            provider: GameProvider::Manual,
            platform: GamePlatform::Macos,
            source_id: None,
            launch_config: LaunchConfiguration::OpenUrl {
                url: "https://example.com".into(),
            },
            artwork: GameArtwork::default(),
            favorite: true,
            hidden: false,
            date_added: now.to_string(),
            last_played_at: None,
            total_playtime_seconds: 300,
            install_size_bytes: Some(120_000_000),
            achievements: Vec::new(),
        },
    ]
}
