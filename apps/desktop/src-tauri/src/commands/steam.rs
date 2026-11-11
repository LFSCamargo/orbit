use crate::services::steam_library;

#[tauri::command]
pub async fn install_steam_game(app_id: String) -> Result<(), String> {
    steam_library::install(&app_id).await
}

#[tauri::command]
pub async fn open_steam_library() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(steam_library::open_library)
        .await
        .map_err(|_| "Steam launcher stopped".to_string())?
}
