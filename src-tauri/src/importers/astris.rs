use async_trait::async_trait;
use std::collections::HashMap;
use std::path::PathBuf;
use walkdir::WalkDir;

use super::{GameImporter, ImportError};
use crate::models::{
    GameArtwork, GamePlatform, GameProvider, ImportedGame, LaunchConfiguration,
};
use crate::utils::filenames::{
    is_switch_base_application, parse_switch_filename, switch_rom_stem,
};
use crate::utils::paths::{canonical_import_path, is_macos_metadata_file};
use crate::utils::size::path_size_bytes;

pub struct AstrisImporter {
    folders: Vec<PathBuf>,
    include_updates_and_dlc: bool,
}

impl AstrisImporter {
    pub fn new(folders: Vec<PathBuf>) -> Self {
        Self {
            folders,
            include_updates_and_dlc: false,
        }
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
        let mut by_title_id: HashMap<String, ImportedGame> = HashMap::new();

        for folder in &self.folders {
            if !folder.exists() {
                continue;
            }
            for entry in WalkDir::new(folder).into_iter().filter_map(|e| e.ok()) {
                let path = entry.path();
                if !path.is_file() || is_macos_metadata_file(path) {
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
                let original_stem = switch_rom_stem(path).unwrap_or_default();
                let parsed = parse_switch_filename(file_name);
                let size = path_size_bytes(path);

                if !self.include_updates_and_dlc
                    && !is_switch_base_application(&parsed, &original_stem, size)
                {
                    continue;
                }

                let title_id = parsed.title_id.clone().unwrap_or_else(|| {
                    canonical_import_path(path).to_string_lossy().to_string()
                });

                let import_path = canonical_import_path(path);
                let launch = LaunchConfiguration::OpenFile {
                    file_path: import_path.to_string_lossy().to_string(),
                    application_path: None,
                };

                let game = ImportedGame {
                    stable_key: format!("astris:{title_id}"),
                    title: parsed.title.clone(),
                    sort_title: parsed.sort_title,
                    description: Some(format!(
                        "Nintendo Switch base title ({})",
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
                };

                by_title_id
                    .entry(title_id)
                    .and_modify(|existing| {
                        if game.install_size_bytes.unwrap_or(0)
                            > existing.install_size_bytes.unwrap_or(0)
                        {
                            *existing = game.clone();
                        }
                    })
                    .or_insert(game);
            }
        }

        Ok(by_title_id.into_values().collect())
    }
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
