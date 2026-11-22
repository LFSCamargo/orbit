use tauri::AppHandle;

use crate::services::app_update::{self, AppUpdateState};

/// Where Orbit's own update stands (also pushed as `app-update`).
#[tauri::command]
pub fn app_update_status() -> AppUpdateState {
    app_update::status()
}

/// "Check now": checks GitHub even when automatic updates are off.
#[tauri::command]
pub async fn app_update_check(app: AppHandle) -> AppUpdateState {
    app_update::check(&app, true).await;
    app_update::status()
}

/// Install the downloaded update and relaunch. Refused while a game plays.
#[tauri::command]
pub fn app_update_restart(app: AppHandle) -> Result<(), String> {
    app_update::install_and_restart(&app)
}
