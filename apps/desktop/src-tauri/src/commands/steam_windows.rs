use tauri::{AppHandle, Manager, State};

use crate::models::GameSession;
use crate::services::steam_catalog;
use crate::services::steam_credentials::{self, SteamPasswordStart};
use crate::services::steam_login::{self, SteamLoginPlacement, SteamLoginPoll};
use crate::services::steam_qr::{self, SteamQrPoll, SteamQrStart};
use crate::services::steam_windows::{self, SteamOwnedGame, SteamWindowsStatus};
use crate::utils::api_keys::steamgriddb_api_key;
use crate::AppState;

#[tauri::command]
pub fn steam_windows_status(state: State<'_, AppState>) -> Result<SteamWindowsStatus, String> {
    steam_windows::status(&state.repo)
}

#[tauri::command]
pub fn steam_windows_preferences(
    state: State<'_, AppState>,
) -> Result<steam_windows::SteamWindowsPreferences, String> {
    steam_windows::preferences(&state.repo)
}

#[tauri::command]
pub fn set_steam_windows_preferences(
    state: State<'_, AppState>,
    preferences: steam_windows::SteamWindowsPreferences,
) -> Result<steam_windows::SteamWindowsPreferences, String> {
    steam_windows::set_preferences(&state.repo, preferences)
}

#[tauri::command]
pub async fn steam_windows_library(app: AppHandle) -> Result<Vec<SteamOwnedGame>, String> {
    catalog_library(app, false, false).await
}

#[tauri::command]
pub async fn install_windows_steam(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        steam_windows::install_windows_steam(&state.repo)
    })
    .await
    .map_err(|_| "Steam installation stopped".to_string())?
}

#[tauri::command]
pub async fn begin_steam_windows_password(
    account_name: String,
    password: String,
) -> Result<SteamPasswordStart, String> {
    tauri::async_runtime::spawn_blocking(move || steam_credentials::begin(&account_name, &password))
        .await
        .map_err(|_| "Steam sign-in stopped".to_string())?
}

#[tauri::command]
pub async fn submit_steam_windows_guard(
    client_id: String,
    steam_id: String,
    code: String,
    code_type: u32,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        steam_credentials::submit_guard(&client_id, &steam_id, &code, code_type)
    })
    .await
    .map_err(|_| "Steam sign-in stopped".to_string())?
}

#[tauri::command]
pub async fn start_steam_windows_qr() -> Result<SteamQrStart, String> {
    tauri::async_runtime::spawn_blocking(steam_qr::start)
        .await
        .map_err(|_| "Steam sign-in stopped".to_string())?
}

#[tauri::command]
pub async fn poll_steam_windows_qr(
    app: AppHandle,
    client_id: String,
    request_id: String,
) -> Result<SteamQrPoll, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        steam_qr::poll(&state.repo, &client_id, &request_id)
    })
    .await
    .map_err(|_| "Steam sign-in stopped".to_string())?
}

#[tauri::command]
pub async fn open_steam_windows_login(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        steam_login::open(&state.steam_login)
    })
    .await
    .map_err(|_| "Steam sign-in stopped".to_string())?
}

#[tauri::command]
pub fn place_steam_windows_login(
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<SteamLoginPlacement, String> {
    steam_login::place(x, y, width, height)
}

#[tauri::command]
pub async fn poll_steam_windows_login(app: AppHandle) -> Result<SteamLoginPoll, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let result = steam_login::poll(&state.repo)?;
        if result.done {
            steam_login::close(&state.steam_login)?;
        }
        Ok(result)
    })
    .await
    .map_err(|_| "Steam sign-in stopped".to_string())?
}

#[tauri::command]
pub async fn connect_steam_windows(app: AppHandle) -> Result<SteamWindowsStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        steam_windows::connect(&state.repo)
    })
    .await
    .map_err(|_| "Steam sign-in stopped".to_string())?
}

#[tauri::command]
pub fn cancel_steam_windows_sign_in(state: State<'_, AppState>) -> Result<(), String> {
    steam_windows::cancel_sign_in();
    steam_login::close(&state.steam_login)
}

#[tauri::command]
pub fn disconnect_steam_windows(state: State<'_, AppState>) -> Result<SteamWindowsStatus, String> {
    steam_windows::disconnect(&state.repo, &crate::utils::paths::app_data_dir())?;
    steam_windows::status(&state.repo)
}

#[tauri::command]
pub async fn refresh_steam_windows_library(app: AppHandle) -> Result<Vec<SteamOwnedGame>, String> {
    catalog_library(app, true, false).await
}

#[tauri::command]
pub async fn retry_steam_catalog_metadata(app: AppHandle) -> Result<Vec<SteamOwnedGame>, String> {
    catalog_library(app, false, true).await
}

async fn catalog_library(
    app: AppHandle,
    refresh_ids: bool,
    force: bool,
) -> Result<Vec<SteamOwnedGame>, String> {
    let cloned = app.clone();
    let (mut entries, key, installed, favorites, paths) = tauri::async_runtime::spawn_blocking(move || {
        let state = cloned.state::<AppState>();
        if refresh_ids {
            steam_windows::refresh_owned_ids(&state.repo)?;
        }
        let entries = steam_windows::stored_entries(&state.repo)?;
        let paths = steam_windows::preferences(&state.repo)?.additional_library_paths;
        let installed = steam_windows::installed_app_ids(&entries, &paths);
        let mut favorites = std::collections::HashSet::new();
        for game in state.repo.list_games().map_err(|err| err.to_string())? {
            if !game.favorite {
                continue;
            }
            if let Some(id) = crate::utils::steam_app_id::steam_app_id_from_launch(&game.launch_config)
                .or(game.source_id.filter(|id| crate::services::steam_download::valid_app_id(id)))
            {
                favorites.insert(id);
            }
        }
        for (id, saved) in state.repo.library_states().map_err(|err| err.to_string())? {
            if saved.favorite == Some(true) {
                if let Some(app_id) = id.strip_prefix("steam:") {
                    favorites.insert(app_id.to_string());
                }
            }
        }
        let key = steamgriddb_api_key(&state.repo);
        Ok::<_, String>((entries, key, installed, favorites, paths))
    })
    .await
    .map_err(|_| "Steam library refresh stopped".to_string())??;
    if steam_catalog::hydrate(&mut entries, key.as_deref(), &installed, &favorites, force).await {
        let cloned = app.clone();
        let saved = entries.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let state = cloned.state::<AppState>();
            steam_windows::save_library(&state.repo, &saved)
        })
        .await
        .map_err(|_| "Steam library refresh stopped".to_string())??;
    }
    tauri::async_runtime::spawn_blocking(move || steam_windows::present(entries, &paths))
        .await
        .map_err(|_| "Steam library inspection stopped".to_string())
}

#[tauri::command]
pub async fn download_steam_windows_game(app: AppHandle, app_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        steam_windows::download(&app, &state.repo, &app_id)
    })
    .await
    .map_err(|_| "Steam download stopped".to_string())?
}

#[tauri::command]
pub fn cancel_steam_windows_download() {
    steam_windows::cancel_download();
}

#[tauri::command]
pub async fn play_steam_windows_game(
    app: AppHandle,
    app_id: String,
) -> Result<GameSession, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let game_id = steam_windows::play(&state.repo, &app_id)?;
        let game = state
            .repo
            .get_game(&game_id)
            .map_err(|err| err.to_string())?
            .ok_or("Game not found")?;
        state
            .sessions
            .launch_game(&app, &state.repo, &game)
            .map_err(|err| format!("{err:#}"))
    })
    .await
    .map_err(|_| "Steam play stopped".to_string())?
}
