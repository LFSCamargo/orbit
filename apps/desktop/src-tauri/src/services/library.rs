//! One title identity shared by Library, Home, Search and Details.
use super::steam_catalog::{self, SteamCatalogEntry};
use super::steam_download::{find_game_executable, valid_app_id};
use super::steam_manifest::SteamInstallIndex;
use crate::database::GameRepository;
use crate::models::{Game, GameArtwork, GamePlatform, GameProvider, LaunchConfiguration};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Installation {
    pub id: String,
    pub game_id: String,
    pub platform: GamePlatform,
    pub path: Option<String>,
    pub available: bool,
    pub launch_type: String,
    /// Bytes on disk, when known.
    #[serde(default)]
    pub size_bytes: Option<i64>,
    /// Bytes SteamCMD downloaded for an Orbit install, when known.
    #[serde(default)]
    pub download_size_bytes: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEntry {
    pub id: String,
    pub game: Game,
    pub steam_app_id: Option<String>,
    pub owned: bool,
    pub installations: Vec<Installation>,
    pub preferred_installation_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_info: Option<RunInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RunInfo {
    pub minimum: Option<String>,
    pub recommended: Option<String>,
    pub proton_tier: Option<String>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryState {
    pub favorite: Option<bool>,
    pub hidden: Option<bool>,
    pub preferred_installation_id: Option<String>,
}

pub fn steam_id(game: &Game) -> Option<String> {
    let id = match &game.launch_config {
        LaunchConfiguration::Steam { app_id } => Some(app_id.as_str()),
        LaunchConfiguration::Wine { .. }
            if matches!(game.provider, GameProvider::Steam | GameProvider::Manual) =>
        {
            game.source_id.as_deref()
        }
        _ => None,
    };
    id.filter(|id| valid_app_id(id)).map(str::to_string)
}

fn installation(game: &Game) -> Installation {
    let path = match &game.launch_config {
        LaunchConfiguration::Wine { profile } => Some(profile.executable.clone()),
        LaunchConfiguration::OpenFile { file_path, .. } => Some(file_path.clone()),
        LaunchConfiguration::OpenApplication {
            application_path, ..
        } => Some(application_path.clone()),
        LaunchConfiguration::CustomCommand { executable, .. } => Some(executable.clone()),
        _ => None,
    };
    let available = path.as_ref().is_none_or(|path| Path::new(path).exists());
    let path = path.map(|path| {
        Path::new(&path)
            .canonicalize()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or(path)
    });
    let id = format!(
        "{}:{}:{}",
        steam_id(game).unwrap_or_else(|| game.id.clone()),
        game.platform.as_str(),
        path.as_deref().unwrap_or(&game.id)
    );
    let launch_type = match &game.launch_config {
        LaunchConfiguration::Wine { .. } => "wine",
        LaunchConfiguration::Steam { .. } => "steam",
        LaunchConfiguration::OpenFile { .. } => "open-file",
        LaunchConfiguration::OpenApplication { .. } => "open-application",
        LaunchConfiguration::OpenUrl { .. } => "open-url",
        LaunchConfiguration::CustomCommand { .. } => "custom-command",
    }
    .to_string();
    Installation {
        id,
        game_id: game.id.clone(),
        platform: game.platform.clone(),
        path,
        available,
        launch_type,
        size_bytes: game.install_size_bytes,
        download_size_bytes: None,
    }
}

/// O(n + m) grouping, then O(t log t) deterministic title ordering; no IPC or SQL per title.
pub fn merge(games: Vec<Game>, catalog: Vec<SteamCatalogEntry>) -> Vec<LibraryEntry> {
    // Software stays out even when installed; an unlisted app with a local
    // install is kept (a delisted game looks the same as Steam's own tools).
    let software: HashSet<String> = catalog
        .iter()
        .filter(|item| !steam_catalog::is_game(item, true))
        .map(|item| item.app_id.clone())
        .collect();
    let local: HashSet<String> = games.iter().filter_map(steam_id).collect();
    let mut entries: HashMap<String, LibraryEntry> = HashMap::new();
    for game in games {
        let app_id = steam_id(&game);
        if app_id.as_ref().is_some_and(|id| software.contains(id)) {
            continue;
        }
        let id = app_id
            .as_ref()
            .map(|id| format!("steam:{id}"))
            .or_else(|| {
                (game.provider == GameProvider::MsStore)
                    .then(|| game.source_id.as_deref())
                    .flatten()
                    .filter(|pid| orbit_msstore::valid_product_id(pid))
                    .map(|pid| format!("msstore:{}", pid.to_ascii_uppercase()))
            })
            .unwrap_or_else(|| game.id.clone());
        let install = installation(&game);
        match entries.get_mut(&id) {
            Some(entry) => {
                entry.game.favorite |= game.favorite;
                entry.game.hidden &= game.hidden;
                entry.game.total_playtime_seconds += game.total_playtime_seconds;
                if game.last_played_at > entry.game.last_played_at {
                    entry.game.last_played_at = game.last_played_at.clone();
                }
                if !entry.installations.iter().any(|i| i.id == install.id) {
                    entry.installations.push(install);
                }
            }
            None => {
                entries.insert(
                    id.clone(),
                    LibraryEntry {
                        id,
                        game,
                        steam_app_id: app_id,
                        owned: false,
                        installations: vec![install],
                        preferred_installation_id: None,
                        run_info: None,
                    },
                );
            }
        }
    }
    for item in catalog
        .into_iter()
        .filter(|item| steam_catalog::is_game(item, local.contains(&item.app_id)))
    {
        let id = format!("steam:{}", item.app_id);
        let run = run_info(&item);
        if let Some(entry) = entries.get_mut(&id) {
            overlay_catalog(entry, &item, run);
            continue;
        }
        let game = Game {
            id: id.clone(),
            title: item.title.clone(),
            sort_title: item.title.to_lowercase(),
            description: item.description,
            provider: GameProvider::Steam,
            platform: GamePlatform::Windows,
            source_id: Some(item.app_id.clone()),
            launch_config: LaunchConfiguration::Steam {
                app_id: item.app_id.clone(),
            },
            artwork: GameArtwork {
                cover: Some(steam_catalog::cover_url(&item.app_id)),
                hero: Some(
                    item.hero_url
                        .unwrap_or_else(|| steam_catalog::hero_url(&item.app_id)),
                ),
                icon: item.cover_url,
                logo: Some(steam_catalog::logo_url(&item.app_id)),
            },
            favorite: false,
            hidden: false,
            date_added: String::new(),
            last_played_at: item.last_played_at.clone(),
            total_playtime_seconds: item.playtime_seconds.max(0),
            install_size_bytes: None,
            achievements: vec![],
        };
        entries.insert(
            id.clone(),
            LibraryEntry {
                id,
                game,
                steam_app_id: Some(item.app_id),
                owned: true,
                installations: vec![],
                preferred_installation_id: None,
                run_info: run,
            },
        );
    }
    let mut result: Vec<_> = entries.into_values().collect();
    for entry in &mut result {
        entry.installations.sort_by_key(|i| {
            (
                !i.available,
                i.platform != GamePlatform::Macos,
                i.path.clone(),
                i.id.clone(),
            )
        });
    }
    result.sort_by(|a, b| {
        a.game
            .sort_title
            .cmp(&b.game.sort_title)
            .then(a.id.cmp(&b.id))
    });
    result
}

fn run_info(item: &SteamCatalogEntry) -> Option<RunInfo> {
    if item.minimum_requirements.is_none()
        && item.recommended_requirements.is_none()
        && item.proton_tier.is_none()
    {
        return None;
    }
    Some(RunInfo {
        minimum: item.minimum_requirements.clone(),
        recommended: item.recommended_requirements.clone(),
        proton_tier: item.proton_tier.clone(),
    })
}

pub fn placeholder_game_ids(games: &[Game]) -> HashSet<String> {
    games
        .iter()
        .filter(|game| {
            crate::services::metadata_merge::is_placeholder_description(game.description.as_deref())
        })
        .map(|game| game.id.clone())
        .collect()
}

/// Writes overlayed Steam store copy onto games that still have importer stubs.
/// O(n) scan; SQLite updates only for those stub rows.
pub fn persist_overlay_copy(
    repo: &GameRepository,
    stub_ids: &HashSet<String>,
    entries: &[LibraryEntry],
) -> Result<(), String> {
    for entry in entries {
        if !stub_ids.contains(&entry.game.id) {
            continue;
        }
        if crate::services::metadata_merge::is_placeholder_description(
            entry.game.description.as_deref(),
        ) {
            continue;
        }
        repo.update_fetched_metadata(
            &entry.game.id,
            Some(entry.game.title.clone()),
            entry.game.description.clone(),
            None,
        )
        .map_err(|err| err.to_string())?;
    }
    Ok(())
}

fn overlay_catalog(entry: &mut LibraryEntry, item: &SteamCatalogEntry, run: Option<RunInfo>) {
    entry.owned = true;
    if crate::services::metadata_merge::is_placeholder_description(
        entry.game.description.as_deref(),
    ) {
        if let Some(description) = item
            .description
            .clone()
            .filter(|text| !crate::services::metadata_merge::is_placeholder_description(Some(text)))
        {
            entry.game.description = Some(description);
        }
    }
    if steam_catalog::is_placeholder_title(&entry.game.title, &item.app_id) {
        entry.game.title = item.title.clone();
        entry.game.sort_title = item.title.to_lowercase();
    }
    if entry.run_info.is_none() {
        entry.run_info = run;
    }
    if item.playtime_seconds > entry.game.total_playtime_seconds {
        entry.game.total_playtime_seconds = item.playtime_seconds;
    }
    entry.game.last_played_at = crate::utils::steam_playtime::later_stamp(
        entry.game.last_played_at.clone(),
        item.last_played_at.clone(),
    );
}

/// Mark additional Steam library folders as installed Windows copies.
/// O(n) over library entries with O(1) install lookups; executable discovery
/// stays inside its existing 400-entry budget and only runs on index hits.
pub fn attach_windows_installs(entries: &mut [LibraryEntry], index: &SteamInstallIndex) {
    for entry in entries {
        let Some(app_id) = entry.steam_app_id.as_deref() else {
            continue;
        };
        let Some(install) = index.by_id.get(app_id) else {
            continue;
        };
        let Some(exe) = find_game_executable(&install.install_dir) else {
            continue;
        };
        let path = exe
            .canonicalize()
            .unwrap_or(exe)
            .to_string_lossy()
            .into_owned();
        if entry
            .installations
            .iter()
            .any(|item| item.path.as_deref() == Some(path.as_str()))
        {
            continue;
        }
        let game_id = entry
            .installations
            .iter()
            .find(|item| item.launch_type == "wine")
            .map(|item| item.game_id.clone())
            .unwrap_or_else(|| entry.game.id.clone());
        entry.installations.push(Installation {
            id: format!("{app_id}:windows:{path}"),
            game_id,
            platform: GamePlatform::Windows,
            path: Some(path),
            available: true,
            launch_type: "wine".into(),
            size_bytes: install.size_on_disk,
            download_size_bytes: None,
        });
        entry.installations.sort_by_key(|item| {
            (
                !item.available,
                item.platform != GamePlatform::Macos,
                item.path.clone(),
                item.id.clone(),
            )
        });
    }
}

/// Whether `id` names this entry: its own id, one of its installations' game
/// ids, or (for a saved cloud title) the `xcloud:{productId}` it had in the
/// catalog. O(installations).
pub fn entry_matches(entry: &LibraryEntry, id: &str) -> bool {
    if entry.id == id || entry.installations.iter().any(|i| i.game_id == id) {
        return true;
    }
    if id.strip_prefix("xcloud:").is_some_and(|product| {
        entry.game.provider == crate::models::GameProvider::Xcloud
            && entry
                .game
                .source_id
                .as_deref()
                .is_some_and(|source| source.eq_ignore_ascii_case(product))
    }) {
        return true;
    }
    id.strip_prefix("msstore:").is_some_and(|product| {
        entry.game.provider == crate::models::GameProvider::MsStore
            && entry
                .game
                .source_id
                .as_deref()
                .is_some_and(|source| source.eq_ignore_ascii_case(product))
    })
}

/// Fills download sizes recorded by the queue. O(n · i) over entries and
/// their installations with an O(1) map lookup; no I/O.
pub fn apply_download_sizes(entries: &mut [LibraryEntry], sizes: &HashMap<String, i64>) {
    for entry in entries {
        let Some(bytes) = entry.steam_app_id.as_ref().and_then(|id| sizes.get(id)) else {
            continue;
        };
        for install in &mut entry.installations {
            if install.launch_type == "wine" && is_orbit_managed(install.path.as_deref()) {
                install.download_size_bytes = Some(*bytes);
            }
        }
    }
}

/// True for game files Orbit downloaded itself, which Orbit may uninstall.
pub fn is_orbit_managed(path: Option<&str>) -> bool {
    path.is_some_and(|path| {
        path.contains("/runtimes/containers/games/steam-")
            || path.contains("/runtimes/containers/games/msstore-")
            || path.contains("/steam-windows/games/")
            || path.contains("/Orbit Games/msstore/")
    })
}

/// Orbit downloads plus Windows games in a Steam library folder; never the
/// `steam-windows` client prefix.
pub fn is_uninstallable(path: Option<&str>) -> bool {
    is_orbit_managed(path)
        || path.is_some_and(|path| {
            path.contains("/steamapps/common/") && !path.contains("/steam-windows/")
        })
}

pub fn apply_playtimes(
    entries: &mut [LibraryEntry],
    records: &std::collections::HashMap<String, crate::utils::steam_playtime::SteamPlayRecord>,
) {
    for entry in entries {
        let Some(app_id) = entry.steam_app_id.as_deref() else {
            continue;
        };
        let Some(record) = records.get(app_id) else {
            continue;
        };
        if record.seconds > entry.game.total_playtime_seconds {
            entry.game.total_playtime_seconds = record.seconds;
        }
        entry.game.last_played_at = crate::utils::steam_playtime::later_stamp(
            entry.game.last_played_at.clone(),
            record.last_played_at.clone(),
        );
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{GameArtwork, GamePlatform, GameProvider, LaunchConfiguration};
    fn game(id: &str, source: Option<&str>, platform: GamePlatform) -> Game {
        Game {
            id: id.into(),
            title: "A game".into(),
            sort_title: "a game".into(),
            description: None,
            provider: GameProvider::Steam,
            platform,
            source_id: source.map(str::to_string),
            launch_config: LaunchConfiguration::Steam {
                app_id: source.unwrap_or("10").into(),
            },
            artwork: GameArtwork::default(),
            favorite: false,
            hidden: false,
            date_added: "2026-11-14".into(),
            last_played_at: None,
            total_playtime_seconds: 0,
            install_size_bytes: None,
            achievements: vec![],
        }
    }
    #[test]
    fn a_cloud_title_keeps_its_page_after_it_is_saved() {
        // Regression: Add on a cloud title's page saved it under the game's
        // own id, so the page (looking up `xcloud:{product}`) said "Game not
        // found".
        let mut cloud = game("saved-uuid", Some("9P8LR42PTRGJ"), GamePlatform::Cloud);
        cloud.provider = GameProvider::Xcloud;
        cloud.launch_config = LaunchConfiguration::OpenUrl {
            url: "https://www.xbox.com/en-US/play/launch/a-game/9P8LR42PTRGJ".into(),
        };
        let entries = merge(vec![cloud], vec![]);
        let saved = &entries[0];
        assert!(entry_matches(saved, "saved-uuid"));
        assert!(entry_matches(saved, "xcloud:9P8LR42PTRGJ"));
        assert!(!entry_matches(saved, "xcloud:OTHER"));
        // A Steam title with the same source id is not a cloud title.
        let steam = &merge(
            vec![game("s", Some("9P8LR42PTRGJ"), GamePlatform::Windows)],
            vec![],
        )[0];
        assert!(!entry_matches(steam, "xcloud:9P8LR42PTRGJ"));
    }

    #[test]
    fn played_cloud_game_is_a_virtual_install_without_a_path() {
        let mut cloud = game("cloud", Some("9P8LR42PTRGJ"), GamePlatform::Cloud);
        cloud.provider = GameProvider::Xcloud;
        cloud.launch_config = LaunchConfiguration::OpenUrl {
            url: "https://www.xbox.com/en-US/play/launch/a-game/9P8LR42PTRGJ".into(),
        };
        let mut steam = game("win", Some("10"), GamePlatform::Windows);
        steam.title = "A game".into();
        let entries = merge(vec![cloud, steam], vec![]);
        assert_eq!(
            entries.len(),
            2,
            "cloud and Steam copies stay separate titles"
        );
        let cloud = entries.iter().find(|e| e.id == "cloud").unwrap();
        assert_eq!(cloud.steam_app_id, None);
        let install = &cloud.installations[0];
        assert_eq!(install.path, None);
        assert!(install.available);
        assert_eq!(install.launch_type, "open-url");
        assert_eq!(install.size_bytes, None);
    }
    #[test]
    fn one_title_keeps_both_installations_and_owned_catalog() {
        let local = vec![
            game("mac", Some("10"), GamePlatform::Macos),
            game("win", Some("10"), GamePlatform::Windows),
        ];
        let catalog = vec![
            SteamCatalogEntry::from_app_id("10").unwrap(),
            SteamCatalogEntry::from_app_id("20").unwrap(),
        ];
        let entries = merge(local, catalog);
        assert_eq!(entries.len(), 2);
        let entry = entries.iter().find(|e| e.id == "steam:10").unwrap();
        assert_eq!(entry.installations.len(), 2);
        assert!(entry.owned);
        assert_eq!(entry.game.id, "mac");
        let catalog_only = entries.iter().find(|e| e.id == "steam:20").unwrap();
        assert_eq!(
            catalog_only.game.artwork.logo.as_deref(),
            Some("https://cdn.akamai.steamstatic.com/steam/apps/20/logo.png")
        );
    }
    #[test]
    fn steam_software_is_left_out_of_the_library() {
        // Driver Booster and similar tools are owned Steam apps, not games.
        let mut tool = SteamCatalogEntry::from_app_id("30").unwrap();
        tool.app_type = Some("application".into());
        let mut game_entry = SteamCatalogEntry::from_app_id("10").unwrap();
        game_entry.app_type = Some("game".into());
        let unclassified = SteamCatalogEntry::from_app_id("20").unwrap();
        // A local Windows install of the same tool stays hidden too.
        let local = vec![game("tool-install", Some("30"), GamePlatform::Windows)];
        let entries = merge(local, vec![tool, game_entry, unclassified]);
        let mut ids: Vec<_> = entries.iter().map(|entry| entry.id.as_str()).collect();
        ids.sort();
        assert_eq!(ids, ["steam:10", "steam:20"]);

        // Unlisted apps (Steam's client, delisted games) need a local install.
        let mut client = SteamCatalogEntry::from_app_id("7").unwrap();
        client.app_type = Some("unlisted".into());
        let mut delisted = SteamCatalogEntry::from_app_id("40").unwrap();
        delisted.app_type = Some("unlisted".into());
        let local = vec![game("delisted-install", Some("40"), GamePlatform::Windows)];
        let entries = merge(local, vec![client, delisted]);
        let ids: Vec<_> = entries.iter().map(|entry| entry.id.as_str()).collect();
        assert_eq!(ids, ["steam:40"]);
    }
    #[test]
    fn equal_titles_never_merge_without_verified_identity() {
        let mut first = game("a", None, GamePlatform::Macos);
        first.launch_config = LaunchConfiguration::OpenApplication {
            application_path: "/a.app".into(),
            arguments: None,
        };
        let mut second = first.clone();
        second.id = "b".into();
        assert_eq!(merge(vec![first, second], vec![]).len(), 2);
    }
    #[test]
    fn persist_overlay_copy_replaces_a_legacy_import_stub_in_sqlite() {
        let repo = crate::database::GameRepository::open_in_memory().unwrap();
        let stored = repo
            .create_game(crate::models::CreateGameRequest {
                title: "Watch_Dogs 2".into(),
                description: Some(
                    "Imported from a GameHub Steam install (AppID 447040). Play uses Orbit's compatibility layer."
                        .into(),
                ),
                provider: GameProvider::Steam,
                platform: GamePlatform::Windows,
                launch_config: LaunchConfiguration::Steam {
                    app_id: "447040".into(),
                },
                artwork: None,
                install_size_bytes: None,
            })
            .unwrap();
        let stubs = placeholder_game_ids(std::slice::from_ref(&stored));
        let mut overlayed = stored.clone();
        overlayed.description = Some(
            "Play as Marcus Holloway, a brilliant young hacker living in the birthplace of the tech revolution."
                .into(),
        );
        persist_overlay_copy(
            &repo,
            &stubs,
            &[LibraryEntry {
                id: "steam:447040".into(),
                game: overlayed,
                steam_app_id: Some("447040".into()),
                owned: true,
                installations: Vec::new(),
                preferred_installation_id: None,
                run_info: None,
            }],
        )
        .unwrap();
        let updated = repo.get_game(&stored.id).unwrap().unwrap();
        assert!(updated
            .description
            .as_deref()
            .unwrap()
            .contains("Marcus Holloway"));
        assert!(!updated.description.as_deref().unwrap().contains("GameHub"));
    }

    #[test]
    fn catalog_copy_replaces_importer_placeholders_and_carries_requirements() {
        let mut local = game("win", Some("10"), GamePlatform::Windows);
        local.description = Some("Imported from GameHub.".into());
        local.title = "Steam 10".into();
        let catalog = SteamCatalogEntry {
            app_id: "10".into(),
            title: "Portal".into(),
            description: Some("Think with portals.".into()),
            minimum_requirements: Some("OS: Windows 10".into()),
            recommended_requirements: Some("8 GB RAM".into()),
            proton_tier: Some("platinum".into()),
            ..SteamCatalogEntry::default()
        };
        let entry = merge(vec![local], vec![catalog]).remove(0);
        assert_eq!(entry.game.title, "Portal");
        assert_eq!(
            entry.game.description.as_deref(),
            Some("Think with portals.")
        );
        let run = entry.run_info.expect("requirements from the Steam catalog");
        assert_eq!(run.minimum.as_deref(), Some("OS: Windows 10"));
        assert_eq!(run.recommended.as_deref(), Some("8 GB RAM"));
        assert_eq!(run.proton_tier.as_deref(), Some("platinum"));
    }

    #[test]
    fn catalog_placeholders_do_not_replace_cleared_copy() {
        let mut local = game("win", Some("447040"), GamePlatform::Windows);
        local.description = None;
        let catalog = SteamCatalogEntry {
            app_id: "447040".into(),
            title: "Watch_Dogs 2".into(),
            description: Some(
                "Imported from a GameHub Steam install (AppID 447040). Play uses Orbit’s compatibility layer."
                    .into(),
            ),
            ..SteamCatalogEntry::default()
        };
        let entry = merge(vec![local], vec![catalog]).remove(0);
        assert!(entry.game.description.is_none());
    }

    #[test]
    fn catalog_playtime_fills_never_played_titles_and_keeps_longer_local() {
        let mut local = game("win", Some("10"), GamePlatform::Windows);
        local.total_playtime_seconds = 60;
        let catalog = SteamCatalogEntry {
            app_id: "10".into(),
            title: "Portal".into(),
            playtime_seconds: 3600,
            last_played_at: Some("2023-11-14T22:13:20Z".into()),
            ..SteamCatalogEntry::default()
        };
        let entry = merge(vec![local], vec![catalog]).remove(0);
        assert_eq!(entry.game.total_playtime_seconds, 3600);
        assert_eq!(
            entry.game.last_played_at.as_deref(),
            Some("2023-11-14T22:13:20Z")
        );
        let mut longer = game("win", Some("20"), GamePlatform::Windows);
        longer.total_playtime_seconds = 7200;
        longer.last_played_at = Some("2024-01-01T00:00:00Z".into());
        let shorter = SteamCatalogEntry {
            app_id: "20".into(),
            playtime_seconds: 60,
            last_played_at: Some("2023-11-14T22:13:20Z".into()),
            ..SteamCatalogEntry::default()
        };
        let kept = merge(vec![longer], vec![shorter]).remove(0);
        assert_eq!(kept.game.total_playtime_seconds, 7200);
        assert_eq!(
            kept.game.last_played_at.as_deref(),
            Some("2024-01-01T00:00:00Z")
        );
        let owned = merge(
            vec![],
            vec![SteamCatalogEntry {
                app_id: "30".into(),
                title: "Half-Life".into(),
                playtime_seconds: 480,
                last_played_at: Some("2023-11-14T22:13:20Z".into()),
                ..SteamCatalogEntry::default()
            }],
        )
        .remove(0);
        assert_eq!(owned.game.total_playtime_seconds, 480);
    }

    #[test]
    fn favorites_merge_and_hidden_requires_all_installations() {
        let mut first = game("a", Some("10"), GamePlatform::Macos);
        first.hidden = true;
        first.favorite = true;
        let second = game("b", Some("10"), GamePlatform::Windows);
        let entry = merge(vec![first, second], vec![]).remove(0);
        assert!(entry.game.favorite);
        assert!(!entry.game.hidden);
    }

    #[test]
    fn additional_library_installs_show_as_installed_windows_copies() {
        let root = std::env::temp_dir().join(format!("orbit-attach-{}", uuid::Uuid::new_v4()));
        let common = root.join("steamapps/common/RE2");
        std::fs::create_dir_all(&common).unwrap();
        std::fs::write(common.join("re2.exe"), b"MZ").unwrap();
        let mut index = SteamInstallIndex::default();
        index.by_id.insert(
            "883710".into(),
            crate::services::steam_manifest::SteamInstall {
                app_id: "883710".into(),
                title: "Resident Evil 2".into(),
                install_dir: common.canonicalize().unwrap(),
                size_on_disk: None,
            },
        );
        let mut entries = merge(
            vec![],
            vec![SteamCatalogEntry::from_app_id("883710").unwrap()],
        );
        assert!(entries[0].installations.is_empty());
        attach_windows_installs(&mut entries, &index);
        assert_eq!(entries[0].installations.len(), 1);
        assert!(entries[0].installations[0].available);
        assert_eq!(entries[0].installations[0].launch_type, "wine");
        assert_eq!(entries[0].installations[0].platform, GamePlatform::Windows);
        attach_windows_installs(&mut entries, &index);
        assert_eq!(entries[0].installations.len(), 1);
        let _ = std::fs::remove_dir_all(root);
    }
}
