use tauri::{AppHandle, State};

use crate::services::game_compression::job::{self, CompressionStatus};
use crate::AppState;

/// Whether game compression is on, and the job applying it, if any.
#[tauri::command]
pub fn get_game_compression(state: State<'_, AppState>) -> CompressionStatus {
    job::status(&state.repo)
}

/// Turns game compression on (compress every game) or off (decompress every
/// game). Returns at once; progress arrives as `game-compression-progress`.
#[tauri::command]
pub fn set_game_compression(app: AppHandle, enabled: bool) -> Result<CompressionStatus, String> {
    job::set_enabled(&app, enabled)
}
