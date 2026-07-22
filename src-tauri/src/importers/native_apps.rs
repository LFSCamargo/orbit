use async_trait::async_trait;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use super::{GameImporter, ImportError};
use crate::models::{
    GameArtwork, GamePlatform, GameProvider, ImportedGame, LaunchConfiguration,
};
use crate::utils::size::path_size_bytes;

const LIKELY_GAME_HINTS: &[&str] = &[
    "game",
    "arcade",
    "steam",
    "unity",
    "unreal",
    "rpg",
    "adventure",
    "shooter",
];

pub struct NativeAppImporter {
    extra_paths: Vec<PathBuf>,
    include_all: bool,
}

impl NativeAppImporter {
    pub fn new() -> Self {
        Self {
            extra_paths: Vec::new(),
            include_all: false,
        }
    }
}

#[async_trait]
impl GameImporter for NativeAppImporter {
    async fn detect(&self) -> Result<bool, ImportError> {
        Ok(PathBuf::from("/Applications").exists())
    }

    async fn discover_games(&self) -> Result<Vec<ImportedGame>, ImportError> {
        let mut roots = vec![PathBuf::from("/Applications")];
        if let Some(home) = dirs::home_dir() {
            roots.push(home.join("Applications"));
        }
        roots.extend(self.extra_paths.clone());

        let mut games = Vec::new();
        for root in roots {
            if !root.exists() {
                continue;
            }
            for entry in fs::read_dir(root)? {
                let entry = entry?;
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) != Some("app") {
                    continue;
                }
                if let Some(game) = inspect_app(&path, self.include_all) {
                    games.push(game);
                }
            }
        }
        Ok(games)
    }
}

fn inspect_app(path: &Path, include_all: bool) -> Option<ImportedGame> {
    if crate::utils::gamehub_shortcut::is_gamehub_shortcut(path) {
        return None;
    }

    let name = path.file_stem()?.to_string_lossy().to_string();
    let bundle_id = read_plist_value(path, "CFBundleIdentifier").unwrap_or_default();
    let category = read_plist_value(path, "LSApplicationCategoryType").unwrap_or_default();

    let looks_like_game = category.to_lowercase().contains("game")
        || LIKELY_GAME_HINTS.iter().any(|hint| {
            name.to_lowercase().contains(hint) || bundle_id.to_lowercase().contains(hint)
        })
        || name == "Chess";

    if !include_all && !looks_like_game {
        return None;
    }

    Some(ImportedGame {
        stable_key: format!(
            "native:{}",
            if bundle_id.is_empty() {
                path.to_string_lossy().to_string()
            } else {
                bundle_id.clone()
            }
        ),
        title: name.clone(),
        sort_title: name.to_lowercase(),
        description: Some(format!("macOS application ({name}).")),
        provider: GameProvider::Native,
        platform: GamePlatform::Macos,
        source_id: (!bundle_id.is_empty()).then_some(bundle_id),
        launch_config: LaunchConfiguration::OpenApplication {
            application_path: path.to_string_lossy().to_string(),
            arguments: None,
        },
        artwork: GameArtwork {
            icon: Some(path.to_string_lossy().to_string()),
            ..Default::default()
        },
        total_playtime_seconds: 0,
        install_size_bytes: path_size_bytes(path),
        achievements: Vec::new(),
    })
}

fn read_plist_value(app_path: &Path, key: &str) -> Option<String> {
    let plist = app_path.join("Contents/Info.plist");
    if !plist.exists() {
        return None;
    }
    let output = Command::new("/usr/libexec/PlistBuddy")
        .args(["-c", &format!("Print :{key}"), plist.to_str()?])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if value.is_empty() || value.starts_with("Print:") {
        None
    } else {
        Some(value)
    }
}
