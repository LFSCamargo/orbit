//! Additional user-selected existing Steam libraries. All scans are bounded.
use crate::services::steam_manifest::{install_from_manifest, SteamInstall, SteamInstallIndex};
use std::path::{Component, Path, PathBuf};

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_common_and_rejects_traversal_and_missing_folders() {
        let root = std::env::temp_dir().join(format!("orbit-library-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("steamapps/common")).unwrap();
        let expected = root.join("steamapps/common").canonicalize().unwrap();
        assert_eq!(normalize(&root).unwrap(), expected);
        assert_eq!(normalize(&root.join("steamapps")).unwrap(), expected);
        assert_eq!(normalize(&root.join("steamapps/common")).unwrap(), expected);
        assert!(normalize(&root.join("../steamapps/common")).is_err());
        assert!(normalize(&root.join("missing")).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn paths_are_deduplicated_and_legacy_preferences_still_load() {
        let root = std::env::temp_dir().join(format!("orbit-library-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("steamapps/common")).unwrap();
        let values = vec![
            root.to_string_lossy().into_owned(),
            root.join("steamapps/common").to_string_lossy().into_owned(),
        ];
        assert_eq!(validate(&values).unwrap().len(), 1);
        let legacy: crate::services::steam_windows::SteamWindowsPreferences =
            serde_json::from_str(r#"{"offlineMode":true,"verifyFiles":false}"#).unwrap();
        assert!(legacy.offline_mode);
        assert!(legacy.additional_library_paths.is_empty());
        assert!(validate(&vec![String::new(); 17]).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn discovers_manifest_games_and_rejects_escaping_installs() {
        let root = std::env::temp_dir().join(format!("orbit-library-{}", uuid::Uuid::new_v4()));
        let apps = root.join("steamapps");
        std::fs::create_dir_all(apps.join("common/Demo")).unwrap();
        std::fs::write(apps.join("common/Demo/Game.exe"), b"MZ").unwrap();
        std::fs::write(
            apps.join("appmanifest_570.acf"),
            r#""appid" "570" "name" "Demo" "installdir" "Demo""#,
        )
        .unwrap();
        std::fs::write(
            apps.join("appmanifest_730.acf"),
            r#""appid" "730" "installdir" "../../escape""#,
        )
        .unwrap();
        let paths = vec![apps.join("common").to_string_lossy().into_owned()];
        #[cfg(unix)]
        {
            let outside = root.join("outside.acf");
            std::fs::write(&outside, r#""installdir" "Demo""#).unwrap();
            std::os::unix::fs::symlink(outside, apps.join("appmanifest_999.acf")).unwrap();
        }
        let found = index(&paths);
        assert_eq!(found.by_id.len(), 1);
        assert_eq!(found.by_id["570"].title, "Demo");
        std::fs::remove_dir_all(root).unwrap();
    }
}

pub fn normalize(path: &Path) -> Result<PathBuf, String> {
    if path.as_os_str().len() > 4096
        || !path.is_absolute()
        || path.components().any(|part| part == Component::ParentDir)
    {
        return Err("Choose an absolute Steam library folder without parent traversal".into());
    }
    let path = path
        .canonicalize()
        .map_err(|_| "Steam library folder is not accessible")?;
    let common = if path.file_name().is_some_and(|name| name == "common") {
        path
    } else if path.file_name().is_some_and(|name| name == "steamapps") {
        path.join("common")
    } else {
        path.join("steamapps/common")
    };
    let common = common
        .canonicalize()
        .map_err(|_| "Choose a Steam library or its steamapps/common folder")?;
    if !common.is_dir()
        || !common
            .parent()
            .is_some_and(|parent| parent.file_name().is_some_and(|name| name == "steamapps"))
    {
        return Err("Choose a Steam library or its steamapps/common folder".into());
    }
    Ok(common)
}

pub fn validate(paths: &[String]) -> Result<Vec<String>, String> {
    if paths.len() > 16 {
        return Err("Add at most 16 Steam library folders".into());
    }
    let mut result = Vec::new();
    for path in paths {
        let normalized = normalize(Path::new(path))?.to_string_lossy().into_owned();
        if !result.contains(&normalized) {
            result.push(normalized);
        }
    }
    Ok(result)
}

/// O(P × M), capped at 16 paths and 2,000 directory entries per path.
/// No recursion; manifest parsing and executable discovery retain their existing caps.
pub fn discover(paths: &[String]) -> Vec<SteamInstall> {
    let mut result = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for path in paths.iter().take(16) {
        let Ok(common) = normalize(Path::new(path)) else {
            continue;
        };
        let Some(apps) = common.parent() else {
            continue;
        };
        let Ok(entries) = std::fs::read_dir(apps) else {
            continue;
        };
        for entry in entries.take(2_000).flatten() {
            let name = entry.file_name();
            let Some(id) = name
                .to_str()
                .and_then(|name| name.strip_prefix("appmanifest_"))
                .and_then(|name| name.strip_suffix(".acf"))
            else {
                continue;
            };
            if !crate::services::steam_download::valid_app_id(id) {
                continue;
            }
            if let Some(install) = install_from_manifest(apps, id, &format!("Steam {id}")) {
                if seen.insert(install.install_dir.clone()) {
                    result.push(install);
                }
            }
        }
    }
    result
}

pub fn index(paths: &[String]) -> SteamInstallIndex {
    let mut index = SteamInstallIndex::default();
    for install in discover(paths) {
        index.by_id.entry(install.app_id.clone()).or_insert(install);
    }
    index
}
