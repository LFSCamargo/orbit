//! Microsoft Store / PC Game Pass catalog service: caches PC Game Pass SIGL titles
//! and merges user-owned Microsoft Store PC entitlements in O(catalog + owned).

use std::collections::{HashMap, HashSet};
use std::path::Path;

use orbit_msstore::catalog::{self, MsStoreCatalogEntry};
use serde::Serialize;

use crate::database::{GameRepository, MetadataCacheRepository};
use crate::models::{Game, GameArtwork, GamePlatform, GameProvider, LaunchConfiguration};
use crate::runtimes::WineProfile;
use crate::services::library::LibraryEntry;
use crate::services::thegamesdb::normalize_title;
use crate::services::xcloud_catalog::Market;
use crate::services::xcloud_library;

const MAX_AGE_HOURS: i64 = 24;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MsStoreCatalogItem {
    #[serde(flatten)]
    pub entry: MsStoreCatalogEntry,
    /// Library game id when installed locally.
    pub library_game_id: Option<String>,
    /// Other providers holding this title (e.g. `steam`, `xcloud`).
    pub also_on: Vec<GameProvider>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MsStoreCatalog {
    pub market: String,
    pub fetched_at: Option<String>,
    pub stale: bool,
    pub error: Option<String>,
    pub items: Vec<MsStoreCatalogItem>,
}

pub fn stable_key(product_id: &str) -> String {
    format!("msstore:{}", product_id.to_ascii_uppercase())
}

pub fn is_unsaved(entry: &LibraryEntry) -> bool {
    entry.game.provider == GameProvider::MsStore && entry.installations.is_empty()
}

pub fn is_stale(fetched_at: Option<&str>, now: chrono::DateTime<chrono::Utc>) -> bool {
    fetched_at
        .and_then(|at| chrono::DateTime::parse_from_rfc3339(at).ok())
        .is_none_or(|at| now.signed_duration_since(at) > chrono::Duration::hours(MAX_AGE_HOURS))
}

/// Loads the merged PC Game Pass + owned Microsoft Store PC catalog, refreshing when stale or forced.
pub fn load(
    repo: &GameRepository,
    cache: &MetadataCacheRepository,
    session_dir: &Path,
    force: bool,
) -> Result<MsStoreCatalog, String> {
    load_with(repo, cache, force, |market| {
        let mut catalog_entries =
            catalog::fetch_pc_gamepass_catalog(&market.market, &market.language)
                .map_err(|e| e.to_string())?;
        let mut owned_entries = Vec::new();
        if let Ok(user_token) =
            crate::services::msstore_auth::exchange_user_token(session_dir, "www.microsoft.com", "MBI_SSL")
        {
            if let Ok(owned_ids) =
                catalog::fetch_owned_product_ids(&user_token, &market.market, &market.language)
            {
                if !owned_ids.is_empty() {
                    if let Ok(resolved) = catalog::fetch_products_by_ids(
                        &owned_ids,
                        &market.market,
                        &market.language,
                        false,
                        true,
                    ) {
                        owned_entries = resolved;
                    }
                }
            }
        }
        // Mark titles present in both owned + Game Pass.
        let owned_set: HashSet<&str> = owned_entries
            .iter()
            .map(|e| e.product_id.as_str())
            .collect();
        for item in &mut catalog_entries {
            if owned_set.contains(item.product_id.as_str()) {
                item.owned = true;
            }
        }
        Ok((catalog_entries, owned_entries))
    })
}

/// Testable core accepting an injected fetcher `(catalog, owned)`.
pub fn load_with(
    repo: &GameRepository,
    cache: &MetadataCacheRepository,
    force: bool,
    fetch: impl FnOnce(&Market) -> Result<(Vec<MsStoreCatalogEntry>, Vec<MsStoreCatalogEntry>), String>,
) -> Result<MsStoreCatalog, String> {
    let market = xcloud_library::market(repo);
    let key = market.language.clone();
    let mut fetched_at = cache
        .msstore_catalog_fetched_at(&key)
        .map_err(|e| e.to_string())?;
    let mut error = None;

    if force || is_stale(fetched_at.as_deref(), chrono::Utc::now()) {
        match fetch(&market) {
            Ok((catalog_entries, owned_entries)) => {
                let now = chrono::Utc::now().to_rfc3339();
                if !catalog_entries.is_empty() {
                    cache
                        .replace_msstore_catalog(&key, &catalog_entries, &now)
                        .map_err(|e| e.to_string())?;
                    fetched_at = Some(now.clone());
                }
                if !owned_entries.is_empty() {
                    cache
                        .replace_msstore_owned(&owned_entries, &now)
                        .map_err(|e| e.to_string())?;
                }
            }
            Err(err) => error = Some(err),
        }
    }

    let catalog_entries = cache.msstore_catalog(&key).map_err(|e| e.to_string())?;
    let owned_entries = cache.msstore_owned().map_err(|e| e.to_string())?;
    let merged = merge_catalog_and_owned(catalog_entries, owned_entries);
    if merged.is_empty() {
        if let Some(err) = error {
            return Err(err);
        }
    }

    let games = repo.list_games().map_err(|e| e.to_string())?;
    Ok(MsStoreCatalog {
        market: key,
        stale: is_stale(fetched_at.as_deref(), chrono::Utc::now()),
        fetched_at,
        error,
        items: annotate(merged, &games),
    })
}

/// Merges PC Game Pass catalog entries with explicitly owned Microsoft Store PC titles in O(n + m).
pub fn merge_catalog_and_owned(
    catalog_entries: Vec<MsStoreCatalogEntry>,
    owned_entries: Vec<MsStoreCatalogEntry>,
) -> Vec<MsStoreCatalogEntry> {
    let mut by_id: HashMap<String, MsStoreCatalogEntry> = HashMap::new();
    let mut order: Vec<String> = Vec::new();

    for entry in owned_entries {
        let id = entry.product_id.to_ascii_uppercase();
        if !by_id.contains_key(&id) {
            order.push(id.clone());
        }
        let mut owned = entry;
        owned.product_id = id.clone();
        owned.owned = true;
        by_id.insert(id, owned);
    }

    for entry in catalog_entries {
        let id = entry.product_id.to_ascii_uppercase();
        if let Some(existing) = by_id.get_mut(&id) {
            existing.game_pass_pc = true;
            if existing.content_id.is_none() {
                existing.content_id = entry.content_id;
            }
            if existing.install_size_bytes.is_none() {
                existing.install_size_bytes = entry.install_size_bytes;
            }
        } else {
            order.push(id.clone());
            let mut item = entry;
            item.product_id = id.clone();
            by_id.insert(id, item);
        }
    }

    order.into_iter().filter_map(|id| by_id.remove(&id)).collect()
}

/// Converts cached uninstalled Microsoft Store titles into `LibraryEntry` rows
/// so they appear in Library browsing without mutating `orbit.sqlite3`. O(games + catalog).
pub fn catalog_library_entries(
    cache: &MetadataCacheRepository,
    repo: &GameRepository,
    games: &[Game],
) -> Vec<LibraryEntry> {
    let market = xcloud_library::market(repo);
    let catalog = cache.msstore_catalog(&market.language).unwrap_or_default();
    let owned = cache.msstore_owned().unwrap_or_default();
    let merged = merge_catalog_and_owned(catalog, owned);

    let installed_ids: HashSet<String> = games
        .iter()
        .filter(|g| g.provider == GameProvider::MsStore)
        .filter_map(|g| g.source_id.as_deref().map(str::to_ascii_uppercase))
        .collect();

    merged
        .into_iter()
        .filter(|entry| !installed_ids.contains(&entry.product_id))
        .map(|entry| {
            let id = stable_key(&entry.product_id);
            LibraryEntry {
                id: id.clone(),
                game: Game {
                    id,
                    sort_title: entry.title.to_lowercase(),
                    title: entry.title,
                    description: entry.description,
                    provider: GameProvider::MsStore,
                    platform: GamePlatform::Windows,
                    source_id: Some(entry.product_id),
                    launch_config: LaunchConfiguration::Wine {
                        profile: WineProfile::default(),
                    },
                    artwork: GameArtwork {
                        cover: entry.cover_url,
                        hero: entry.hero_url,
                        logo: entry.logo_url,
                        icon: entry.square_url,
                    },
                    favorite: false,
                    hidden: false,
                    date_added: String::new(),
                    last_played_at: None,
                    total_playtime_seconds: 0,
                    install_size_bytes: entry
                        .install_size_bytes
                        .and_then(|b| i64::try_from(b).ok()),
                    achievements: vec![],
                },
                steam_app_id: None,
                owned: entry.owned || entry.game_pass_pc,
                installations: vec![],
                preferred_installation_id: None,
                run_info: None,
            }
        })
        .collect()
}

pub fn annotate(entries: Vec<MsStoreCatalogEntry>, games: &[Game]) -> Vec<MsStoreCatalogItem> {
    let mut installed = HashMap::new();
    let mut by_title: HashMap<String, Vec<GameProvider>> = HashMap::new();
    for game in games {
        if game.provider == GameProvider::MsStore {
            if let Some(id) = &game.source_id {
                installed.insert(id.to_ascii_uppercase(), game.id.clone());
            }
        } else {
            let providers = by_title.entry(normalize_title(&game.title)).or_default();
            if !providers.contains(&game.provider) {
                providers.push(game.provider.clone());
            }
        }
    }
    entries
        .into_iter()
        .map(|entry| MsStoreCatalogItem {
            library_game_id: installed.get(&entry.product_id).cloned(),
            also_on: by_title
                .get(&normalize_title(&entry.title))
                .cloned()
                .unwrap_or_default(),
            entry,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(id: &str, title: &str, owned: bool, gp: bool) -> MsStoreCatalogEntry {
        MsStoreCatalogEntry {
            product_id: id.into(),
            title: title.into(),
            description: None,
            content_id: Some("11111111-2222-3333-4444-555555555555".into()),
            package_family_name: None,
            xbox_title_id: None,
            install_size_bytes: Some(2_000_000),
            cover_url: None,
            square_url: None,
            hero_url: None,
            logo_url: None,
            owned,
            game_pass_pc: gp,
        }
    }

    #[test]
    fn merges_owned_and_gamepass_titles_without_duplication() {
        let gp = vec![
            entry("9P8LR42PTRGJ", "33 Immortals", false, true),
            entry("9NGLST31DG26", "Forza Horizon 5", false, true),
        ];
        let owned = vec![
            entry("9NGLST31DG26", "Forza Horizon 5", true, false),
            entry("9NR6NJ401NBS", "Sea of Thieves", true, false),
        ];
        let merged = merge_catalog_and_owned(gp, owned);
        assert_eq!(merged.len(), 3);
        let forza = merged
            .iter()
            .find(|item| item.product_id == "9NGLST31DG26")
            .unwrap();
        assert!(forza.owned);
        assert!(forza.game_pass_pc);
    }

    #[test]
    fn caches_catalog_and_builds_library_entries_without_modifying_sqlite() {
        let repo = GameRepository::open_in_memory().unwrap();
        let cache = MetadataCacheRepository::open_in_memory().unwrap();
        let catalog = load_with(&repo, &cache, true, |_| {
            Ok((
                vec![entry("9P8LR42PTRGJ", "33 Immortals", false, true)],
                vec![entry("9NR6NJ401NBS", "Sea of Thieves", true, false)],
            ))
        })
        .unwrap();
        assert_eq!(catalog.items.len(), 2);
        assert!(repo.list_games().unwrap().is_empty());

        let lib_entries = catalog_library_entries(&cache, &repo, &[]);
        assert_eq!(lib_entries.len(), 2);
        assert!(lib_entries.iter().all(|e| is_unsaved(e)));
    }
}
