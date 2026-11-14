//! Discover existing Windows Steam installations independently of runtime readiness.

use async_trait::async_trait;
use std::path::{Path, PathBuf};

use super::{GameImporter, ImportError};
use crate::models::{GameArtwork, GamePlatform, GameProvider, ImportedGame, LaunchConfiguration};
use crate::runtimes::WineProfile;
use crate::services::steam_manifest::SteamInstall;
use crate::services::steam_catalog;
use crate::services::steam_download::find_game_executable;

pub struct SteamWindowsImporter { runtime_path: PathBuf, library_paths: Vec<String> }
impl SteamWindowsImporter {
    pub fn new() -> Self { Self { runtime_path: PathBuf::new(), library_paths: Vec::new() } }
    pub fn with_runtime(mut self, runtime: PathBuf) -> Self { self.runtime_path = runtime; self }
    pub fn with_library_paths(mut self, paths: Vec<String>) -> Self { self.library_paths = paths; self }
    pub(crate) fn imported_games(&self) -> Result<Vec<ImportedGame>, ImportError> {
        let installs = crate::services::steam_library_paths::discover(&self.library_paths);
        let mut seen = std::collections::HashSet::new();
        let mut games = Vec::new();
        for install in installs {
            if let Some(mut game) = map_install(&install, &self.runtime_path) {
                if !seen.insert(install.app_id.clone()) { game.stable_key = format!("{}:{}", game.stable_key, install.install_dir.display()); }
                games.push(game);
            }
        }
        games.sort_by(|a,b| a.sort_title.cmp(&b.sort_title));
        Ok(games)
    }
}
#[async_trait]
impl GameImporter for SteamWindowsImporter {
    async fn detect(&self) -> Result<bool, ImportError> { Ok(!self.library_paths.is_empty()) }
    async fn discover_games(&self) -> Result<Vec<ImportedGame>, ImportError> { self.imported_games() }
}

fn map_install(install: &SteamInstall, runtime_path: &Path) -> Option<ImportedGame> {
    let executable = find_game_executable(&install.install_dir)?;
    Some(ImportedGame {
        stable_key: format!("steam-windows:{}", install.app_id),
        title: install.title.clone(),
        sort_title: install.title.to_lowercase(),
        description: None,
        provider: GameProvider::Steam,
        platform: GamePlatform::Windows,
        source_id: Some(install.app_id.clone()),
        launch_config: LaunchConfiguration::Wine {
            profile: WineProfile {
                executable: executable.to_string_lossy().into_owned(),
                runtime_path: runtime_path.to_string_lossy().into_owned(),
                ..WineProfile::default()
            },
        },
        artwork: GameArtwork {
            cover: Some(steam_catalog::cover_url(&install.app_id)),
            hero: Some(steam_catalog::hero_url(&install.app_id)),
            ..GameArtwork::default()
        },
        total_playtime_seconds: 0,
        install_size_bytes: install.size_on_disk,
        achievements: Vec::new(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn imports_without_runtime_login_or_binding_cache() {
        let root = std::env::temp_dir().join(format!("orbit-steam-import-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("steamapps/common/GodOfWar")).unwrap();
        std::fs::write(root.join("steamapps/common/GodOfWar/GoW.exe"), b"MZ").unwrap();
        std::fs::write(root.join("steamapps/appmanifest_1593500.acf"), r#""appid" "1593500" "name" "God of War" "installdir" "GodOfWar""#).unwrap();
        let games = SteamWindowsImporter::new().with_library_paths(vec![root.to_string_lossy().into_owned()]).imported_games().unwrap();
        assert_eq!(games.len(), 1); assert_eq!(games[0].provider, GameProvider::Steam);
        assert_eq!(games[0].title, "God of War"); assert!(games[0].description.is_none());
        std::fs::remove_dir_all(root).unwrap();
    }
}
