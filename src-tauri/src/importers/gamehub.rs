use async_trait::async_trait;
use std::fs;
use std::path::{Path, PathBuf};

use super::{GameImporter, ImportError};
use crate::models::{
    GameArtwork, GamePlatform, GameProvider, ImportedGame, LaunchConfiguration,
};
use crate::utils::gamehub_shortcut::{
    inspect_gamehub_shortcut, is_gamehub_main_app, is_gamehub_shortcut, GameHubShortcutInfo,
};
use crate::utils::paths::canonical_import_path;
use crate::utils::size::path_size_bytes;

/// GameHub shortcuts are `.app` bundles created by GameHub (bundle id `com.gamehub.shortcut.*`).
pub struct GameHubImporter {
    gamehub_app: Option<PathBuf>,
    folders: Vec<PathBuf>,
}

impl GameHubImporter {
    pub fn new() -> Self {
        Self {
            gamehub_app: detect_gamehub(),
            folders: Vec::new(),
        }
    }

    pub fn with_folders(mut self, folders: Vec<PathBuf>) -> Self {
        self.folders = folders;
        self
    }

    pub fn is_installed(&self) -> bool {
        self.gamehub_app.as_ref().is_some_and(|path| path.exists())
    }

    pub fn gamehub_app_path(&self) -> Option<&Path> {
        self.gamehub_app.as_deref()
    }
}

#[async_trait]
impl GameImporter for GameHubImporter {
    async fn detect(&self) -> Result<bool, ImportError> {
        Ok(self.is_installed())
    }

    async fn discover_games(&self) -> Result<Vec<ImportedGame>, ImportError> {
        let Some(gamehub_app) = self.gamehub_app.clone() else {
            return Err(ImportError::Message(
                "GameHub is not installed. Install GameHub.app in /Applications first.".into(),
            ));
        };

        let mut games = Vec::new();
        let mut seen = std::collections::HashSet::new();

        for root in shortcut_scan_roots(&self.folders) {
            if !root.exists() || !root.is_dir() {
                continue;
            }
            let Ok(entries) = fs::read_dir(&root) else {
                continue;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|ext| ext.to_str()) != Some("app") {
                    continue;
                }
                let canonical = canonical_import_path(&path);
                let Some(info) = inspect_gamehub_shortcut(&canonical) else {
                    continue;
                };
                let key = info.bundle_id.clone();
                if !seen.insert(key) {
                    continue;
                }
                if let Some(game) = map_gamehub_shortcut(&info, &gamehub_app) {
                    games.push(game);
                }
            }
        }

        Ok(games)
    }
}

pub fn detect_gamehub() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    [
        PathBuf::from("/Applications/GameHub.app"),
        home.join("Applications/GameHub.app"),
    ]
    .into_iter()
    .find(|path| path.exists())
}

fn shortcut_scan_roots(extra_folders: &[PathBuf]) -> Vec<PathBuf> {
    let mut roots = vec![PathBuf::from("/Applications")];
    if let Some(home) = dirs::home_dir() {
        roots.push(home.join("Applications"));
    }
    roots.extend(extra_folders.iter().cloned());
    roots
}

fn map_gamehub_shortcut(info: &GameHubShortcutInfo, gamehub_app: &Path) -> Option<ImportedGame> {
    let shortcut = canonical_import_path(&info.shortcut_path);
    let name = info.display_name.clone();
    let description = info
        .deep_link
        .as_ref()
        .map(|link| format!("GameHub shortcut ({link})."))
        .unwrap_or_else(|| "GameHub shortcut in Applications.".into());

    Some(ImportedGame {
        stable_key: format!("gamehub:{}", info.bundle_id),
        title: name.clone(),
        sort_title: name.to_lowercase(),
        description: Some(description),
        provider: GameProvider::Gamehub,
        platform: GamePlatform::Macos,
        source_id: Some(info.bundle_id.clone()),
        launch_config: LaunchConfiguration::Gamehub {
            gamehub_app_path: gamehub_app.to_string_lossy().to_string(),
            shortcut_app_path: shortcut.to_string_lossy().to_string(),
        },
        artwork: GameArtwork {
            icon: Some(shortcut.to_string_lossy().to_string()),
            ..Default::default()
        },
        total_playtime_seconds: 0,
        install_size_bytes: path_size_bytes(&shortcut),
        achievements: Vec::new(),
    })
}

