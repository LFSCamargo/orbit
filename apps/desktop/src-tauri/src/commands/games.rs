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
    if let Some(config) = &request.launch_config {
        validate_runtime_config(config)?;
    }
    state
        .repo
        .update_game(&game_id, request)
        .map_err(|err| err.to_string())
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
            .map_err(|e| format!("{e:#}"))?;
        let path =
            crate::runtimes::validation::absolute_file(std::path::Path::new(&profile.runtime_path))
                .map_err(|e| e.to_string())?;
        if !path
            .file_name()
            .is_some_and(|n| n == "wine" || n == "wine64")
        {
            return Err("Choose a Wine executable".into());
        }
    }
    Ok(())
}
