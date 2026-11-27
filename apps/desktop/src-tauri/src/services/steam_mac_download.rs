//! Native macOS downloads through Steam for Mac.
//!
//! When Steam ships a macOS build of a game, Orbit downloads that build
//! instead of the Windows one. Steam for Mac picks the depots for this Mac
//! itself (the Apple Silicon build on an M-series Mac), so Orbit never chooses
//! or fetches files: everything comes from Steam. The strategy is the one the
//! container path uses. With Steam closed, Orbit writes the appmanifest Steam
//! reads as "install this app" and starts Steam fully hidden
//! (`steam_mac_client`). With Steam already
//! open, a manifest written now would not be read, so Orbit opens Steam's
//! install dialog instead. Either way Orbit follows Steam's own manifest and
//! content log for progress.
use std::fs;
use std::path::Path;
use std::time::Duration;

use serde_json::json;
use tauri::AppHandle;

use crate::database::GameRepository;
use crate::importers::SteamImporter;
use crate::services::steam_client_download::{self, read_state};
use crate::services::steam_download::valid_app_id;
use crate::services::steam_mac_client::{self, steam_root};
use crate::services::steam_windows::{self, DownloadOutcome};

/// Steam started silently by Orbit begins within this long.
const SILENT_START: Duration = Duration::from_secs(240);
/// Steam's install dialog waits for the person to confirm it.
const DIALOG_START: Duration = Duration::from_secs(600);
const MANIFEST_LIMIT: u64 = 256 * 1024;

/// Native when Steam for Mac is installed and the game has a macOS build.
/// `mac_build` is the catalog's answer; `ask_store` runs only when the
/// catalog does not know yet.
pub fn prefers_native(
    mac_build: Option<bool>,
    client_installed: bool,
    ask_store: impl FnOnce() -> bool,
) -> bool {
    client_installed && mac_build.unwrap_or_else(ask_store)
}

/// Whether this title downloads its macOS build. Reads the saved catalog,
/// and asks the Steam store only for a title the catalog has not classified.
pub fn wants_native(repo: &GameRepository, app_id: &str) -> bool {
    if !cfg!(target_os = "macos") || !valid_app_id(app_id) {
        return false;
    }
    let mac_build = steam_windows::stored_entries(repo)
        .ok()
        .and_then(|entries| entries.into_iter().find(|entry| entry.app_id == app_id))
        .and_then(|entry| entry.mac_build);
    prefers_native(mac_build, steam_mac_client::installed(), || {
        tauri::async_runtime::block_on(super::steam_library::has_mac_build(app_id)).unwrap_or(false)
    })
}

fn emit_step(app: &AppHandle, key: &str, label: &str, message: &str) {
    steam_windows::emit_game_progress(
        app,
        key,
        label,
        json!({ "phase": "Installing", "component": label, "message": message }),
    );
}

/// Downloads one owned game's macOS build with Steam for Mac. Blocks until
/// installed, stopped (pause / cancel / offline) or failed. A pause quits
/// Steam only when Orbit started it; Steam resumes the partial download the
/// next time it runs. O(seconds of download).
pub fn run(
    app: &AppHandle,
    app_id: &str,
    key: &str,
    label: &str,
) -> Result<DownloadOutcome, String> {
    if !valid_app_id(app_id) {
        return Err("Steam app id must be a number".into());
    }
    let _download = steam_mac_client::DownloadUse::begin();
    let root = steam_root().ok_or("Orbit cannot find your home folder")?;
    let steamapps = root.join("steamapps");
    let manifest = steamapps.join(format!("appmanifest_{app_id}.acf"));
    if read_state(&manifest).is_some_and(|state| state.installed()) {
        return Ok(DownloadOutcome::Completed);
    }
    // Only lines this run writes count; earlier runs are in the log too.
    let mut log = crate::services::steam_content_log::ContentLog::from_end(
        &root.join("logs").join("content_log.txt"),
    );
    // Steam reads a new manifest at startup, so Orbit's own hidden client
    // restarts around the write. A Steam the person opened is never closed:
    // it gets the install dialog instead.
    if steam_mac_client::running_hidden() {
        steam_mac_client::quit();
    }
    let started_by_orbit = !steam_mac_client::running();
    let timeout = if started_by_orbit {
        fs::create_dir_all(&steamapps)
            .map_err(|_| "Orbit cannot write to Steam for Mac's library".to_string())?;
        steam_client_download::queue_install(&steamapps, app_id, label)?;
        emit_step(app, key, label, "Starting Steam");
        steam_mac_client::ensure_running()?;
        SILENT_START
    } else {
        emit_step(app, key, label, "Confirm the install in Steam");
        steam_mac_client::open_url(&super::steam_library::steam_install_url(app_id)?)?;
        DIALOG_START
    };
    let result =
        steam_client_download::watch(app, &steamapps, app_id, key, label, &mut log, timeout);
    if started_by_orbit && matches!(result, Ok(outcome) if outcome != DownloadOutcome::Completed) {
        steam_mac_client::quit();
    }
    result
}