/// Import a single verified GameHub shortcut `.app`.
pub fn import_gamehub_shortcut(path: &Path) -> Result<ImportedGame, ImportError> {
    let gamehub_app = detect_gamehub().ok_or_else(|| {
        ImportError::Message("GameHub is not installed in /Applications.".into())
    })?;
    let path = canonical_import_path(path);
    if !path.exists() {
        return Err(ImportError::Message(format!(
            "Path does not exist: {}",
            path.display()
        )));
    }
    if is_gamehub_main_app(&path) {
        return Err(ImportError::Message(
            "Select a game shortcut, not GameHub.app itself.".into(),
        ));
    }
    let info = inspect_gamehub_shortcut(&path).ok_or_else(|| {
        ImportError::Message(
            "Not a GameHub shortcut. Create the shortcut in GameHub first — it should have bundle id com.gamehub.shortcut.*.".into(),
        )
    })?;
    map_gamehub_shortcut(&info, &gamehub_app).ok_or_else(|| {
        ImportError::Message("Failed to import GameHub shortcut.".into())
    })
}

/// Manual single-file import for .app / .exe / .nsp / .xci.
pub fn import_manual_path(path: &Path) -> Result<ImportedGame, ImportError> {
    use crate::utils::filenames::{
        is_switch_base_application, parse_switch_filename, switch_rom_stem,
    };
    use crate::utils::paths::resolve_launch_file_path;

    let path = resolve_launch_file_path(path);
    if !path.exists() {
        return Err(ImportError::Message(format!(
            "Path does not exist: {}",
            path.display()
        )));
    }

    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let name = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled Game")
        .to_string();

    if ext == "app" && is_gamehub_shortcut(&path) {
        return import_gamehub_shortcut(&path);
    }

    let (provider, platform, launch) = match ext.as_str() {
        "nsp" | "xci" => {
            let file_name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or_default();
            let original_stem = switch_rom_stem(&path).unwrap_or_default();
            let parsed = parse_switch_filename(file_name);
            let size = path_size_bytes(&path);
            if !is_switch_base_application(&parsed, &original_stem, size) {
                return Err(ImportError::Message(
                    "Only base Nintendo Switch applications (.nsp / .xci with Title ID ending in 000) can be imported. Updates, DLC, and language packs are skipped.".into(),
                ));
            }
            let import_path = canonical_import_path(&path);
            (
                GameProvider::Astris,
                GamePlatform::NintendoSwitch,
                LaunchConfiguration::OpenFile {
                    file_path: import_path.to_string_lossy().to_string(),
                    application_path: None,
                },
            )
        }
        "app" => (
            GameProvider::Native,
            GamePlatform::Macos,
            LaunchConfiguration::OpenApplication {
                application_path: path.to_string_lossy().to_string(),
                arguments: None,
            },
        ),
        "exe" => (
            GameProvider::Gamehub,
            GamePlatform::Windows,
            LaunchConfiguration::OpenFile {
                file_path: path.to_string_lossy().to_string(),
                application_path: None,
            },
        ),
        _ => (
            GameProvider::Manual,
            GamePlatform::Unknown,
            LaunchConfiguration::OpenFile {
                file_path: path.to_string_lossy().to_string(),
                application_path: None,
            },
        ),
    };

    let _ = fs::metadata(&path);
    Ok(ImportedGame {
        stable_key: format!("manual:{}", path.to_string_lossy()),
        title: name.clone(),
        sort_title: name.to_lowercase(),
        description: Some(format!("Manually added .{ext} title.")),
        provider,
        platform,
        source_id: Some(path.to_string_lossy().to_string()),
        launch_config: launch,
        artwork: GameArtwork::default(),
        total_playtime_seconds: 0,
        install_size_bytes: path_size_bytes(&path),
        achievements: Vec::new(),
    })
}

#[cfg(test)]
mod tests {
    use crate::utils::gamehub_shortcut::GAMEHUB_SHORTCUT_BUNDLE_PREFIX;

    #[test]
    fn bundle_prefix_is_stable() {
        assert!(GAMEHUB_SHORTCUT_BUNDLE_PREFIX.starts_with("com.gamehub."));
    }
}
