use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager};

use crate::services::download_queue;
use crate::services::steam_windows;
use crate::services::uninstall::{self, UninstallReport};
use crate::utils::paths::app_data_dir;
use crate::AppState;

const STOP_WAIT: Duration = Duration::from_secs(15);

/// Deletes a Windows Steam game Orbit downloaded or reads from a Steam
/// library folder. The owned title stays in the library as not installed.
/// Saves are kept unless `delete_prefix` is set.
#[tauri::command]
pub async fn uninstall_steam_game(
    app: AppHandle,
    app_id: String,
    delete_prefix: bool,
) -> Result<UninstallReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        stop_download(&app, &app_id)?;
        let state = app.state::<AppState>();
        let session = steam_windows::session_dir(&app_data_dir());
        let mut plan =
            uninstall::removal_plan(&crate::runtimes::root(), &session, &app_id, delete_prefix)?;
        let mut libraries = steam_windows::windows_library_paths(&state.repo);
        // Games the game container's own Steam client downloaded, on This
        // Mac or in the install location the person picked.
        if let Ok((_, steamapps)) = crate::services::steam_client_download::container_paths(&app_id)
        {
            libraries.push(steamapps.join("common").to_string_lossy().into_owned());
        }
        if let Ok(steamapps) = crate::services::steam_client_download::game_steamapps(&app_id) {
            libraries.push(steamapps.join("common").to_string_lossy().into_owned());
        }
        uninstall::add_library_installs(&mut plan, &libraries, &session, &app_id);
        if !plan.finds_game_files() {
            return Err("Orbit could not find this game's files to uninstall.".into());
        }
        let report = uninstall::execute(&plan)?;
        uninstall::forget_installs(&state.repo, &plan)?;
        crate::services::install_locations::forget_app(&state.repo, &app_id);
        download_queue::forget_download_size(&state.repo, &app_id);
        crate::services::storage::invalidate();
        crate::services::install_roots::forget_measurements();
        let _ = app.emit("steam-library-updated", ());
        Ok(report)
    })
    .await
    .map_err(|_| "Uninstall stopped".to_string())?
}

/// A queued or running download for the title is cancelled first, so
/// SteamCMD is not writing into the folder being deleted.
fn stop_download(app: &AppHandle, app_id: &str) -> Result<(), String> {
    if !download_queue::is_queued(app_id) {
        return Ok(());
    }
    download_queue::remove(app, app_id);
    let started = Instant::now();
    while download_queue::is_queued(app_id) {
        if started.elapsed() > STOP_WAIT {
            return Err("The download is still stopping. Try again in a moment.".into());
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    Ok(())
}