/// The library row for a finished macOS download, read from the manifest
/// Steam wrote. Bounded read; the manifest is Steam-written but untrusted.
pub fn installed_game(steamapps: &Path, app_id: &str) -> Option<crate::models::ImportedGame> {
    if !valid_app_id(app_id) {
        return None;
    }
    let manifest = steamapps.join(format!("appmanifest_{app_id}.acf"));
    let meta = fs::metadata(&manifest).ok()?;
    if !meta.is_file() || meta.len() > MANIFEST_LIMIT {
        return None;
    }
    let content = fs::read_to_string(&manifest).ok()?;
    if !steam_client_download::parse_state(&content).installed() {
        return None;
    }
    SteamImporter::import_manifest(&content, steamapps)
        .filter(|game| game.source_id.as_deref() == Some(app_id))
}

/// Saves a finished macOS download as a library installation, so the title
/// shows as installed before the next library scan. Returns the game id.
pub fn register(repo: &GameRepository, app_id: &str) -> Result<String, String> {
    let steamapps = steam_root()
        .ok_or("Orbit cannot find your home folder")?
        .join("steamapps");
    let game = installed_game(&steamapps, app_id)
        .ok_or("Steam finished, but its library does not list the game yet")?;
    repo.upsert_imported(&[game])
        .map_err(|err| err.to_string())?
        .game_ids
        .into_iter()
        .next()
        .ok_or_else(|| "The game could not be saved".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{GamePlatform, LaunchConfiguration};

    #[test]
    fn a_mac_build_downloads_natively_only_with_steam_for_mac() {
        let never = || panic!("the catalog already knows");
        assert!(prefers_native(Some(true), true, never));
        assert!(!prefers_native(Some(false), true, never));
        assert!(!prefers_native(Some(true), false, never));
        assert!(prefers_native(None, true, || true));
        assert!(!prefers_native(None, true, || false));
    }

    #[test]
    fn a_finished_steam_for_mac_install_becomes_a_native_steam_game() {
        let steamapps = std::env::temp_dir().join(format!("orbit-mac-dl-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(steamapps.join("common/Cyberpunk 2077")).unwrap();
        let manifest = steamapps.join("appmanifest_1091500.acf");
        fs::write(
            &manifest,
            steam_client_download::queue_manifest("1091500", "Cyberpunk 2077"),
        )
        .unwrap();
        assert!(
            installed_game(&steamapps, "1091500").is_none(),
            "still queued"
        );
        let done = fs::read_to_string(&manifest)
            .unwrap()
            .replace("\"1026\"", "\"4\"")
            .replace("\"SizeOnDisk\"\t\t\"0\"", "\"SizeOnDisk\"\t\t\"90000\"");
        fs::write(&manifest, done).unwrap();
        let game = installed_game(&steamapps, "1091500").unwrap();
        assert_eq!(game.platform, GamePlatform::Macos);
        assert_eq!(game.title, "Cyberpunk 2077");
        assert_eq!(game.install_size_bytes, Some(90_000));
        assert_eq!(
            game.launch_config,
            LaunchConfiguration::Steam {
                app_id: "1091500".into()
            }
        );
        assert!(installed_game(&steamapps, "1091501").is_none());
        assert!(installed_game(&steamapps, "../1091500").is_none());
        let _ = fs::remove_dir_all(steamapps);
    }
}
