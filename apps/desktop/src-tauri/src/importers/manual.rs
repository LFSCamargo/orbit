use std::fs;
use std::path::Path;

use super::ImportError;
use crate::models::{GameArtwork, GamePlatform, GameProvider, ImportedGame, LaunchConfiguration};
use crate::runtimes::WineProfile;
use crate::utils::filenames::is_switch_base_application;
use crate::utils::paths::{canonical_import_path, resolve_launch_file_path};
use crate::utils::size::path_size_bytes;
use crate::utils::switch_scan::parse_switch_rom;

/// Manual single-file import for .app / .exe / .nsp / .xci.
pub fn import_manual_path(path: &Path) -> Result<ImportedGame, ImportError> {
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

    let (provider, platform, launch, title) = match ext.as_str() {
        "nsp" | "xci" => {
            let rom = parse_switch_rom(&path).ok_or_else(|| {
                ImportError::Message(format!(
                    "Not a valid Nintendo Switch ROM: {}",
                    path.display()
                ))
            })?;
            if !is_switch_base_application(&rom.parsed, &rom.original_stem, rom.size_bytes) {
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
                rom.parsed.title,
            )
        }
        "app" => (
            GameProvider::Native,
            GamePlatform::Macos,
            LaunchConfiguration::OpenApplication {
                application_path: path.to_string_lossy().to_string(),
                arguments: None,
            },
            name.clone(),
        ),
        "exe" => (
            GameProvider::Manual,
            GamePlatform::Windows,
            LaunchConfiguration::Wine {
                profile: WineProfile {
                    executable: path.to_string_lossy().to_string(),
                    ..WineProfile::default()
                },
            },
            name.clone(),
        ),
        _ => (
            GameProvider::Manual,
            GamePlatform::Unknown,
            LaunchConfiguration::OpenFile {
                file_path: path.to_string_lossy().to_string(),
                application_path: None,
            },
            name.clone(),
        ),
    };

    let _ = fs::metadata(&path);
    Ok(ImportedGame {
        stable_key: format!("manual:{}", path.to_string_lossy()),
        title: title.clone(),
        sort_title: title.to_lowercase(),
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
