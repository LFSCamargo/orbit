//! Bounded Steam appmanifest reader for user-selected library roots.
use crate::services::steam_download::find_game_executable;
use regex::Regex;
use std::{
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
};
const MANIFEST_LIMIT: u64 = 256 * 1024;
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SteamInstall {
    pub app_id: String,
    pub title: String,
    pub install_dir: PathBuf,
    pub size_on_disk: Option<i64>,
}
#[derive(Debug, Clone, Default)]
pub struct SteamInstallIndex {
    pub by_id: std::collections::HashMap<String, SteamInstall>,
}
pub(crate) fn install_from_manifest(
    steamapps: &Path,
    app_id: &str,
    fallback_title: &str,
) -> Option<SteamInstall> {
    let manifest = steamapps.join(format!("appmanifest_{app_id}.acf"));
    let manifest = manifest.canonicalize().ok()?;
    if !manifest.starts_with(steamapps.canonicalize().ok()?) {
        return None;
    }
    let metadata = fs::metadata(&manifest).ok()?;
    if metadata.len() > MANIFEST_LIMIT {
        return None;
    }
    let mut content = String::new();
    fs::File::open(&manifest)
        .ok()?
        .take(MANIFEST_LIMIT + 1)
        .read_to_string(&mut content)
        .ok()?;
    if content.len() as u64 > MANIFEST_LIMIT {
        return None;
    }
    if vdf_value(&content, "appid").as_deref() != Some(app_id) || app_id == "228980" {
        return None;
    }
    let installdir = vdf_value(&content, "installdir")?;
    if !safe_installdir(&installdir) {
        return None;
    }
    let title = vdf_value(&content, "name").unwrap_or_else(|| fallback_title.to_string());
    if is_redistributable(&title) {
        return None;
    }
    // `installdir` is already lexically safe (no `..`, not absolute), so
    // `common/<installdir>` cannot escape by string. The folder itself may be a
    // symlink into a shared library — GameHub points each container's
    // `steamapps/common/<game>` at `~/GameHub/steamapps/common/<game>` — so the
    // canonical target legitimately resolves outside this `steamapps`. Only
    // require that it resolves to a real directory holding the game.
    let install_dir = steamapps.join("common").join(&installdir);
    let canonical = install_dir.canonicalize().ok()?;
    if !canonical.is_dir() {
        return None;
    }
    if find_game_executable(&canonical).is_none() {
        return None;
    }
    let size_on_disk = vdf_value(&content, "SizeOnDisk").and_then(|value| value.parse().ok());
    Some(SteamInstall {
        app_id: app_id.to_string(),
        title,
        install_dir: canonical,
        size_on_disk,
    })
}

/// The validated `installdir` of one app's manifest, wherever that manifest
/// lives (a container's Steam keeps its own copy of a library game's manifest).
pub(crate) fn installdir_in(manifest: &Path, app_id: &str) -> Option<String> {
    let metadata = fs::metadata(manifest).ok()?;
    if !metadata.is_file() || metadata.len() > MANIFEST_LIMIT {
        return None;
    }
    let mut content = String::new();
    fs::File::open(manifest)
        .ok()?
        .take(MANIFEST_LIMIT)
        .read_to_string(&mut content)
        .ok()?;
    if vdf_value(&content, "appid").as_deref() != Some(app_id) {
        return None;
    }
    let installdir = vdf_value(&content, "installdir")?;
    let title = vdf_value(&content, "name").unwrap_or_default();
    (safe_installdir(&installdir) && !is_redistributable(&title)).then_some(installdir)
}

fn safe_installdir(value: &str) -> bool {
    let path = Path::new(value);
    !value.is_empty()
        && value.len() <= 200
        && !path.is_absolute()
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
}

fn is_redistributable(title: &str) -> bool {
    title.to_ascii_lowercase().contains("steamworks")
}

fn vdf_value(content: &str, key: &str) -> Option<String> {
    let pattern = format!(r#""{key}"\s+"([^"]*)""#);
    let re = Regex::new(&pattern).ok()?;
    re.captures(content)
        .and_then(|capture| capture.get(1).map(|found| found.as_str().to_string()))
        .filter(|value| !value.is_empty())
}
