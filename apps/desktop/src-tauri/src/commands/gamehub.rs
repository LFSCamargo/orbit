use crate::services::gamehub_library::{self, GameHubLibrary};

#[tauri::command]
pub async fn get_gamehub_library() -> Result<GameHubLibrary, String> {
    tauri::async_runtime::spawn_blocking(gamehub_library::snapshot)
        .await
        .map_err(|_| "GameHub cache reader stopped".to_string())?
}
#[tauri::command]
pub async fn open_gamehub(foreground: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || gamehub_library::open(foreground))
        .await
        .map_err(|_| "GameHub launcher stopped".to_string())?
}
