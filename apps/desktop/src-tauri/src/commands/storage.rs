use std::collections::HashMap;
use std::path::Path;

use tauri::{AppHandle, Manager};

use crate::runtimes::{self, components, selections};
use crate::services::storage::{self, ScanContext, StorageOverview};
use crate::services::{install_roots, steam_catalog, steam_windows, uninstall};
use crate::utils::paths::app_data_dir;
use crate::AppState;

/// Disk usage of Orbit's games, tools and runtimes. A cached scan is reused
/// unless `refresh` is set; the walk runs off the main thread.
#[tauri::command]
pub async fn get_storage_overview(
    app: AppHandle,
    refresh: bool,
) -> Result<StorageOverview, String> {
    if refresh {
        install_roots::forget_measurements();
    } else if let Some(cached) = storage::cached() {
        return Ok(cached);
    }
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let titles: HashMap<String, String> = steam_windows::stored_entries(&state.repo)?
            .into_iter()
            .filter(|entry| !steam_catalog::is_placeholder_title(&entry.title, &entry.app_id))
            .map(|entry| (entry.app_id, entry.title))
            .collect();
        let installed = components::installed_components(&runtimes::root());
        let games = install_roots::game_roots(&crate::commands::library::entries(&state)?);
        let overview = storage::scan(
            &app_data_dir(),
            &ScanContext {
                titles: &titles,
                components: &installed,
                games: &games,
            },
        );
        storage::store(&overview);
        Ok(overview)
    })
    .await
    .map_err(|_| "Storage scan stopped".to_string())?
}

/// Deletes one installed component version. If it was pinned as active, the
/// active selection is cleared so launches fall back to another installed version.
#[tauri::command]
pub async fn remove_component(app: AppHandle, id: String, version: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let root = runtimes::root();
        let component = components::installed_components(&root)
            .into_iter()
            .find(|item| item.id == id && item.version == version)
            .ok_or("That component is not installed")?;
        let actives = selections::load(&state.repo).map_err(|err| format!("{err:#}"))?;
        if actives.get(&id).map(String::as_str) == Some(version.as_str()) {
            selections::clear_active(&state.repo, &id).map_err(|err| format!("{err:#}"))?;
        }
        uninstall::remove_within(
            Path::new(&component.path),
            &components::components_root(&root),
        )?;
        storage::invalidate();
        Ok(())
    })
    .await
    .map_err(|_| "Component removal stopped".to_string())?
}

/// Deletes one or more Orbit-created files or folders inside Orbit's data directory.
#[tauri::command]
pub async fn remove_storage_item(paths: Vec<String>) -> Result<u64, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let data_dir = app_data_dir();
        let steam_dir = data_dir.join("steam-windows");
        if paths
            .iter()
            .any(|raw| Path::new(raw).starts_with(&steam_dir))
        {
            crate::services::steam_resident::stop_all_except(None);
        }
        let freed = storage::remove_orbit_paths(&paths, &data_dir)?;
        install_roots::forget_measurements();
        storage::invalidate();
        Ok(freed)
    })
    .await
    .map_err(|_| "Storage item removal stopped".to_string())?
}
