use crate::{
    services::{
        library::{self, EntryState, LibraryEntry},
        steam_catalog, steam_catalog_sync, steam_windows,
    },
    utils::api_keys::steamgriddb_api_key,
    AppState,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryQuery {
    pub query: Option<String>,
    pub view: Option<String>,
    pub sort: Option<String>,
    pub platform: Option<String>,
    pub cursor: Option<usize>,
    pub limit: Option<usize>,
    /// Adds unsaved Game Pass cloud titles (Library and Search only).
    pub include_cloud_catalog: Option<bool>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryPage {
    entries: Vec<LibraryEntry>,
    total: usize,
    next_cursor: Option<usize>,
}

pub(crate) fn entries(state: &AppState) -> Result<Vec<LibraryEntry>, String> {
    steam_windows::ensure_owned_snapshot(&state.repo)?;
    let mut games = state.repo.list_games().map_err(|e| e.to_string())?;
    let stubs = library::placeholder_game_ids(&games);
    let catalog = steam_windows::stored_entries(&state.repo)?;
    let states = state.repo.library_states().map_err(|e| e.to_string())?;
    let cloud = crate::services::xcloud_library::catalog_library_entries(
        &state.metadata_cache,
        &state.repo,
        &mut games,
    );
    let msstore = crate::services::msstore_catalog::catalog_library_entries(
        &state.metadata_cache,
        &state.repo,
        &games,
    );
    let mut result = library::merge(games, catalog);
    result.extend(cloud);
    result.extend(msstore);
    result.sort_by(|a, b| {
        a.game
            .sort_title
            .cmp(&b.game.sort_title)
            .then(a.id.cmp(&b.id))
    });
    let paths = steam_windows::preferences(&state.repo)?.additional_library_paths;
    library::attach_windows_installs(
        &mut result,
        &crate::services::steam_library_paths::index(&paths),
    );
    library::apply_playtimes(&mut result, &steam_windows::play_records());
    crate::services::install_roots::apply_measured(&mut result);
    library::apply_download_sizes(
        &mut result,
        &crate::services::download_queue::download_sizes(&state.repo),
    );
    for entry in &mut result {
        if let Some(saved) = states.get(&entry.id) {
            if let Some(favorite) = saved.favorite {
                entry.game.favorite = favorite;
            }
            if let Some(hidden) = saved.hidden {
                entry.game.hidden = hidden;
            }
            entry.preferred_installation_id = saved.preferred_installation_id.clone();
        }
    }
    let _ = library::persist_overlay_copy(&state.repo, &stubs, &result);
    Ok(result)
}

fn kick_catalog_hydrate(app: &AppHandle) {
    let state = app.state::<AppState>();
    let Ok(account) = steam_windows::stored_account(&state.repo) else {
        return;
    };
    let Ok(entries) = steam_windows::stored_entries(&state.repo) else {
        return;
    };
    let paths = steam_windows::preferences(&state.repo)
        .map(|prefs| prefs.additional_library_paths)
        .unwrap_or_default();
    let installed = steam_windows::installed_app_ids(&entries, &paths);
    let entries = steam_catalog::include_installed(entries, &installed);
    if !steam_catalog::catalog_needs_hydrate(&entries) {
        return;
    }
    let key = steamgriddb_api_key(&state.repo);
    steam_catalog_sync::schedule(
        app.clone(),
        entries,
        key,
        installed,
        Default::default(),
        false,
        account,
    );
}

#[tauri::command]
pub async fn list_library_entries(
    app: AppHandle,
    query: LibraryQuery,
) -> Result<LibraryPage, String> {
    let hydrate = app.clone();
    let page = tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let term = query.query.unwrap_or_default();
        if term.len() > 500 {
            return Err("Search is too long".into());
        }
        let catalog = query.include_cloud_catalog.unwrap_or(false);
        let mut entries: Vec<_> = entries(&state)?
            .into_iter()
            .filter(|e| {
                (catalog
                    || (!crate::services::xcloud_library::is_unsaved(e)
                        && !crate::services::msstore_catalog::is_unsaved(e)))
                    && !e.game.hidden
                    && crate::utils::search_text::matches(&e.game.title, &term)
                    && match query.view.as_deref().unwrap_or("installed") {
                        "installed" => !e.installations.is_empty(),
                        "favorites" => e.game.favorite,
                        _ => true,
                    }
                    && query.platform.as_deref().is_none_or(|p| {
                        p == "all" || e.installations.iter().any(|i| i.platform.as_str() == p)
                    })
            })
            .collect();
        match query.sort.as_deref() {
            Some("recently-played") => entries.sort_by(|a, b| {
                b.game
                    .last_played_at
                    .cmp(&a.game.last_played_at)
                    .then(a.id.cmp(&b.id))
            }),
            Some("playtime") => {
                entries.sort_by_key(|e| std::cmp::Reverse(e.game.total_playtime_seconds))
            }
            _ => {}
        }
        let total = entries.len();
        let start = query.cursor.unwrap_or(0).min(total);
        // Library asks for everything and pages per section on screen.
        let limit = query.limit.unwrap_or(48).clamp(1, 5000);
        let next = (start + limit < total).then_some(start + limit);
        Ok(LibraryPage {
            entries: entries.into_iter().skip(start).take(limit).collect(),
            total,
            next_cursor: next,
        })
    })
    .await
    .map_err(|_| "Library read stopped".to_string())?;
    kick_catalog_hydrate(&hydrate);
    page
}

