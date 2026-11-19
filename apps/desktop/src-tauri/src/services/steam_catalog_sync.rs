//! Single background metadata job; ownership and account changes always win.
use super::steam_catalog::SteamCatalogEntry;
use std::{
    collections::{HashMap, HashSet},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use tauri::{AppHandle, Emitter, Manager};

struct Job(Arc<AtomicBool>);
impl Job {
    fn claim(busy: &Arc<AtomicBool>) -> Option<Self> {
        busy.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .ok()
            .map(|_| Self(busy.clone()))
    }
}
impl Drop for Job {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

/// O(n) indexed merge, capped by the 2,000-entry catalog contract.
fn merge_metadata(
    current: Vec<SteamCatalogEntry>,
    hydrated: Vec<SteamCatalogEntry>,
) -> Vec<SteamCatalogEntry> {
    let mut by_id: HashMap<_, _> = hydrated
        .into_iter()
        .map(|entry| (entry.app_id.clone(), entry))
        .collect();
    let mut merged: Vec<_> = current
        .into_iter()
        .map(|mut entry| {
            if let Some(details) = by_id.remove(&entry.app_id) {
                entry.title = details.title;
                entry.description = details.description;
                entry.cover_url = details.cover_url;
                entry.hero_url = details.hero_url;
                entry.minimum_requirements = details.minimum_requirements;
                entry.recommended_requirements = details.recommended_requirements;
                entry.proton_tier = details.proton_tier;
                entry.app_type = details.app_type;
                entry.last_hydrated_at = details.last_hydrated_at;
            }
            entry
        })
        .collect();
    for leftover in by_id.into_values() {
        if merged.len() >= 2_000 {
            break;
        }
        if super::steam_catalog::is_placeholder_title(&leftover.title, &leftover.app_id)
            && super::steam_catalog::is_thin_description(leftover.description.as_deref())
        {
            continue;
        }
        merged.push(leftover);
    }
    merged
}

pub fn schedule(
    app: AppHandle,
    mut entries: Vec<SteamCatalogEntry>,
    key: Option<String>,
    installed: HashSet<String>,
    favorites: HashSet<String>,
    force: bool,
    account: Option<String>,
) {
    let Some(job) = Job::claim(&app.state::<crate::AppState>().steam_catalog_job) else {
        return;
    };
    tauri::async_runtime::spawn(async move {
        let _job = job;
        if !super::steam_catalog::hydrate(
            &mut entries,
            key.as_deref(),
            &installed,
            &favorites,
            force,
        )
        .await
        {
            return;
        }
        let cloned = app.clone();
        let result = tauri::async_runtime::spawn_blocking(move || {
            let state = cloned.state::<crate::AppState>();
            if super::steam_windows::stored_account(&state.repo)? != account {
                return Ok(false);
            }
            let current = super::steam_windows::stored_entries(&state.repo)?;
            super::steam_windows::save_library(&state.repo, &merge_metadata(current, entries))?;
            Ok::<_, String>(true)
        })
        .await;
        match result {
            Ok(Ok(true)) => {
                if let Err(error) = app.emit("steam-library-updated", ()) {
                    eprintln!("Steam library notification failed: {error}");
                }
            }
            Ok(Ok(false)) => {}
            _ => {
                if let Err(error) = app.emit("steam-library-error", "Steam library details could not be saved. Your owned library is still available.") { eprintln!("Steam library notification failed: {error}"); }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn background_metadata_never_restores_removed_games_or_old_playtime() {
        let mut current = SteamCatalogEntry::from_app_id("1593500").unwrap();
        current.playtime_seconds = 600;
        let mut hydrated = current.clone();
        hydrated.playtime_seconds = 0;
        hydrated.description = Some("New details".into());
        let removed = SteamCatalogEntry::from_app_id("570").unwrap();
        let merged = merge_metadata(vec![current], vec![hydrated, removed]);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].playtime_seconds, 600);
        assert_eq!(merged[0].description.as_deref(), Some("New details"));
    }
    #[test]
    fn hydrated_extra_library_titles_are_kept_after_owned_snapshot_changes() {
        let current = SteamCatalogEntry::from_app_id("1593500").unwrap();
        let leftover = SteamCatalogEntry {
            app_id: "447040".into(),
            title: "Watch_Dogs 2".into(),
            description: Some(
                "Play as a brilliant young hacker, and make your own history in a vibrant, open world."
                    .into(),
            ),
            last_hydrated_at: Some(chrono::Utc::now().to_rfc3339()),
            ..SteamCatalogEntry::default()
        };
        let merged = merge_metadata(vec![current], vec![leftover]);
        assert!(merged.iter().any(|entry| entry.app_id == "447040"));
        assert_eq!(merged.len(), 2);
    }

    #[test]
    fn only_one_metadata_job_can_run_and_drop_releases_it() {
        let busy = Arc::new(AtomicBool::new(false));
        let first = Job::claim(&busy).unwrap();
        assert!(Job::claim(&busy).is_none());
        drop(first);
        assert!(Job::claim(&busy).is_some());
    }
}
