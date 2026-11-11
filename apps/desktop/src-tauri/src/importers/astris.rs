use async_trait::async_trait;
use std::collections::HashMap;
use std::path::PathBuf;

use super::{GameImporter, ImportError};
use crate::models::{GameArtwork, GamePlatform, GameProvider, ImportedGame, LaunchConfiguration};
use crate::utils::filenames::is_switch_base_application;
use crate::utils::paths::canonical_import_path;
use crate::utils::switch_scan::walk_switch_roms;

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
            // O(n) walk bounded by max_depth + entry cap in walk_switch_roms.
            for rom in walk_switch_roms(folder, None) {
                if !self.include_updates_and_dlc
                    && !is_switch_base_application(&rom.parsed, &rom.original_stem, rom.size_bytes)
                {
                    continue;
                }

                let title_id = rom.parsed.title_id.clone().unwrap_or_else(|| {
                    canonical_import_path(&rom.path)
                        .to_string_lossy()
                        .to_string()
                });

                let import_path = canonical_import_path(&rom.path);
                let ext = rom
                    .path
                    .extension()
                    .and_then(|value| value.to_str())
                    .unwrap_or("")
                    .to_ascii_uppercase();
                let launch = LaunchConfiguration::OpenFile {
                    file_path: import_path.to_string_lossy().to_string(),
                    application_path: None,
                };

                let game = ImportedGame {
                    stable_key: format!("astris:{title_id}"),
                    title: rom.parsed.title.clone(),
                    sort_title: rom.parsed.sort_title,
                    description: Some(format!("Nintendo Switch base title ({ext})")),
                    provider: GameProvider::Astris,
                    platform: GamePlatform::NintendoSwitch,
                    source_id: rom.parsed.title_id,
                    launch_config: launch,
                    artwork: GameArtwork::default(),
                    total_playtime_seconds: 0,
                    install_size_bytes: rom.size_bytes,
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
    use crate::utils::filenames::parse_switch_filename;

    #[test]
    fn detects_hex_title_id_brackets_only() {
        let parsed = parse_switch_filename("Hogwarts Legacy [0100F7E00C70E000][v0].nsp");
        assert_eq!(parsed.title, "Hogwarts Legacy");
        assert_eq!(parsed.title_id.as_deref(), Some("0100F7E00C70E000"));
        assert_eq!(parsed.version.as_deref(), Some("v0"));
    }
}
