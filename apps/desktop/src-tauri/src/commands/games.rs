use tauri::State;

use crate::models::{CreateGameRequest, Game, UpdateGameRequest};
use crate::AppState;

#[tauri::command]
pub fn list_games(state: State<'_, AppState>) -> Result<Vec<Game>, String> {
    state.repo.list_games().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn get_game(state: State<'_, AppState>, game_id: String) -> Result<Option<Game>, String> {
    state.repo.get_game(&game_id).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn create_game(state: State<'_, AppState>, request: CreateGameRequest) -> Result<Game, String> {
    validate_runtime_config(&request.launch_config)?;
    state
        .repo
        .create_game(request)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn update_game(
    state: State<'_, AppState>,
    game_id: String,
    request: UpdateGameRequest,
) -> Result<Game, String> {
    if request.launch_config.is_some()
        && (state.sessions.is_launching()
            || state
                .sessions
                .get_active()
                .is_some_and(|s| s.game_id == game_id))
    {
        return Err("Stop the game before changing its launch configuration".into());
    }
    let mut request = request;
    if let Some(config) = request.launch_config.take() {
        let game = state
            .repo
            .get_game(&game_id)
            .map_err(|err| err.to_string())?
            .ok_or("Game not found")?;
        let config = with_play_wine(
            &game,
            config,
            crate::services::steam_windows::play_wine_binary(&state.repo),
        );
        validate_runtime_config(&config)?;
        request.launch_config = Some(config);
    }
    state
        .repo
        .update_game(&game_id, request)
        .map_err(|err| err.to_string())
}

/// A Windows Steam game always plays with Orbit's current play Wine (Play
/// replaces the stored one), so a saved path that has since moved, such as an
/// older Orbit Wine layout, must not block saving its launch settings.
fn with_play_wine(
    game: &Game,
    config: crate::models::LaunchConfiguration,
    play_wine: Option<std::path::PathBuf>,
) -> crate::models::LaunchConfiguration {
    use crate::models::{GamePlatform, GameProvider, LaunchConfiguration};
    match (config, play_wine) {
        (LaunchConfiguration::Wine { mut profile }, Some(wine))
            if game.provider == GameProvider::Steam && game.platform == GamePlatform::Windows =>
        {
            profile.runtime_path = wine.to_string_lossy().into_owned();
            LaunchConfiguration::Wine { profile }
        }
        (config, _) => config,
    }
}

#[tauri::command]
pub fn toggle_favorite(state: State<'_, AppState>, game_id: String) -> Result<Game, String> {
    state
        .repo
        .toggle_favorite(&game_id)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn set_game_hidden(
    state: State<'_, AppState>,
    game_id: String,
    hidden: bool,
) -> Result<Game, String> {
    state
        .repo
        .set_hidden(&game_id, hidden)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn delete_game(state: State<'_, AppState>, game_id: String) -> Result<(), String> {
    if state.sessions.is_launching() {
        return Err("Wait for the game launch to finish or cancel it first".into());
    }
    if state
        .sessions
        .get_active()
        .is_some_and(|session| session.game_id == game_id)
    {
        return Err("Stop the active game before removing it from Orbit".into());
    }
    state
        .repo
        .delete_game(&game_id)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn clear_library(state: State<'_, AppState>) -> Result<usize, String> {
    if state.sessions.is_launching() || state.sessions.get_active().is_some() {
        return Err("Stop the active game before clearing the library".into());
    }
    state.repo.clear_library().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn get_setting(
    state: State<'_, AppState>,
    key: String,
) -> Result<Option<serde_json::Value>, String> {
    state.repo.get_setting(&key).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn set_setting(
    state: State<'_, AppState>,
    key: String,
    value: serde_json::Value,
) -> Result<(), String> {
    state
        .repo
        .set_setting(&key, &value)
        .map_err(|err| err.to_string())
}

fn validate_runtime_config(config: &crate::models::LaunchConfiguration) -> Result<(), String> {
    if let crate::models::LaunchConfiguration::Wine { profile } = config {
        profile.validate_options().map_err(|e| e.to_string())?;
        crate::runtimes::validation::windows_executable(std::path::Path::new(&profile.executable))
            .map_err(|e| format!("The game’s executable can’t be used ({e:#})"))?;
        let path =
            crate::runtimes::validation::absolute_file(std::path::Path::new(&profile.runtime_path))
                .map_err(|e| format!("This game’s Wine can’t be used ({e:#})"))?;
        if !path
            .file_name()
            .is_some_and(|n| n == "wine" || n == "wine64")
        {
            return Err("Choose a Wine executable".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{GameArtwork, GamePlatform, GameProvider, LaunchConfiguration};

    fn game(provider: GameProvider, runtime: &str) -> Game {
        Game {
            id: "g1".into(),
            title: "God of War".into(),
            sort_title: "god of war".into(),
            description: None,
            provider,
            platform: GamePlatform::Windows,
            source_id: Some("1593500".into()),
            launch_config: wine(runtime),
            artwork: GameArtwork::default(),
            favorite: false,
            hidden: false,
            date_added: String::new(),
            last_played_at: None,
            total_playtime_seconds: 0,
            install_size_bytes: None,
            achievements: Vec::new(),
        }
    }

    fn wine(runtime: &str) -> LaunchConfiguration {
        LaunchConfiguration::Wine {
            profile: crate::runtimes::WineProfile {
                executable: "/Games/GodOfWar/GoW.exe".into(),
                runtime_path: runtime.into(),
                ..Default::default()
            },
        }
    }

    fn runtime_of(config: &LaunchConfiguration) -> &str {
        match config {
            LaunchConfiguration::Wine { profile } => &profile.runtime_path,
            _ => panic!("not a Wine launch"),
        }
    }

    #[test]
    fn a_steam_game_saves_with_the_current_play_wine() {
        // Regression: God of War kept .../orbit-wine/26.3.0/bin/wine after Orbit
        // Wine became an app bundle, and every settings save was refused.
        let stale = "/Orbit/orbit-wine/26.3.0/bin/wine";
        let play = std::path::PathBuf::from("/Orbit/Orbit Wine.app/Contents/MacOS/wine");
        let steam = game(GameProvider::Steam, stale);
        let saved = with_play_wine(&steam, wine(stale), Some(play.clone()));
        assert_eq!(runtime_of(&saved), play.to_str().unwrap());
        assert_eq!(
            runtime_of(&with_play_wine(&steam, wine(stale), None)),
            stale
        );
        let manual = game(GameProvider::Manual, "/Wine/bin/wine");
        assert_eq!(
            runtime_of(&with_play_wine(&manual, wine("/Wine/bin/wine"), Some(play))),
            "/Wine/bin/wine"
        );
    }
}
