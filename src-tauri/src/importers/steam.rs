use async_trait::async_trait;
use regex::Regex;
use std::fs;
use std::path::{Path, PathBuf};

use super::{GameImporter, ImportError};
use crate::models::{
    Achievement, GameArtwork, GamePlatform, GameProvider, ImportedGame, LaunchConfiguration,
};
use crate::utils::size::path_size_bytes;

pub struct SteamImporter {
    steam_root: Option<PathBuf>,
}

impl SteamImporter {
    pub fn new(steam_root: Option<PathBuf>) -> Self {
        Self {
            steam_root: steam_root.or_else(detect_steam_root),
        }
    }

    pub fn steam_root(&self) -> Option<&PathBuf> {
        self.steam_root.as_ref()
    }
}

#[async_trait]
impl GameImporter for SteamImporter {
    async fn detect(&self) -> Result<bool, ImportError> {
        Ok(self
            .steam_root
            .as_ref()
            .map(|path| path.exists())
            .unwrap_or(false))
    }

    async fn discover_games(&self) -> Result<Vec<ImportedGame>, ImportError> {
        let Some(root) = &self.steam_root else {
            return Ok(Vec::new());
        };

        let playtime_map = load_steam_playtimes(root);
        let achievement_map = load_steam_achievements(root);

        let mut library_paths = vec![root.clone()];
        let vdf = root.join("steamapps/libraryfolders.vdf");
        if vdf.exists() {
            library_paths.extend(parse_library_folders(&vdf)?);
        }

        let mut games = Vec::new();
        for library in library_paths {
            let steamapps = if library.ends_with("steamapps") {
                library
            } else {
                library.join("steamapps")
            };
            if !steamapps.exists() {
                continue;
            }

            for entry in fs::read_dir(&steamapps)? {
                let entry = entry?;
                let name = entry.file_name().to_string_lossy().to_string();
                if !name.starts_with("appmanifest_") || !name.ends_with(".acf") {
                    continue;
                }
                let content = fs::read_to_string(entry.path())?;
                if let Some(mut game) = parse_appmanifest(&content, &steamapps) {
                    if let Some(app_id) = game.source_id.clone() {
                        if let Some(seconds) = playtime_map.get(&app_id) {
                            game.total_playtime_seconds = *seconds;
                        }
                        if let Some(achievements) = achievement_map.get(&app_id) {
                            game.achievements = achievements.clone();
                        }
                    }
                    games.push(game);
                }
            }
        }

        Ok(games)
    }
}

fn detect_steam_root() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let candidates = [
        home.join("Library/Application Support/Steam"),
        PathBuf::from("/Applications/Steam.app/Contents/MacOS"),
        home.join(".steam/steam"),
        home.join(".local/share/Steam"),
    ];
    candidates.into_iter().find(|path| path.exists())
}

