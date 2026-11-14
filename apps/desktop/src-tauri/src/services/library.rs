//! One title identity shared by Library, Home, Search and Details.
use std::collections::HashMap;
use std::path::Path;
use serde::{Deserialize, Serialize};
use crate::models::{Game, GameArtwork, GamePlatform, GameProvider, LaunchConfiguration};
use super::steam_catalog::{self, SteamCatalogEntry};
use super::steam_download::valid_app_id;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Installation {
    pub id: String,
    pub game_id: String,
    pub platform: GamePlatform,
    pub path: Option<String>,
    pub available: bool,
    pub launch_type: String,
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
        LaunchConfiguration::Wine { .. } if matches!(game.provider, GameProvider::Steam | GameProvider::Gamehub | GameProvider::Manual) => game.source_id.as_deref(),
        _ => None,
    };
    id.filter(|id| valid_app_id(id)).map(str::to_string)
}

fn installation(game: &Game) -> Installation {
    let path = match &game.launch_config {
        LaunchConfiguration::Wine { profile } => Some(profile.executable.clone()),
        LaunchConfiguration::OpenFile { file_path, .. } => Some(file_path.clone()),
        LaunchConfiguration::OpenApplication { application_path, .. } => Some(application_path.clone()),
        LaunchConfiguration::CustomCommand { executable, .. } => Some(executable.clone()),
        _ => None,
    };
    let available = path.as_ref().is_none_or(|path| Path::new(path).exists());
    let path = path.map(|path| Path::new(&path).canonicalize().map(|p| p.to_string_lossy().into_owned()).unwrap_or(path));
    let id = format!("{}:{}:{}", steam_id(game).unwrap_or_else(|| game.id.clone()), game.platform.as_str(), path.as_deref().unwrap_or(&game.id));
    let launch_type = match &game.launch_config {
        LaunchConfiguration::Wine { .. } => "wine",
        LaunchConfiguration::Steam { .. } => "steam",
        LaunchConfiguration::OpenFile { .. } => "open-file",
        LaunchConfiguration::OpenApplication { .. } => "open-application",
        LaunchConfiguration::OpenUrl { .. } => "open-url",
        LaunchConfiguration::CustomCommand { .. } => "custom-command",
        LaunchConfiguration::Gamehub { .. } => "gamehub",
    }
    .to_string();
    Installation { id, game_id: game.id.clone(), platform: game.platform.clone(), path, available, launch_type }
}

