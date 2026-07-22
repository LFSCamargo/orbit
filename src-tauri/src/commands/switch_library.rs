use std::path::PathBuf;

use tauri::State;

use crate::models::SwitchLibraryScan;
use crate::services::switch_library::{
    scan_switch_library, scan_switch_library_from_library as scan_library_from_db,
};
use crate::AppState;

#[tauri::command]
pub async fn scan_switch_library_folder(
    state: State<'_, AppState>,
    folder: String,
) -> Result<SwitchLibraryScan, String> {
    scan_switch_library(&state.repo, &PathBuf::from(folder))
}

#[tauri::command]
pub async fn scan_switch_library_from_library(
    state: State<'_, AppState>,
) -> Result<SwitchLibraryScan, String> {
    scan_library_from_db(&state.repo)
}
