use tauri::{AppHandle, Manager};

use crate::models::Game;
use crate::services::xbox_auth::{self, XboxAccount, XboxDevicePoll, XboxDeviceStart};
use crate::services::{xcloud_launch, xcloud_library};
use crate::utils::paths::app_data_dir;
use crate::AppState;

fn session_dir() -> std::path::PathBuf {
    xbox_auth::session_dir(&app_data_dir())
}

async fn blocking<T: Send + 'static>(
    task: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|_| "Xbox request stopped".to_string())?
}

/// What the linked account may stream in Orbit's player. The streaming token
/// stays in Rust; only the market and region names leave it.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct XcloudStreamStatus {
    market: String,
    region: String,
    regions: Vec<String>,
}

#[tauri::command]
pub async fn xcloud_stream_status() -> Result<XcloudStreamStatus, String> {
    blocking(|| {
        let session = crate::services::xcloud_stream::auth::cloud_session(&session_dir())?;
        let region = session
            .default_region()
            .map(|region| region.name.clone())
            .unwrap_or_default();
        Ok(XcloudStreamStatus {
            market: session.market.clone(),
            region,
            regions: session.regions.iter().map(|r| r.name.clone()).collect(),
        })
    })
    .await
}

use crate::services::xcloud_stream::session::{self as stream, IceCandidate, StreamState};

/// Requests a stream for a Store product id in Orbit's player.
#[tauri::command]
pub async fn xcloud_stream_start(product_id: String) -> Result<(), String> {
    blocking(move || stream::start(&session_dir(), &product_id)).await
}

#[tauri::command]
pub async fn xcloud_stream_state() -> Result<StreamState, String> {
    blocking(|| stream::state(&session_dir())).await
}

#[tauri::command]
pub async fn xcloud_stream_sdp(offer: String) -> Result<String, String> {
    blocking(move || stream::sdp(&offer)).await
}

#[tauri::command]
pub async fn xcloud_stream_ice(candidates: Vec<IceCandidate>) -> Result<Vec<IceCandidate>, String> {
    blocking(move || stream::ice(&candidates)).await
}

#[tauri::command]
pub async fn xcloud_stream_keepalive() -> Result<bool, String> {
    blocking(stream::keepalive).await
}

#[tauri::command]
pub async fn xcloud_stream_stop() -> Result<(), String> {
    blocking(|| {
        stream::stop();
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn xbox_device_start() -> Result<XboxDeviceStart, String> {
    blocking(xbox_auth::start).await
}

#[tauri::command]
pub async fn xbox_device_poll() -> Result<XboxDevicePoll, String> {
    blocking(|| xbox_auth::poll(&session_dir())).await
}

#[tauri::command]
pub fn xbox_device_cancel() {
    xbox_auth::cancel();
}

#[tauri::command]
pub fn xbox_account_status() -> Option<XboxAccount> {
    xbox_auth::account(&session_dir())
}

#[tauri::command]
pub fn xbox_sign_out() -> Result<(), String> {
    xbox_auth::sign_out(&session_dir())
}

#[tauri::command]
pub async fn list_xcloud_catalog(
    app: AppHandle,
    refresh: Option<bool>,
) -> Result<xcloud_library::XcloudCatalog, String> {
    blocking(move || {
        let state = app.state::<AppState>();
        xcloud_library::load(
            &state.repo,
            &state.metadata_cache,
            refresh.unwrap_or(false),
            xcloud_library::fetch_live,
        )
    })
    .await
}

/// Play records the launch here; the stream itself starts in Orbit's player
/// (`xcloud_stream_start`), never in a web page.
fn record_launch(_url: &str) -> anyhow::Result<()> {
    Ok(())
}

#[tauri::command]
pub async fn launch_xcloud_game(app: AppHandle, product_id: String) -> Result<Game, String> {
    blocking(move || {
        let state = app.state::<AppState>();
        let market = xcloud_library::market(&state.repo);
        let entry = state
            .metadata_cache
            .xcloud_catalog_entry(&market.language, &product_id.to_ascii_uppercase())
            .map_err(|e| e.to_string())?
            .ok_or("This title is not in the Xbox Cloud Gaming catalog")?;
        xcloud_launch::launch_catalog_entry(&state.repo, &entry, record_launch)
            .map_err(|e| format!("{e:#}"))
    })
    .await
}

/// Replays a cloud game from the library. It streams in Orbit's player, so
/// no process is tracked and no active session is created.
#[tauri::command]
pub async fn launch_xcloud_library_game(app: AppHandle, game_id: String) -> Result<Game, String> {
    blocking(move || {
        let state = app.state::<AppState>();
        let game = state
            .repo
            .get_game(&game_id)
            .map_err(|e| e.to_string())?
            .ok_or("Game not found")?;
        xcloud_launch::launch_library_game(&state.repo, &game, record_launch)
            .map_err(|e| format!("{e:#}"))
    })
    .await
}

/// Adds a catalog title to the library (Installed) without launching it.
#[tauri::command]
pub async fn save_xcloud_game(app: AppHandle, product_id: String) -> Result<Game, String> {
    blocking(move || {
        let state = app.state::<AppState>();
        let market = xcloud_library::market(&state.repo);
        let entry = state
            .metadata_cache
            .xcloud_catalog_entry(&market.language, &product_id.to_ascii_uppercase())
            .map_err(|e| e.to_string())?
            .ok_or("This title is not in the Xbox Cloud Gaming catalog")?;
        xcloud_launch::save_catalog_entry(&state.repo, &entry).map_err(|e| format!("{e:#}"))
    })
    .await
}