#[tauri::command]
pub async fn get_library_entry(
    app: AppHandle,
    entry_id: String,
) -> Result<Option<LibraryEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        Ok(entries(&state)?
            .into_iter()
            .find(|e| library::entry_matches(e, &entry_id)))
    })
    .await
    .map_err(|_| "Library read stopped".to_string())?
}

#[tauri::command]
pub async fn update_library_entry(
    app: AppHandle,
    entry_id: String,
    patch: EntryState,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let entry = entries(&state)?
            .into_iter()
            .find(|e| e.id == entry_id)
            .ok_or("Game not found")?;
        if patch
            .preferred_installation_id
            .as_ref()
            .is_some_and(|id| !entry.installations.iter().any(|i| &i.id == id))
        {
            return Err("Installation does not belong to this game".into());
        }
        let mut saved = state
            .repo
            .library_states()
            .map_err(|e| e.to_string())?
            .remove(&entry_id)
            .unwrap_or_default();
        if patch.favorite.is_some() {
            saved.favorite = patch.favorite;
        }
        if patch.hidden.is_some() {
            saved.hidden = patch.hidden;
        }
        if patch.preferred_installation_id.is_some() {
            saved.preferred_installation_id = patch.preferred_installation_id;
        }
        state
            .repo
            .save_library_state(&entry_id, &saved)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|_| "Library save stopped".to_string())?
}

#[tauri::command]
pub async fn delete_library_entry(app: AppHandle, entry_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let entry = entries(&state)?
            .into_iter()
            .find(|e| e.id == entry_id)
            .ok_or("Game not found")?;
        for install in entry.installations {
            state
                .repo
                .delete_game(&install.game_id)
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    })
    .await
    .map_err(|_| "Library delete stopped".to_string())?
}

/// Measures each installed copy of one title from its real game folder.
/// Walks the folders off the main thread; repeat calls reuse the measurement.
#[tauri::command]
pub async fn get_install_sizes(
    app: AppHandle,
    entry_id: String,
    refresh: bool,
) -> Result<Vec<crate::services::install_roots::InstallSize>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        if refresh {
            crate::services::install_roots::forget_measurements();
        }
        let entry = entries(&state)?
            .into_iter()
            .find(|e| e.id == entry_id)
            .ok_or("Game not found")?;
        let sizes = crate::services::install_roots::measure_entry(&entry);
        for size in &sizes {
            let Some(install) = entry
                .installations
                .iter()
                .find(|item| item.id == size.installation_id)
            else {
                continue;
            };
            let bytes = i64::try_from(size.size_bytes).unwrap_or(i64::MAX);
            // Saved rows keep the size across restarts; catalog-only rows have no row.
            let _ = state.repo.set_install_size(&install.game_id, bytes);
        }
        Ok(sizes)
    })
    .await
    .map_err(|_| "Size check stopped".to_string())?
}
