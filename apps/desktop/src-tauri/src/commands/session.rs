use tauri::{AppHandle, State};

use crate::models::GameSession;
use crate::AppState;

#[tauri::command]
pub fn launch_game(
    app: AppHandle,
    state: State<'_, AppState>,
    game_id: String,
) -> Result<GameSession, String> {
    let game = state
        .repo
        .get_game(&game_id)
        .map_err(|err| err.to_string())?
        .ok_or_else(|| "Game not found".to_string())?;

    state
        .sessions
        .launch_game(&app, &state.repo, &game)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn stop_game(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
) -> Result<GameSession, String> {
    state
        .sessions
        .stop_game(&app, &state.repo, &session_id)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn get_active_session(state: State<'_, AppState>) -> Option<GameSession> {
    state.sessions.get_active()
}