fn parse_library_folders(path: &Path) -> Result<Vec<PathBuf>, ImportError> {
    let content = fs::read_to_string(path)?;
    let re = Regex::new(r#""path"\s+"([^"]+)""#).unwrap();
    Ok(re
        .captures_iter(&content)
        .filter_map(|capture| capture.get(1).map(|m| PathBuf::from(m.as_str())))
        .collect())
}

fn parse_appmanifest(content: &str, steamapps: &Path) -> Option<ImportedGame> {
    let app_id = vdf_value(content, "appid")?;
    let name = vdf_value(content, "name").unwrap_or_else(|| format!("Steam App {app_id}"));
    let installdir = vdf_value(content, "installdir");
    let size_on_disk = vdf_value(content, "SizeOnDisk")
        .or_else(|| vdf_value(content, "BytesToDownload"))
        .and_then(|value| value.parse::<i64>().ok());

    let install_size_bytes = size_on_disk.or_else(|| {
        installdir.as_ref().and_then(|dir| {
            let common = steamapps.join("common").join(dir);
            path_size_bytes(&common)
        })
    });

    let artwork = local_steam_artwork(steamapps, &app_id);

    Some(ImportedGame {
        stable_key: format!("steam:{app_id}"),
        title: name.clone(),
        sort_title: name.to_lowercase(),
        description: Some(format!("Imported from Steam library (AppID {app_id}).")),
        provider: GameProvider::Steam,
        platform: GamePlatform::Macos,
        source_id: Some(app_id.clone()),
        launch_config: LaunchConfiguration::Steam { app_id },
        artwork,
        total_playtime_seconds: 0,
        install_size_bytes,
        achievements: Vec::new(),
    })
}

fn vdf_value(content: &str, key: &str) -> Option<String> {
    let pattern = format!(r#""{key}"\s+"([^"]*)""#);
    let re = Regex::new(&pattern).ok()?;
    re.captures(content)
        .and_then(|capture| capture.get(1).map(|m| m.as_str().to_string()))
}

fn local_steam_artwork(steamapps: &Path, app_id: &str) -> GameArtwork {
    let library_cache = steamapps
        .parent()
        .map(|root| root.join("appcache/librarycache"))
        .unwrap_or_else(|| steamapps.join("librarycache"));

    let cover = [
        library_cache.join(format!("{app_id}_library_600x900.jpg")),
        library_cache.join(format!("{app_id}_library_capsule.jpg")),
    ]
    .into_iter()
    .find(|path| path.exists())
    .map(|path| path.to_string_lossy().to_string());

    let hero = [
        library_cache.join(format!("{app_id}_library_hero.jpg")),
        library_cache.join(format!("{app_id}_hero.jpg")),
    ]
    .into_iter()
    .find(|path| path.exists())
    .map(|path| path.to_string_lossy().to_string());

    let logo = library_cache
        .join(format!("{app_id}_logo.png"))
        .exists()
        .then(|| {
            library_cache
                .join(format!("{app_id}_logo.png"))
                .to_string_lossy()
                .to_string()
        });

    GameArtwork {
        cover,
        hero,
        logo,
        icon: None,
    }
}

/// Playtime minutes live in userdata/*/config/localconfig.vdf under apps/<id>/Playtime.
fn load_steam_playtimes(steam_root: &Path) -> std::collections::HashMap<String, i64> {
    let mut map = std::collections::HashMap::new();
    let userdata = steam_root.join("userdata");
    let Ok(entries) = fs::read_dir(userdata) else {
        return map;
    };

    for entry in entries.flatten() {
        let localconfig = entry.path().join("config/localconfig.vdf");
        if !localconfig.exists() {
            continue;
        }
        let Ok(content) = fs::read_to_string(&localconfig) else {
            continue;
        };
        parse_playtimes_from_localconfig(&content, &mut map);
    }

    map
}

fn parse_playtimes_from_localconfig(
    content: &str,
    map: &mut std::collections::HashMap<String, i64>,
) {
    // Match app blocks: "123456" { ... "Playtime" "42" ... }
    let app_re = Regex::new(r#""(\d+)"\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}"#).unwrap();
    let playtime_re = Regex::new(r#""Playtime"\s+"(\d+)""#).unwrap();

    for capture in app_re.captures_iter(content) {
        let Some(app_id) = capture.get(1).map(|m| m.as_str().to_string()) else {
            continue;
        };
        let Some(block) = capture.get(2).map(|m| m.as_str()) else {
            continue;
        };
        if let Some(pt) = playtime_re
            .captures(block)
            .and_then(|c| c.get(1))
            .and_then(|m| m.as_str().parse::<i64>().ok())
        {
            // Steam stores Playtime in minutes.
            let seconds = pt.saturating_mul(60);
            let entry = map.entry(app_id).or_insert(0);
            if seconds > *entry {
                *entry = seconds;
            }
        }
    }
}

/// Best-effort achievement parsing from librarycache JSON blobs Steam writes locally.
fn load_steam_achievements(
    steam_root: &Path,
) -> std::collections::HashMap<String, Vec<Achievement>> {
    let mut map = std::collections::HashMap::new();
    let library_cache = steam_root.join("appcache/librarycache");
    if !library_cache.exists() {
        // Also check userdata librarycache copies.
        if let Ok(entries) = fs::read_dir(steam_root.join("userdata")) {
            for entry in entries.flatten() {
                let cache = entry.path().join("config/librarycache");
                merge_achievement_dir(&cache, &mut map);
            }
        }
        return map;
    }

    merge_achievement_dir(&library_cache, &mut map);
    map
}

fn merge_achievement_dir(
    dir: &Path,
    map: &mut std::collections::HashMap<String, Vec<Achievement>>,
) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !name.ends_with(".json") {
            continue;
        }

        let app_id = name
            .trim_end_matches(".json")
            .split('_')
            .next()
            .unwrap_or("")
            .to_string();
        if app_id.is_empty() || !app_id.chars().all(|c| c.is_ascii_digit()) {
            continue;
        }

        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) else {
            continue;
        };

        let achievements = extract_achievements(&value, &app_id);
        if !achievements.is_empty() {
            map.insert(app_id, achievements);
        }
    }
}

fn extract_achievements(value: &serde_json::Value, app_id: &str) -> Vec<Achievement> {
    let candidates = [
        value.get("achievements"),
        value.pointer("/rgAchievements"),
        value.pointer("/data/achievements"),
        value.get("Achievements"),
    ];

    for candidate in candidates.into_iter().flatten() {
        if let Some(arr) = candidate.as_array() {
            let parsed: Vec<Achievement> = arr
                .iter()
                .enumerate()
                .filter_map(|(index, item)| map_achievement(item, app_id, index))
                .collect();
            if !parsed.is_empty() {
                return parsed;
            }
        } else if let Some(obj) = candidate.as_object() {
            let parsed: Vec<Achievement> = obj
                .iter()
                .enumerate()
                .filter_map(|(index, (key, item))| {
                    let mut achievement = map_achievement(item, app_id, index)?;
                    if achievement.id.is_empty() {
                        achievement.id = key.clone();
                    }
                    Some(achievement)
                })
                .collect();
            if !parsed.is_empty() {
                return parsed;
            }
        }
    }

    Vec::new()
}

fn map_achievement(value: &serde_json::Value, app_id: &str, index: usize) -> Option<Achievement> {
    if value.is_null() {
        return None;
    }

    let id = value
        .get("id")
        .or_else(|| value.get("name"))
        .or_else(|| value.get("apiName"))
        .or_else(|| value.get("strID"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("{app_id}-{index}"));

    let name = value
        .get("displayName")
        .or_else(|| value.get("name"))
        .or_else(|| value.get("strName"))
        .or_else(|| value.get("title"))
        .and_then(|v| v.as_str())
        .unwrap_or("Achievement")
        .to_string();

    let description = value
        .get("description")
        .or_else(|| value.get("strDescription"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let unlocked = value
        .get("achieved")
        .or_else(|| value.get("unlocked"))
        .or_else(|| value.get("bAchieved"))
        .and_then(|v| v.as_bool().or_else(|| v.as_i64().map(|n| n != 0)))
        .unwrap_or(false);

    let unlocked_at = value
        .get("unlockTime")
        .or_else(|| value.get("unlockedAt"))
        .and_then(|v| {
            if let Some(n) = v.as_i64() {
                if n > 0 {
                    return chrono::DateTime::from_timestamp(n, 0)
                        .map(|dt| dt.to_rfc3339());
                }
            }
            v.as_str().map(|s| s.to_string())
        });

    let icon = value
        .get("icon")
        .or_else(|| value.get("iconClosed"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    Some(Achievement {
        id,
        name,
        description,
        unlocked,
        unlocked_at,
        icon,
    })
}
