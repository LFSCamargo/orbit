use async_trait::async_trait;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

use super::{GameImporter, ImportError};
use crate::models::{
    GameArtwork, GamePlatform, GameProvider, ImportedGame, LaunchConfiguration,
};
use crate::utils::size::path_size_bytes;

/// GameHub / Wine-style folder importer for Windows executables and related packages.
pub struct GameHubImporter {
    app_path: Option<PathBuf>,
    folders: Vec<PathBuf>,
}

impl GameHubImporter {
    pub fn new() -> Self {
        Self {
            app_path: detect_gamehub(),
            folders: Vec::new(),
        }
    }

    pub fn with_folders(mut self, folders: Vec<PathBuf>) -> Self {
        self.folders = folders;
        self
    }

    pub fn is_installed(&self) -> bool {
        self.app_path.as_ref().is_some_and(|path| path.exists())
    }
}

#[async_trait]
impl GameImporter for GameHubImporter {
    async fn detect(&self) -> Result<bool, ImportError> {
        Ok(self.is_installed() || self.folders.iter().any(|f| f.exists()))
    }

    async fn discover_games(&self) -> Result<Vec<ImportedGame>, ImportError> {
        let mut games = Vec::new();
        let mut roots = self.folders.clone();

        // Default Wine / Game Porting Toolkit style prefixes when no folder chosen.
        if roots.is_empty() {
            if let Some(home) = dirs::home_dir() {
                let candidates = [
                    home.join("Games"),
                    home.join("GameHub"),
                    home.join("Library/Application Support/GameHub/Games"),
                ];
                roots.extend(candidates.into_iter().filter(|p| p.exists()));
            }
        }

        for folder in roots {
            if !folder.exists() {
                continue;
            }
            for entry in WalkDir::new(&folder)
                .max_depth(4)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }
                let ext = path
                    .extension()
                    .and_then(|value| value.to_str())
                    .unwrap_or("")
                    .to_ascii_lowercase();
                if ext != "exe" && ext != "app" {
                    continue;
                }
                if let Some(game) = map_gamehub_file(path) {
                    games.push(game);
                }
            }
        }

        Ok(games)
    }
}

fn map_gamehub_file(path: &Path) -> Option<ImportedGame> {
    let name = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("GameHub Game")
        .to_string();
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let (platform, launch) = if ext == "app" {
        (
            GamePlatform::Macos,
            LaunchConfiguration::OpenApplication {
                application_path: path.to_string_lossy().to_string(),
                arguments: None,
            },
        )
    } else {
        (
            GamePlatform::Windows,
            LaunchConfiguration::OpenFile {
                file_path: path.to_string_lossy().to_string(),
                application_path: None,
            },
        )
    };

    Some(ImportedGame {
        stable_key: format!("gamehub:{}", path.to_string_lossy()),
        title: name.clone(),
        sort_title: name.to_lowercase(),
        description: Some(format!("Imported via GameHub path (.{ext}).")),
        provider: GameProvider::Gamehub,
        platform,
        source_id: Some(path.to_string_lossy().to_string()),
        launch_config: launch,
        artwork: GameArtwork::default(),
        total_playtime_seconds: 0,
        install_size_bytes: path_size_bytes(path),
        achievements: Vec::new(),
    })
}

fn detect_gamehub() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let candidates = [
        PathBuf::from("/Applications/GameHub.app"),
        home.join("Applications/GameHub.app"),
    ];
    candidates.into_iter().find(|path| path.exists())
}

/// Manual single-file import for .app / .exe / .nsp / .xci.
pub fn import_manual_path(path: &Path) -> Result<ImportedGame, ImportError> {
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

    let (provider, platform, launch) = match ext.as_str() {
        "nsp" | "xci" => {
            let astris = [
                PathBuf::from("/Applications/Astris.app"),
                dirs::home_dir()
                    .unwrap_or_default()
                    .join("Applications/Astris.app"),
            ]
            .into_iter()
            .find(|p| p.exists());
            (
                GameProvider::Astris,
                GamePlatform::NintendoSwitch,
                LaunchConfiguration::OpenFile {
                    file_path: path.to_string_lossy().to_string(),
                    application_path: astris.map(|p| p.to_string_lossy().to_string()),
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

    let _ = fs::metadata(path);
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
        install_size_bytes: path_size_bytes(path),
        achievements: Vec::new(),
    })
}
