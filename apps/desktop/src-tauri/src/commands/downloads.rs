use tauri::{AppHandle, State};

use crate::services::download_queue::{self, DownloadQueue, QueuedDownload};
use crate::services::install_locations::{self, InstallLocation};
use crate::services::steam_catalog;
use crate::services::steam_download::valid_app_id;
use crate::services::steam_windows;
use crate::AppState;

/// Adds an owned Steam title to the download queue and returns at once.
/// `location` is an id from `list_install_locations`; without one the
/// game's current location (or the last one used) is kept.
/// Progress and completion arrive through `steam-download-progress`.
#[tauri::command]
pub fn enqueue_steam_download(
    app: AppHandle,
    state: State<'_, AppState>,
    app_id: String,
    location: Option<String>,
) -> Result<(), String> {
    if !valid_app_id(&app_id) {
        return Err("Steam app id must be a number".into());
    }
    if !download_queue::is_queued(&app_id) {
        install_locations::choose_for_download(&state.repo, &app_id, location.as_deref())?;
    }
    let entry = steam_windows::stored_entries(&state.repo)?
        .into_iter()
        .find(|entry| entry.app_id == app_id);
    let title = entry
        .as_ref()
        .map(|entry| entry.title.clone())
        .filter(|title| !steam_catalog::is_placeholder_title(title, &app_id))
        .unwrap_or_else(|| format!("Steam {app_id}"));
    download_queue::enqueue(
        &app,
        QueuedDownload {
            cover_url: Some(steam_catalog::cover_url(&app_id)),
            app_id,
            title,
            paused: false,
            repair: false,
        },
    )
}

/// Repair Installation: Steam checks every file of an installed game and
/// downloads what is missing or changed, then the game's install scripts run
/// again. Returns `queued` (progress in the download queue) or `steam` when
/// the open Steam for Mac window validates it instead.
#[tauri::command]
pub fn repair_steam_game(
    app: AppHandle,
    state: State<'_, AppState>,
    app_id: String,
) -> Result<String, String> {
    if download_queue::is_queued(&app_id) {
        return Err("This game is already in the download queue.".into());
    }
    if state.sessions.get_active().is_some() || state.sessions.is_launching() {
        return Err("Close your game first, then repair it.".into());
    }
    match crate::services::game_repair::request(&state.repo, &app_id)? {
        crate::services::game_repair::RepairStart::InSteam => Ok("steam".into()),
        crate::services::game_repair::RepairStart::Queued => {
            let title = steam_windows::stored_entries(&state.repo)?
                .into_iter()
                .find(|entry| entry.app_id == app_id)
                .map(|entry| entry.title)
                .filter(|title| !steam_catalog::is_placeholder_title(title, &app_id))
                .unwrap_or_else(|| format!("Steam {app_id}"));
            download_queue::enqueue(
                &app,
                QueuedDownload {
                    cover_url: Some(steam_catalog::cover_url(&app_id)),
                    app_id,
                    title,
                    paused: false,
                    repair: true,
                },
            )?;
            Ok("queued".into())
        }
    }
}

#[tauri::command]
pub fn get_download_queue() -> DownloadQueue {
    download_queue::snapshot()
}

/// Removes a waiting title, or cancels it when it is the one downloading.
#[tauri::command]
pub fn remove_queued_download(app: AppHandle, app_id: String) {
    download_queue::remove(&app, &app_id);
}

#[tauri::command]
pub fn start_queued_download_now(app: AppHandle, app_id: String) {
    download_queue::start_now(&app, &app_id);
}

#[tauri::command]
pub fn pause_active_download() {
    download_queue::pause_active();
}

/// This Mac and each folder the person added, with free space.
#[tauri::command]
pub fn list_install_locations() -> Vec<InstallLocation> {
    install_locations::list()
}

#[tauri::command]
pub fn add_install_location(
    state: State<'_, AppState>,
    path: String,
) -> Result<InstallLocation, String> {
    install_locations::add(&state.repo, std::path::Path::new(&path))
}

#[tauri::command]
pub fn remove_install_location(state: State<'_, AppState>, id: String) -> Result<(), String> {
    install_locations::remove(&state.repo, &id)
}
