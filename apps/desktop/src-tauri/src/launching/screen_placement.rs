use std::path::Path;

use crate::models::{GameProvider, LaunchConfiguration};

pub const ASTRIS_PROCESS_NAME: &str = "Astris";
pub const STEAM_PROCESS_NAME: &str = "Steam";

/// macOS `System Events` process names to nudge onto Orbit's current monitor.
pub fn screen_watcher_process_names(
    config: &LaunchConfiguration,
    provider: GameProvider,
) -> Vec<String> {
    match config {
        LaunchConfiguration::Gamehub { .. } => {
            vec![crate::launching::gamehub_readiness::GAMEHUB_PROCESS_NAME.into()]
        }
        LaunchConfiguration::Steam { .. } => vec![STEAM_PROCESS_NAME.into()],
        LaunchConfiguration::OpenApplication {
            application_path, ..
        } => macos_process_name_for_app(Path::new(application_path))
            .into_iter()
            .collect(),
        LaunchConfiguration::OpenFile {
            file_path,
            application_path,
        } => {
            let mut names = Vec::new();
            if let Some(app) = application_path.as_deref() {
                if let Some(name) = macos_process_name_for_app(Path::new(app)) {
                    names.push(name);
                }
            } else if crate::utils::macos_apps::is_switch_rom(Path::new(file_path))
                || provider == GameProvider::Astris
            {
                names.push(ASTRIS_PROCESS_NAME.into());
            }
            names
        }
        LaunchConfiguration::OpenUrl { url } => {
            if url.starts_with("steam://") {
                vec![STEAM_PROCESS_NAME.into()]
            } else if url.starts_with("gamehub://") {
                vec![crate::launching::gamehub_readiness::GAMEHUB_PROCESS_NAME.into()]
            } else {
                Vec::new()
            }
        }
        LaunchConfiguration::CustomCommand { executable, .. } => Path::new(executable)
            .file_stem()
            .map(|stem| stem.to_string_lossy().into_owned())
            .into_iter()
            .collect(),
    }
}

pub fn macos_process_name_for_app(app_path: &Path) -> Option<String> {
    if app_path.extension().and_then(|ext| ext.to_str()) != Some("app") {
        return None;
    }
    app_path
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .filter(|name| !name.is_empty())
}

pub fn astris_app_path() -> Option<std::path::PathBuf> {
    let path = std::path::PathBuf::from("/Applications/Astris.app");
    if path.is_dir() {
        Some(path)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::LaunchConfiguration;

    #[test]
    fn watcher_names_for_switch_rom() {
        let names = screen_watcher_process_names(
            &LaunchConfiguration::OpenFile {
                file_path: "/Games/Zelda.nsp".into(),
                application_path: None,
            },
            GameProvider::Astris,
        );
        assert_eq!(names, vec!["Astris".to_string()]);
    }

    #[test]
    fn watcher_names_for_steam_config() {
        let names = screen_watcher_process_names(
            &LaunchConfiguration::Steam {
                app_id: "1091500".into(),
            },
            GameProvider::Steam,
        );
        assert_eq!(names, vec!["Steam".to_string()]);
    }

    #[test]
    fn process_name_from_app_bundle() {
        assert_eq!(
            macos_process_name_for_app(Path::new("/Applications/Astris.app")).as_deref(),
            Some("Astris")
        );
        assert!(macos_process_name_for_app(Path::new("/usr/bin/open")).is_none());
    }

    #[test]
    fn watcher_names_for_gamehub_config() {
        let names = screen_watcher_process_names(
            &LaunchConfiguration::Gamehub {
                gamehub_app_path: "/Applications/GameHub.app".into(),
                shortcut_app_path: "/Applications/Games/Hades.app".into(),
            },
            GameProvider::Gamehub,
        );
        assert_eq!(names, vec!["GameHub".to_string()]);
    }

    #[test]
    fn watcher_names_for_open_application() {
        let names = screen_watcher_process_names(
            &LaunchConfiguration::OpenApplication {
                application_path: "/Applications/Chess.app".into(),
                arguments: None,
            },
            GameProvider::Native,
        );
        assert_eq!(names, vec!["Chess".to_string()]);
    }

    #[test]
    fn watcher_names_for_steam_and_gamehub_urls() {
        let steam = screen_watcher_process_names(
            &LaunchConfiguration::OpenUrl {
                url: "steam://rungameid/570".into(),
            },
            GameProvider::Manual,
        );
        assert_eq!(steam, vec!["Steam".to_string()]);

        let gamehub = screen_watcher_process_names(
            &LaunchConfiguration::OpenUrl {
                url: "gamehub://launch/abc".into(),
            },
            GameProvider::Manual,
        );
        assert_eq!(gamehub, vec!["GameHub".to_string()]);

        let other = screen_watcher_process_names(
            &LaunchConfiguration::OpenUrl {
                url: "https://example.com".into(),
            },
            GameProvider::Manual,
        );
        assert!(other.is_empty());
    }

    #[test]
    fn watcher_names_for_custom_command() {
        let names = screen_watcher_process_names(
            &LaunchConfiguration::CustomCommand {
                executable: "/usr/local/bin/my-launcher".into(),
                arguments: vec![],
            },
            GameProvider::Manual,
        );
        assert_eq!(names, vec!["my-launcher".to_string()]);
    }

    #[test]
    fn watcher_names_for_open_file_with_app() {
        let names = screen_watcher_process_names(
            &LaunchConfiguration::OpenFile {
                file_path: "/Games/rom.bin".into(),
                application_path: Some("/Applications/Emulator.app".into()),
            },
            GameProvider::Manual,
        );
        assert_eq!(names, vec!["Emulator".to_string()]);
    }
}