/// O(n + m) grouping, then O(t log t) deterministic title ordering; no IPC or SQL per title.
pub fn merge(games: Vec<Game>, catalog: Vec<SteamCatalogEntry>) -> Vec<LibraryEntry> {
    let mut entries: HashMap<String, LibraryEntry> = HashMap::new();
    for game in games {
        if game.provider == GameProvider::Gamehub { continue; }
        let app_id = steam_id(&game);
        let id = app_id.as_ref().map(|id| format!("steam:{id}")).unwrap_or_else(|| game.id.clone());
        let install = installation(&game);
        match entries.get_mut(&id) {
            Some(entry) => {
                entry.game.favorite |= game.favorite;
                entry.game.hidden &= game.hidden;
                entry.game.total_playtime_seconds += game.total_playtime_seconds;
                if game.last_played_at > entry.game.last_played_at { entry.game.last_played_at = game.last_played_at.clone(); }
                if !entry.installations.iter().any(|i| i.id == install.id) { entry.installations.push(install); }
            }
            None => { entries.insert(id.clone(), LibraryEntry { id, game, steam_app_id: app_id, owned: false, installations: vec![install], preferred_installation_id: None, run_info: None }); }
        }
    }
    for item in catalog {
        let id = format!("steam:{}", item.app_id);
        let run = run_info(&item);
        if let Some(entry) = entries.get_mut(&id) {
            overlay_catalog(entry, &item, run);
            continue;
        }
        let game = Game {
            id: id.clone(), title: item.title.clone(), sort_title: item.title.to_lowercase(), description: item.description,
            provider: GameProvider::Steam, platform: GamePlatform::Windows, source_id: Some(item.app_id.clone()),
            launch_config: LaunchConfiguration::Steam { app_id: item.app_id.clone() },
            artwork: GameArtwork { cover: Some(steam_catalog::cover_url(&item.app_id)), hero: Some(item.hero_url.unwrap_or_else(|| steam_catalog::hero_url(&item.app_id))), icon: item.cover_url, logo: None },
            favorite: false, hidden: false, date_added: String::new(), last_played_at: None,
            total_playtime_seconds: 0, install_size_bytes: None, achievements: vec![],
        };
        entries.insert(id.clone(), LibraryEntry { id, game, steam_app_id: Some(item.app_id), owned: true, installations: vec![], preferred_installation_id: None, run_info: run });
    }
    let mut result: Vec<_> = entries.into_values().collect();
    for entry in &mut result {
        entry.installations.sort_by_key(|i| (!i.available, i.platform != GamePlatform::Macos, i.path.clone(), i.id.clone()));
    }
    result.sort_by(|a, b| a.game.sort_title.cmp(&b.game.sort_title).then(a.id.cmp(&b.id)));
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

fn overlay_catalog(entry: &mut LibraryEntry, item: &SteamCatalogEntry, run: Option<RunInfo>) {
    entry.owned = true;
    if crate::services::metadata_merge::is_placeholder_description(entry.game.description.as_deref())
    {
        if let Some(description) = item.description.clone() {
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
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{GameArtwork, GamePlatform, GameProvider, LaunchConfiguration};
    fn game(id: &str, source: Option<&str>, platform: GamePlatform) -> Game {
        Game { id: id.into(), title: "A game".into(), sort_title: "a game".into(),
            description: None, provider: GameProvider::Steam, platform,
            source_id: source.map(str::to_string), launch_config: LaunchConfiguration::Steam { app_id: source.unwrap_or("10").into() },
            artwork: GameArtwork::default(), favorite: false, hidden: false,
            date_added: "2026-11-14".into(), last_played_at: None, total_playtime_seconds: 0,
            install_size_bytes: None, achievements: vec![] }
    }
    #[test]
    fn one_title_keeps_both_installations_and_owned_catalog() {
        let local = vec![game("mac", Some("10"), GamePlatform::Macos), game("win", Some("10"), GamePlatform::Windows)];
        let catalog = vec![SteamCatalogEntry::from_app_id("10").unwrap(), SteamCatalogEntry::from_app_id("20").unwrap()];
        let entries = merge(local, catalog);
        assert_eq!(entries.len(), 2);
        let entry = entries.iter().find(|e| e.id == "steam:10").unwrap();
        assert_eq!(entry.installations.len(), 2);
        assert!(entry.owned);
        assert_eq!(entry.game.id, "mac");
    }
    #[test]
    fn equal_titles_never_merge_without_verified_identity() {
        let mut first = game("a", None, GamePlatform::Macos);
        first.launch_config = LaunchConfiguration::OpenApplication { application_path: "/a.app".into(), arguments: None };
        let mut second = first.clone(); second.id = "b".into();
        assert_eq!(merge(vec![first, second], vec![]).len(), 2);
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
        assert_eq!(entry.game.description.as_deref(), Some("Think with portals."));
        let run = entry.run_info.expect("requirements from the Steam catalog");
        assert_eq!(run.minimum.as_deref(), Some("OS: Windows 10"));
        assert_eq!(run.recommended.as_deref(), Some("8 GB RAM"));
        assert_eq!(run.proton_tier.as_deref(), Some("platinum"));
    }

    #[test]
    fn favorites_merge_and_hidden_requires_all_installations() {
        let mut first = game("a", Some("10"), GamePlatform::Macos);
        first.hidden = true; first.favorite = true;
        let second = game("b", Some("10"), GamePlatform::Windows);
        let entry = merge(vec![first, second], vec![]).remove(0);
        assert!(entry.game.favorite); assert!(!entry.game.hidden);
    }
}
