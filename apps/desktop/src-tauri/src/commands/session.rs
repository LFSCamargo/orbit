use tauri::{AppHandle, State};

use crate::models::GameSession;
use crate::AppState;

#[tauri::command]
pub async fn launch_game(app: AppHandle, game_id: String) -> Result<GameSession, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        let state = app.state::<AppState>();
        state.steam_library_sync.cancel();
        let game = state
            .repo
            .get_game(&game_id)
            .map_err(|e| e.to_string())?
            .ok_or("Game not found")?;
        state
            .sessions
            .launch_game(&app, &state.repo, &game)
            .map_err(|e| format!("{e:#}"))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn stop_game(app: AppHandle, session_id: String) -> Result<GameSession, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        let state = app.state::<AppState>();
        state
            .sessions
            .stop_game(&app, &state.repo, &session_id)
            .map_err(|e| format!("{e:#}"))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn cancel_game_launch(state: State<'_, AppState>) {
    state.sessions.cancel_launch();
}

#[tauri::command]
pub fn get_active_session(state: State<'_, AppState>) -> Option<GameSession> {
    state.sessions.get_active()
}
