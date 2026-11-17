//! Discover existing Windows Steam installations independently of runtime readiness.

use async_trait::async_trait;
use std::path::{Path, PathBuf};

use super::{GameImporter, ImportError};
use crate::models::{GameArtwork, GamePlatform, GameProvider, ImportedGame, LaunchConfiguration};
use crate::runtimes::WineProfile;
use crate::services::steam_catalog;
use crate::services::steam_download::find_game_executable;
use crate::services::steam_manifest::SteamInstall;

pub struct SteamWindowsImporter {
    runtime_path: PathBuf,
    library_paths: Vec<String>,
    /// Owned (app id, title) pairs and the Steam folder whose appinfo cache
    /// names their install folders, for installs that lost their manifest.
    owned: Vec<(String, String)>,
    steam_root: Option<PathBuf>,
}
impl SteamWindowsImporter {
    pub fn new() -> Self {
        Self {
            runtime_path: PathBuf::new(),
            library_paths: Vec::new(),
            owned: Vec::new(),
            steam_root: None,
        }
    }
    pub fn with_runtime(mut self, runtime: PathBuf) -> Self {
        self.runtime_path = runtime;
        self
    }
    pub fn with_library_paths(mut self, paths: Vec<String>) -> Self {
        self.library_paths = paths;
        self
    }
    pub fn with_owned(mut self, owned: Vec<(String, String)>, steam_root: PathBuf) -> Self {
        self.owned = owned;
        self.steam_root = Some(steam_root);
        self
    }
    /// Owned games whose folder is in a library without an appmanifest.
    fn installs_without_manifest(
        &self,
        found: &std::collections::HashSet<String>,
    ) -> Vec<SteamInstall> {
        use crate::services::steam_native::installed;
        let Some(steam_root) = &self.steam_root else {
            return Vec::new();
        };
        let missing: Vec<String> = self
            .owned
            .iter()
            .filter(|(id, _)| !found.contains(id))
            .map(|(id, _)| id.clone())
            .collect();
        let libraries = installed::library_paths(None, None, &self.library_paths);
        let dirs = installed::install_dirs(steam_root, &missing);
        self.owned
            .iter()
            .filter_map(|(id, title)| {
                Some(SteamInstall {
                    app_id: id.clone(),
                    title: title.clone(),
                    install_dir: installed::folder_by_installdir(dirs.get(id)?, &libraries)?,
                    size_on_disk: None,
                })
            })
            .collect()
    }
    pub(crate) fn imported_games(&self) -> Result<Vec<ImportedGame>, ImportError> {
        let mut installs = crate::services::steam_library_paths::discover(&self.library_paths);
        let found = installs
            .iter()
            .map(|install| install.app_id.clone())
            .collect();
        installs.extend(self.installs_without_manifest(&found));
        let mut seen = std::collections::HashSet::new();
        let mut games = Vec::new();
        for install in installs {
            if let Some(mut game) = map_install(&install, &self.runtime_path) {
                if !seen.insert(install.app_id.clone()) {
                    game.stable_key =
                        format!("{}:{}", game.stable_key, install.install_dir.display());
                }
                games.push(game);
            }
        }
        games.sort_by(|a, b| a.sort_title.cmp(&b.sort_title));
        Ok(games)
    }
}
#[async_trait]
impl GameImporter for SteamWindowsImporter {
    async fn detect(&self) -> Result<bool, ImportError> {
        Ok(!self.library_paths.is_empty())
    }
    async fn discover_games(&self) -> Result<Vec<ImportedGame>, ImportError> {
        self.imported_games()
    }
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
            logo: Some(steam_catalog::logo_url(&install.app_id)),
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
        let root =
            std::env::temp_dir().join(format!("orbit-steam-import-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("steamapps/common/GodOfWar")).unwrap();
        std::fs::write(root.join("steamapps/common/GodOfWar/GoW.exe"), b"MZ").unwrap();
        std::fs::write(
            root.join("steamapps/appmanifest_1593500.acf"),
            r#""appid" "1593500" "name" "God of War" "installdir" "GodOfWar""#,
        )
        .unwrap();
        let games = SteamWindowsImporter::new()
            .with_library_paths(vec![root.to_string_lossy().into_owned()])
            .imported_games()
            .unwrap();
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].provider, GameProvider::Steam);
        assert_eq!(games[0].title, "God of War");
        assert_eq!(
            games[0].artwork.logo.as_deref(),
            Some("https://cdn.akamai.steamstatic.com/steam/apps/1593500/logo.png")
        );
        assert!(games[0].description.is_none());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn imports_an_owned_game_whose_manifest_is_gone() {
        // Regression: ~/GameHub/steamapps/common/GodOfWar had no
        // appmanifest_1593500.acf and the scan skipped it.
        let root =
            std::env::temp_dir().join(format!("orbit-steam-nomanifest-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("steamapps/common/GodOfWar")).unwrap();
        std::fs::write(root.join("steamapps/common/GodOfWar/GoW.exe"), b"MZ").unwrap();
        let steam = root.join("steam");
        std::fs::create_dir_all(steam.join("appcache")).unwrap();
        std::fs::write(
            steam.join("appcache/appinfo.vdf"),
            appinfo_naming(1593500, "GodOfWar"),
        )
        .unwrap();
        let games = SteamWindowsImporter::new()
            .with_library_paths(vec![root
                .join("steamapps/common")
                .to_string_lossy()
                .into_owned()])
            .with_owned(vec![("1593500".into(), "God of War".into())], steam)
            .imported_games()
            .unwrap();
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].title, "God of War");
        assert_eq!(games[0].source_id.as_deref(), Some("1593500"));
        std::fs::remove_dir_all(root).unwrap();
    }

    /// A minimal v29 appinfo.vdf naming one app's install folder.
    fn appinfo_naming(app_id: u32, installdir: &str) -> Vec<u8> {
        let mut kv = vec![0x00];
        kv.extend(0u32.to_le_bytes());
        kv.push(0x00);
        kv.extend(1u32.to_le_bytes());
        kv.push(0x01);
        kv.extend(2u32.to_le_bytes());
        kv.extend(installdir.as_bytes());
        kv.extend([0, 0x08, 0x08, 0x08]);
        let mut body = vec![0u8; 60];
        body.extend(kv);
        let mut apps = app_id.to_le_bytes().to_vec();
        apps.extend((body.len() as u32).to_le_bytes());
        apps.extend(body);
        apps.extend(0u32.to_le_bytes());
        let mut out = 0x0756_4429u32.to_le_bytes().to_vec();
        out.extend(1u32.to_le_bytes());
        out.extend(((16 + apps.len()) as u64).to_le_bytes());
        out.extend(apps);
        out.extend(3u32.to_le_bytes());
        for name in ["appinfo", "config", "installdir"] {
            out.extend(name.as_bytes());
            out.push(0);
        }
        out
    }
}
