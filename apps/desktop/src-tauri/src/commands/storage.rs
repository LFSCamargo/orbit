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

/// Deletes one installed component version that no game is set to use.
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
        let in_use = selections::resolve(&root, &actives)
            .values()
            .any(|path| path == &component.path)
            || selections::active_wine_path(&root, &actives).as_deref()
                == Some(component.path.as_str());
        if in_use {
            return Err("This version is in use. Pick another version in Runtimes first.".into());
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
