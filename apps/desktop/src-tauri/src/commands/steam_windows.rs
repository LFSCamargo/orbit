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
        steam_windows::install_windows_steam(&app, &state.repo)
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
        steam_login::open(&app, &state.steam_login)
    })
    .await
    .map_err(|_| "Steam sign-in stopped".to_string())?
}

#[tauri::command]
pub async fn place_steam_windows_login(
    app: AppHandle,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<SteamLoginPlacement, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        steam_login::place(&app, &state.steam_login, x, y, width, height)
    })
    .await
    .map_err(|_| "Steam window positioning stopped".to_string())?
}

#[tauri::command]
pub async fn poll_steam_windows_login(app: AppHandle) -> Result<SteamLoginPoll, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let result = steam_login::poll(&state.repo)?;
        if result.done {
            steam_login::finish_sign_in(Some(&app), &state.steam_login)?;
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
pub async fn cancel_steam_windows_sign_in(app: AppHandle) -> Result<(), String> {
    steam_windows::cancel_sign_in();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        steam_login::close(Some(&app), &state.steam_login, false)
    })
    .await
    .map_err(|_| "Steam shutdown stopped".to_string())?
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
    let (entries, key, installed, favorites, paths, account) =
        tauri::async_runtime::spawn_blocking(move || {
            let state = cloned.state::<AppState>();
            let account = steam_windows::stored_account(&state.repo)?;
            if refresh_ids
                || (account.is_some() && steam_windows::stored_entries(&state.repo)?.is_empty())
            {
                steam_windows::refresh_owned_ids(&state.repo)?;
            }
            let entries = steam_windows::stored_entries(&state.repo)?;
            let paths = steam_windows::preferences(&state.repo)?.additional_library_paths;
            let installed = steam_windows::installed_app_ids(&entries, &paths);
            let entries = steam_catalog::include_installed(entries, &installed);
            let mut favorites = std::collections::HashSet::new();
            for game in state.repo.list_games().map_err(|err| err.to_string())? {
                if !game.favorite {
                    continue;
                }
                if let Some(id) =
                    crate::utils::steam_app_id::steam_app_id_from_launch(&game.launch_config)
                        .or(game
                            .source_id
                            .filter(|id| crate::services::steam_download::valid_app_id(id)))
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
            Ok::<_, String>((entries, key, installed, favorites, paths, account))
        })
        .await
        .map_err(|_| "Steam library refresh stopped".to_string())??;
    crate::services::steam_catalog_sync::schedule(
        app,
        entries.clone(),
        key,
        installed,
        favorites,
        force,
        account,
    );
    tauri::async_runtime::spawn_blocking(move || steam_windows::present(entries, &paths))
        .await
        .map_err(|_| "Steam library inspection stopped".to_string())
}

/// Kept for older callers: queues the title like `enqueue_steam_download`.
#[tauri::command]
pub fn download_steam_windows_game(
    app: AppHandle,
    state: State<'_, AppState>,
    app_id: String,
) -> Result<(), String> {
    crate::commands::downloads::enqueue_steam_download(app, state, app_id, None)
}

#[tauri::command]
pub fn cancel_steam_windows_download() {
    steam_windows::cancel_download();
}

fn steam_title_for_overlay(repo: &crate::database::GameRepository, app_id: &str) -> Option<String> {
    steam_windows::stored_entries(repo)
        .ok()?
        .into_iter()
        .find(|entry| entry.app_id == app_id)
        .map(|entry| entry.title)
        .filter(|title| !crate::services::steam_catalog::is_placeholder_title(title, app_id))
}

#[tauri::command]
pub async fn play_steam_windows_game(
    app: AppHandle,
    app_id: String,
) -> Result<GameSession, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use crate::launching::progress::{emit_launch_failed, emit_launch_progress};
        let state = app.state::<AppState>();
        let synthetic_id = format!("steam-windows:{app_id}");
        let fallback_title = || steam_title_for_overlay(&state.repo, &app_id);

        emit_launch_progress(&app, &synthetic_id, "resolve", fallback_title().as_deref());
        let game_id = match steam_windows::play(&state.repo, &app_id) {
            Ok(game_id) => game_id,
            Err(error) => {
                let step = if error.contains("Settings → Steam") {
                    "runtime"
                } else {
                    "resolve"
                };
                let title = fallback_title();
                emit_launch_failed(&app, &synthetic_id, step, &error, title.as_deref());
                return Err(error);
            }
        };
        let game = state
            .repo
            .get_game(&game_id)
            .map_err(|err| err.to_string())?
            .ok_or("Game not found")?;
        emit_launch_progress(&app, &game_id, "runtime", Some(&game.title));
        state
            .sessions
            .launch_game(&app, &state.repo, &game)
            .map_err(|err| format!("{err:#}"))
    })
    .await
    .map_err(|_| "Steam play stopped".to_string())?
}
