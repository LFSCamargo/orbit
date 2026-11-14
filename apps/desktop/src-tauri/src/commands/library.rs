use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use crate::{AppState, services::{library::{self, EntryState, LibraryEntry}, steam_windows}};

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryQuery {
    pub query: Option<String>,
    pub view: Option<String>,
    pub sort: Option<String>,
    pub platform: Option<String>,
    pub cursor: Option<usize>,
    pub limit: Option<usize>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryPage { entries: Vec<LibraryEntry>, total: usize, next_cursor: Option<usize> }

fn entries(state: &AppState) -> Result<Vec<LibraryEntry>, String> {
    let games = state.repo.list_games().map_err(|e| e.to_string())?;
    let catalog = steam_windows::stored_entries(&state.repo)?;
    let states = state.repo.library_states().map_err(|e| e.to_string())?;
    let mut result = library::merge(games, catalog);
    for entry in &mut result {
        if let Some(saved) = states.get(&entry.id) {
            if let Some(favorite) = saved.favorite { entry.game.favorite = favorite; }
            if let Some(hidden) = saved.hidden { entry.game.hidden = hidden; }
            entry.preferred_installation_id = saved.preferred_installation_id.clone();
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn list_library_entries(app: AppHandle, query: LibraryQuery) -> Result<LibraryPage, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let term = query.query.unwrap_or_default().to_lowercase();
        if term.len() > 500 { return Err("Search is too long".into()); }
        let mut entries: Vec<_> = entries(&state)?.into_iter().filter(|e| {
            !e.game.hidden && (term.is_empty() || e.game.title.to_lowercase().contains(&term)) &&
            match query.view.as_deref().unwrap_or("installed") {
                "installed" => !e.installations.is_empty(), "favorites" => e.game.favorite, _ => true,
            } && query.platform.as_deref().is_none_or(|p| p == "all" || e.installations.iter().any(|i| i.platform.as_str() == p))
        }).collect();
        match query.sort.as_deref() {
            Some("recently-played") => entries.sort_by(|a,b| b.game.last_played_at.cmp(&a.game.last_played_at).then(a.id.cmp(&b.id))),
            Some("playtime") => entries.sort_by_key(|e| std::cmp::Reverse(e.game.total_playtime_seconds)),
            _ => {},
        }
        let total = entries.len();
        let start = query.cursor.unwrap_or(0).min(total);
        let limit = query.limit.unwrap_or(48).clamp(1,96);
        let next = (start + limit < total).then_some(start + limit);
        Ok(LibraryPage { entries: entries.into_iter().skip(start).take(limit).collect(), total, next_cursor: next })
    }).await.map_err(|_| "Library read stopped".to_string())?
}

#[tauri::command]
pub async fn get_library_entry(app: AppHandle, entry_id: String) -> Result<Option<LibraryEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        Ok(entries(&state)?.into_iter().find(|e| e.id == entry_id || e.installations.iter().any(|i| i.game_id == entry_id)))
    }).await.map_err(|_| "Library read stopped".to_string())?
}

#[tauri::command]
pub async fn update_library_entry(app: AppHandle, entry_id: String, patch: EntryState) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let entry = entries(&state)?.into_iter().find(|e| e.id == entry_id).ok_or("Game not found")?;
        if patch.preferred_installation_id.as_ref().is_some_and(|id| !entry.installations.iter().any(|i| &i.id == id)) { return Err("Installation does not belong to this game".into()); }
        let mut saved = state.repo.library_states().map_err(|e| e.to_string())?.remove(&entry_id).unwrap_or_default();
        if patch.favorite.is_some() { saved.favorite = patch.favorite; }
        if patch.hidden.is_some() { saved.hidden = patch.hidden; }
        if patch.preferred_installation_id.is_some() { saved.preferred_installation_id = patch.preferred_installation_id; }
        state.repo.save_library_state(&entry_id, &saved).map_err(|e| e.to_string())
    }).await.map_err(|_| "Library save stopped".to_string())?
}

#[tauri::command]
pub async fn delete_library_entry(app: AppHandle, entry_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let entry = entries(&state)?.into_iter().find(|e| e.id == entry_id).ok_or("Game not found")?;
        for install in entry.installations {
            state.repo.delete_game(&install.game_id).map_err(|e| e.to_string())?;
        }
        Ok(())
    }).await.map_err(|_| "Library delete stopped".to_string())?
}
