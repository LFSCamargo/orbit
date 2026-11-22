//! Thin Tauri command handlers for Microsoft Store / PC Game Pass authentication,
//! catalog browsing, download queueing, and uninstalling.

use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, State};

use crate::services::download_queue::{self, DownloadProvider, QueuedDownload};
use crate::services::install_locations;
use crate::services::msstore_auth::{self, MsStoreAccountStatus};
use crate::services::msstore_catalog::{self, MsStoreCatalog};
use crate::services::uninstall::{self, UninstallReport};
use crate::services::xcloud_library;
use crate::utils::paths::app_data_dir;
use crate::AppState;

const STOP_WAIT: Duration = Duration::from_secs(15);

fn session_dir() -> std::path::PathBuf {
    msstore_auth::session_dir(&app_data_dir())
}

async fn blocking<T: Send + 'static>(
    task: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|_| "Microsoft Store request stopped".to_string())?
}

#[tauri::command]
pub fn msstore_auth_status(state: State<'_, AppState>) -> MsStoreAccountStatus {
    msstore_auth::status(&session_dir(), &crate::runtimes::root(), Some(&state.repo))
}

#[tauri::command]
pub async fn msstore_auth_start(app: AppHandle) -> Result<(), String> {
    msstore_auth::open_login_window(&app)
}

#[tauri::command]
pub async fn msstore_auth_complete(
    app: AppHandle,
    da_token: String,
    account_label: Option<String>,
) -> Result<MsStoreAccountStatus, String> {
    let app_clone = app.clone();
    let status = blocking(move || {
        let dir = session_dir();
        msstore_auth::complete_sign_in(&dir, &da_token, account_label)?;
        let state = app_clone.state::<AppState>();
        Ok(msstore_auth::status(
            &dir,
            &crate::runtimes::root(),
            Some(&state.repo),
        ))
    })
    .await?;
    msstore_auth::cancel_login_window(&app);
    let _ = app.emit("msstore-auth-changed", &status);
    Ok(status)
}

#[tauri::command]
pub fn msstore_auth_cancel(app: AppHandle) {
    msstore_auth::cancel_login_window(&app);
}

#[tauri::command]
pub async fn msstore_sign_out(app: AppHandle) -> Result<(), String> {
    msstore_auth::cancel_login_window(&app);
    let app_clone = app.clone();
    blocking(move || {
        let state = app_clone.state::<AppState>();
        msstore_auth::sign_out(&session_dir())?;
        let _ = state.metadata_cache.clear_msstore_owned();
        Ok(())
    })
    .await?;
    let status = msstore_auth::status(&session_dir(), &crate::runtimes::root(), None);
    let _ = app.emit("msstore-auth-changed", &status);
    let _ = app.emit("msstore-library-updated", ());
    Ok(())
}

#[tauri::command]
pub async fn list_msstore_catalog(
    app: AppHandle,
    refresh: Option<bool>,
) -> Result<MsStoreCatalog, String> {
    blocking(move || {
        let state = app.state::<AppState>();
        msstore_catalog::load(
            &state.repo,
            &state.metadata_cache,
            &session_dir(),
            refresh.unwrap_or(false),
        )
    })
    .await
}

/// Enqueues a Microsoft Store / PC Game Pass title onto Orbit's shared download queue.
#[tauri::command]
pub fn enqueue_msstore_download(
    app: AppHandle,
    state: State<'_, AppState>,
    product_id: String,
    location: Option<String>,
) -> Result<(), String> {
    if !orbit_msstore::valid_product_id(&product_id) {
        return Err("Microsoft Store product id must be 12 alphanumeric characters".into());
    }
    let pid = product_id.to_ascii_uppercase();
    if !download_queue::is_queued(&pid) {
        install_locations::choose_for_msstore_download(&state.repo, &pid, location.as_deref())?;
    }
    let market = xcloud_library::market(&state.repo);
    let entry = state
        .metadata_cache
        .msstore_catalog_entry(&market.language, &pid)
        .map_err(|e| e.to_string())?;
    let title = entry
        .as_ref()
        .map(|item| item.title.clone())
        .unwrap_or_else(|| format!("Microsoft Store {pid}"));
    let cover_url = entry.and_then(|item| item.cover_url.or(item.square_url));
    download_queue::enqueue(
        &app,
        QueuedDownload {
            app_id: pid,
            title,
            cover_url,
            paused: false,
            provider: DownloadProvider::MsStore,
        },
    )
}

/// Removes an Orbit-managed Microsoft Store install. Saves/prefix stay unless `delete_prefix` is true.
#[tauri::command]
pub async fn uninstall_msstore_game(
    app: AppHandle,
    product_id: String,
    delete_prefix: bool,
) -> Result<UninstallReport, String> {
    blocking(move || {
        let pid = product_id.to_ascii_uppercase();
        stop_download(&app, &pid)?;
        let state = app.state::<AppState>();
        let external = install_locations::library_for_msstore(&pid);
        let plan = uninstall::msstore_removal_plan(
            &crate::runtimes::root(),
            &pid,
            external.as_deref(),
            delete_prefix,
        )?;
        if !plan.finds_game_files() {
            return Err("Orbit could not find this game's files to uninstall.".into());
        }
        let report = uninstall::execute(&plan)?;
        uninstall::forget_installs(&state.repo, &plan)?;
        install_locations::forget_msstore(&state.repo, &pid);
        download_queue::forget_download_size(&state.repo, &pid);
        crate::services::storage::invalidate();
        crate::services::install_roots::forget_measurements();
        let _ = app.emit("msstore-library-updated", ());
        let _ = app.emit("steam-library-updated", ());
        Ok(report)
    })
    .await
}

fn stop_download(app: &AppHandle, product_id: &str) -> Result<(), String> {
    if !download_queue::is_queued(product_id) {
        return Ok(());
    }
    download_queue::remove(app, product_id);
    let started = Instant::now();
    while download_queue::is_queued(product_id) {
        if started.elapsed() > STOP_WAIT {
            return Err("The download is still stopping. Try again in a moment.".into());
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    Ok(())
}
