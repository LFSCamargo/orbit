//! The xCloud catalog as the UI sees it: cached per market, refreshed at most
//! daily, and annotated with library state. Being listed here never puts a
//! title in the library; only `xcloud_launch` does.

use std::collections::HashMap;

use serde::Serialize;

use crate::database::{GameRepository, MetadataCacheRepository};
use crate::models::{Game, GameArtwork, GamePlatform, GameProvider, LaunchConfiguration};
use crate::services::library::LibraryEntry;
use crate::services::thegamesdb::normalize_title;
use crate::services::xcloud_catalog::{self, Market, XcloudCatalogEntry};

pub const MARKET_SETTING: &str = "xbox-market";
const MAX_AGE_HOURS: i64 = 24;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct XcloudCatalogItem {
    #[serde(flatten)]
    pub entry: XcloudCatalogEntry,
    /// Library id once the title has been played through Orbit.
    pub library_game_id: Option<String>,
    /// Other providers that already have this title (e.g. `steam`).
    pub also_on: Vec<GameProvider>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct XcloudCatalog {
    pub market: String,
    pub fetched_at: Option<String>,
    pub stale: bool,
    pub error: Option<String>,
    pub items: Vec<XcloudCatalogItem>,
}

pub fn market(repo: &GameRepository) -> Market {
    let stored = repo
        .get_setting(MARKET_SETTING)
        .ok()
        .flatten()
        .and_then(|v| v.as_str().map(str::to_string));
    Market::parse(stored.as_deref())
}

pub fn is_stale(fetched_at: Option<&str>, now: chrono::DateTime<chrono::Utc>) -> bool {
    fetched_at
        .and_then(|at| chrono::DateTime::parse_from_rfc3339(at).ok())
        .is_none_or(|at| now.signed_duration_since(at) > chrono::Duration::hours(MAX_AGE_HOURS))
}

/// Cached catalog, refreshed when stale or forced. A failed refresh keeps
/// serving the previous catalog and reports the error alongside it.
pub fn load(
    repo: &GameRepository,
    cache: &MetadataCacheRepository,
    force: bool,
    fetch: impl FnOnce(&Market) -> Result<Vec<XcloudCatalogEntry>, String>,
) -> Result<XcloudCatalog, String> {
    let market = market(repo);
    let key = market.language.clone();
    let mut fetched_at = cache
        .xcloud_catalog_fetched_at(&key)
        .map_err(|e| e.to_string())?;
    let mut error = None;
    let outdated = lacks_square_art(&cache.xcloud_catalog(&key).unwrap_or_default());
    if force || outdated || is_stale(fetched_at.as_deref(), chrono::Utc::now()) {
        match fetch(&market) {
            Ok(entries) if !entries.is_empty() => {
                let now = chrono::Utc::now().to_rfc3339();
                cache
                    .replace_xcloud_catalog(&key, &entries, &now)
                    .map_err(|e| e.to_string())?;
                fetched_at = Some(now);
            }
            Ok(_) => error = Some("Xbox returned an empty catalog".to_string()),
            Err(err) => error = Some(err),
        }
    }
    let entries = cache.xcloud_catalog(&key).map_err(|e| e.to_string())?;
    if entries.is_empty() {
        if let Some(err) = error {
            return Err(err);
        }
    }
    let games = repo.list_games().map_err(|e| e.to_string())?;
    Ok(XcloudCatalog {
        market: key,
        stale: is_stale(fetched_at.as_deref(), chrono::Utc::now()),
        fetched_at,
        error,
        items: annotate(entries, &games),
    })
}

pub fn fetch_live(market: &Market) -> Result<Vec<XcloudCatalogEntry>, String> {
    xcloud_catalog::fetch(market)
}

/// A Game Pass catalog title that is not saved to the library.
pub fn is_unsaved(entry: &LibraryEntry) -> bool {
    entry.game.provider == GameProvider::Xcloud && entry.installations.is_empty()
}

/// Catalog titles not yet in the library, as entries with no installation:
/// they show in All games but never in Installed. Saved cloud games without
/// square art get it from the catalog. Cached data only. O(games + catalog).
pub fn catalog_library_entries(
    cache: &MetadataCacheRepository,
    repo: &GameRepository,
    games: &mut [Game],
) -> Vec<LibraryEntry> {
    let market = market(repo);
    let catalog = cache.xcloud_catalog(&market.language).unwrap_or_default();
    for game in fill_square_art(games, &catalog) {
        // Saved once, so screens that read games directly show it too.
        if let Some(icon) = game.1.as_deref() {
            let _ = repo.fill_missing_icon(&game.0, icon);
        }
    }
    unsaved_entries(catalog, games)
}

/// Gives saved cloud games the catalog's square art when they have none
/// (saved before Orbit read it). Returns the changed (game id, icon) pairs.
pub fn fill_square_art(
    games: &mut [Game],
    catalog: &[XcloudCatalogEntry],
) -> Vec<(String, Option<String>)> {
    let mut changed = Vec::new();
    let squares: std::collections::HashMap<&str, &str> = catalog
        .iter()
        .filter_map(|entry| Some((entry.product_id.as_str(), entry.square_url.as_deref()?)))
        .collect();
    for game in games.iter_mut() {
        if game.provider != GameProvider::Xcloud || game.artwork.icon.is_some() {
            continue;
        }
        if let Some(square) = game.source_id.as_deref().and_then(|id| squares.get(id)) {
            game.artwork.icon = Some((*square).to_string());
            changed.push((game.id.clone(), game.artwork.icon.clone()));
        }
    }
    changed
}

/// A catalog cached before square art was read; refresh it once.
fn lacks_square_art(catalog: &[XcloudCatalogEntry]) -> bool {
    !catalog.is_empty() && catalog.iter().all(|entry| entry.square_url.is_none())
}

pub fn unsaved_entries(catalog: Vec<XcloudCatalogEntry>, games: &[Game]) -> Vec<LibraryEntry> {
    let saved: std::collections::HashSet<&str> = games
        .iter()
        .filter(|g| g.provider == GameProvider::Xcloud)
        .filter_map(|g| g.source_id.as_deref())
        .collect();
    catalog
        .into_iter()
        .filter(|entry| !saved.contains(entry.product_id.as_str()))
        .map(|entry| {
            let id = crate::services::xcloud_launch::stable_key(&entry.product_id);
            LibraryEntry {
                id: id.clone(),
                game: Game {
                    id,
                    sort_title: entry.title.to_lowercase(),
                    title: entry.title,
                    description: None,
                    provider: GameProvider::Xcloud,
                    platform: GamePlatform::Cloud,
                    source_id: Some(entry.product_id),
                    launch_config: LaunchConfiguration::OpenUrl {
                        url: entry.launch_url,
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
                    install_size_bytes: None,
                    achievements: vec![],
                },
                steam_app_id: None,
                owned: false,
                installations: vec![],
                preferred_installation_id: None,
                run_info: None,
            }
        })
        .collect()
}

/// Links catalog titles to library games: the xCloud row by product id and
/// other providers by normalized title. Rows are never merged, so each
/// provider keeps its own launch method and metadata.
pub fn annotate(entries: Vec<XcloudCatalogEntry>, games: &[Game]) -> Vec<XcloudCatalogItem> {
    let mut cloud = HashMap::new();
    let mut by_title: HashMap<String, Vec<GameProvider>> = HashMap::new();
    for game in games {
        if game.provider == GameProvider::Xcloud {
            if let Some(id) = &game.source_id {
                cloud.insert(id.clone(), game.id.clone());
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
        .map(|entry| XcloudCatalogItem {
            library_game_id: cloud.get(&entry.product_id).cloned(),
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
    use crate::models::{GamePlatform, ImportedGame, LaunchConfiguration};

    fn entry(id: &str, title: &str) -> XcloudCatalogEntry {
        XcloudCatalogEntry {
            product_id: id.into(),
            title: title.into(),
            xbox_title_id: None,
            cover_url: None,
            square_url: None,
            hero_url: None,
            logo_url: None,
            launch_url: format!("https://www.xbox.com/en-US/play/launch/x/{id}"),
        }
    }

    fn steam_game(title: &str) -> ImportedGame {
        ImportedGame {
            stable_key: format!("steam:{title}"),
            title: title.into(),
            sort_title: title.to_lowercase(),
            description: None,
            provider: GameProvider::Steam,
            platform: GamePlatform::Windows,
            source_id: Some("1".into()),
            launch_config: LaunchConfiguration::Steam { app_id: "1".into() },
            artwork: Default::default(),
            total_playtime_seconds: 0,
            install_size_bytes: None,
            achievements: vec![],
        }
    }

    #[test]
    fn catalog_discovery_never_adds_library_games() {
        let repo = GameRepository::open_in_memory().unwrap();
        let cache = MetadataCacheRepository::open_in_memory().unwrap();
        let catalog = load(&repo, &cache, true, |_| {
            Ok(vec![
                entry("9P8LR42PTRGJ", "Halo"),
                entry("9NGLST31DG26", "Forza"),
            ])
        })
        .unwrap();
        assert_eq!(catalog.items.len(), 2);
        assert!(catalog.items.iter().all(|i| i.library_game_id.is_none()));
        assert!(repo.list_games().unwrap().is_empty());
    }

    #[test]
    fn serves_cache_when_refresh_fails() {
        let repo = GameRepository::open_in_memory().unwrap();
        let cache = MetadataCacheRepository::open_in_memory().unwrap();
        load(&repo, &cache, true, |_| {
            Ok(vec![entry("9P8LR42PTRGJ", "Halo")])
        })
        .unwrap();
        let catalog = load(&repo, &cache, true, |_| Err("offline".into())).unwrap();
        assert_eq!(catalog.items.len(), 1);
        assert_eq!(catalog.error.as_deref(), Some("offline"));
    }

    #[test]
    fn fails_without_cache_when_fetch_fails() {
        let repo = GameRepository::open_in_memory().unwrap();
        let cache = MetadataCacheRepository::open_in_memory().unwrap();
        assert!(load(&repo, &cache, false, |_| Err("offline".into())).is_err());
    }

    #[test]
    fn fresh_cache_skips_network() {
        let repo = GameRepository::open_in_memory().unwrap();
        let cache = MetadataCacheRepository::open_in_memory().unwrap();
        load(&repo, &cache, true, |_| {
            let mut halo = entry("9P8LR42PTRGJ", "Halo");
            halo.square_url = Some("https://store-images.s-microsoft.com/box".into());
            Ok(vec![halo])
        })
        .unwrap();
        let catalog = load(&repo, &cache, false, |_| panic!("must use cache")).unwrap();
        assert!(!catalog.stale);
    }

    #[test]
    fn uses_configured_market() {
        let repo = GameRepository::open_in_memory().unwrap();
        let cache = MetadataCacheRepository::open_in_memory().unwrap();
        repo.set_setting(MARKET_SETTING, &serde_json::json!("pt-BR"))
            .unwrap();
        let catalog = load(&repo, &cache, true, |market| {
            assert_eq!(market.market, "BR");
            Ok(vec![entry("9P8LR42PTRGJ", "Halo")])
        })
        .unwrap();
        assert_eq!(catalog.market, "pt-BR");
    }

    #[test]
    fn links_titles_from_other_providers_without_merging() {
        let repo = GameRepository::open_in_memory().unwrap();
        repo.upsert_imported(&[steam_game("Halo: The Master Chief Collection")])
            .unwrap();
        let cloud = entry("9P8LR42PTRGJ", "Halo The Master Chief Collection");
        crate::services::xcloud_launch::launch_catalog_entry(&repo, &cloud, |_| Ok(())).unwrap();
        let items = annotate(vec![cloud], &repo.list_games().unwrap());
        assert_eq!(items[0].also_on, vec![GameProvider::Steam]);
        assert!(items[0].library_game_id.is_some());
        assert_eq!(repo.list_games().unwrap().len(), 2);
    }

    #[test]
    fn unsaved_catalog_titles_join_all_games_without_installations() {
        let repo = GameRepository::open_in_memory().unwrap();
        let saved = entry("9P8LR42PTRGJ", "Halo");
        crate::services::xcloud_launch::save_catalog_entry(&repo, &saved).unwrap();
        let games = repo.list_games().unwrap();
        let entries = unsaved_entries(vec![saved, entry("9NGLST31DG26", "Forza")], &games);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].id, "xcloud:9NGLST31DG26");
        assert!(entries[0].installations.is_empty());
        assert_eq!(repo.list_games().unwrap().len(), 1);
    }

    #[test]
    fn cloud_games_get_square_art_for_the_home_shelf() {
        let mut square = entry("9NVQBQ3F6W9W", "Call of Duty");
        square.square_url = Some("https://store-images.s-microsoft.com/box".into());
        let unsaved = unsaved_entries(vec![square.clone()], &[]);
        assert_eq!(
            unsaved[0].game.artwork.icon.as_deref(),
            Some("https://store-images.s-microsoft.com/box")
        );
        // A game saved before square art was read gets it from the catalog.
        let repo = GameRepository::open_in_memory().unwrap();
        crate::services::xcloud_launch::save_catalog_entry(
            &repo,
            &entry("9NVQBQ3F6W9W", "Call of Duty"),
        )
        .unwrap();
        let mut games = repo.list_games().unwrap();
        assert_eq!(games[0].artwork.icon, None);
        fill_square_art(&mut games, &[square]);
        assert_eq!(
            games[0].artwork.icon.as_deref(),
            Some("https://store-images.s-microsoft.com/box")
        );
    }

    #[test]
    fn saved_cloud_games_keep_square_art_on_every_screen() {
        // Regression: Call of Duty was saved before square art was read; the
        // library list filled it in memory, but the Home shelf reads saved
        // games directly and stayed blank.
        let repo = GameRepository::open_in_memory().unwrap();
        let cache = MetadataCacheRepository::open_in_memory().unwrap();
        crate::services::xcloud_launch::save_catalog_entry(
            &repo,
            &entry("9NLZZ74TFD7P", "Call of Duty"),
        )
        .unwrap();
        let mut square = entry("9NLZZ74TFD7P", "Call of Duty");
        square.square_url = Some("https://store-images.s-microsoft.com/box".into());
        cache
            .replace_xcloud_catalog(&market(&repo).language, &[square], "2026-11-20T00:00:00Z")
            .unwrap();
        let mut games = repo.list_games().unwrap();
        catalog_library_entries(&cache, &repo, &mut games);
        assert_eq!(
            repo.list_games().unwrap()[0].artwork.icon.as_deref(),
            Some("https://store-images.s-microsoft.com/box")
        );
    }

    #[test]
    fn a_catalog_cached_without_square_art_refreshes_once() {
        let repo = GameRepository::open_in_memory().unwrap();
        let cache = MetadataCacheRepository::open_in_memory().unwrap();
        load(&repo, &cache, true, |_| {
            Ok(vec![entry("9P8LR42PTRGJ", "Halo")])
        })
        .unwrap();
        let mut fetched = false;
        let catalog = load(&repo, &cache, false, |_| {
            fetched = true;
            let mut fresh = entry("9P8LR42PTRGJ", "Halo");
            fresh.square_url = Some("https://store-images.s-microsoft.com/box".into());
            Ok(vec![fresh])
        })
        .unwrap();
        assert!(fetched, "an old cache without square art refreshes");
        assert!(catalog.items[0].entry.square_url.is_some());
        // Now it has square art, so a fresh cache stays put.
        load(&repo, &cache, false, |_| panic!("must use cache")).unwrap();
    }

    #[test]
    fn staleness() {
        let now = chrono::Utc::now();
        assert!(is_stale(None, now));
        assert!(!is_stale(Some(&now.to_rfc3339()), now));
        let old = (now - chrono::Duration::hours(25)).to_rfc3339();
        assert!(is_stale(Some(&old), now));
    }
}
