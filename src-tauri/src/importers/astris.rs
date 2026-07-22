use async_trait::async_trait;
use std::path::PathBuf;
use walkdir::WalkDir;

use super::{GameImporter, ImportError};
use crate::models::{
    GameArtwork, GamePlatform, GameProvider, ImportedGame, LaunchConfiguration,
};
use crate::utils::filenames::{classify_switch_content, parse_switch_filename};
use crate::utils::size::path_size_bytes;

pub struct AstrisImporter {
    folders: Vec<PathBuf>,
    include_updates_and_dlc: bool,
    astris_app_path: Option<PathBuf>,
}

impl AstrisImporter {
    pub fn new(folders: Vec<PathBuf>) -> Self {
        Self {
            folders,
            include_updates_and_dlc: false,
            astris_app_path: detect_astris_app(),
        }
    }

    pub fn with_astris_path(mut self, path: Option<PathBuf>) -> Self {
        self.astris_app_path = path.or(self.astris_app_path);
        self
    }
}

#[async_trait]
impl GameImporter for AstrisImporter {
    async fn detect(&self) -> Result<bool, ImportError> {
        Ok(self
            .folders
            .iter()
            .any(|folder| folder.exists() && folder.is_dir()))
    }

    async fn discover_games(&self) -> Result<Vec<ImportedGame>, ImportError> {
        let mut games = Vec::new();

        for folder in &self.folders {
            if !folder.exists() {
                continue;
            }
            for entry in WalkDir::new(folder).into_iter().filter_map(|e| e.ok()) {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }
                let ext = path
                    .extension()
                    .and_then(|value| value.to_str())
                    .unwrap_or("")
                    .to_ascii_lowercase();
                if ext != "nsp" && ext != "xci" {
                    continue;
                }

                let file_name = path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or_default();
                let parsed = parse_switch_filename(file_name);
                let content = classify_switch_content(&parsed);

                if !self.include_updates_and_dlc
                    && matches!(content.as_str(), "update" | "dlc")
                {
                    continue;
                }

                let title_id = parsed.title_id.clone().unwrap_or_else(|| {
                    // Stable fallback from absolute path hash-ish identity.
                    path.to_string_lossy().to_string()
                });

                let launch = LaunchConfiguration::OpenFile {
                    file_path: path.to_string_lossy().to_string(),
                    application_path: self
                        .astris_app_path
                        .as_ref()
                        .map(|p| p.to_string_lossy().to_string()),
                };

                let size = path_size_bytes(path);
                games.push(ImportedGame {
                    stable_key: format!("astris:{title_id}"),
                    title: parsed.title.clone(),
                    sort_title: parsed.sort_title,
                    description: Some(format!(
                        "Nintendo Switch title from Astris ({})",
                        ext.to_uppercase()
                    )),
                    provider: GameProvider::Astris,
                    platform: GamePlatform::NintendoSwitch,
                    source_id: parsed.title_id,
                    launch_config: launch,
                    artwork: GameArtwork::default(),
                    total_playtime_seconds: 0,
                    install_size_bytes: size,
                    achievements: Vec::new(),
                });
            }
        }

        Ok(games)
    }
}

fn detect_astris_app() -> Option<PathBuf> {
    let mut candidates = vec![PathBuf::from("/Applications/Astris.app")];
    if let Some(home) = dirs::home_dir() {
        candidates.push(home.join("Applications/Astris.app"));
    }
    candidates.into_iter().find(|path| path.exists())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_hex_title_id_brackets_only() {
        let parsed = parse_switch_filename("Hogwarts Legacy [0100F7E00C70E000][v0].nsp");
        assert_eq!(parsed.title, "Hogwarts Legacy");
        assert_eq!(parsed.title_id.as_deref(), Some("0100F7E00C70E000"));
        assert_eq!(parsed.version.as_deref(), Some("v0"));
    }
}
