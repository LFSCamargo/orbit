//! Game downloads through the signed-in Windows Steam client, the way GameHub
//! does it: one Steam login for sign-in, Play and downloads.
//!
//! The game's own container runs Valve's client with the saved session (the
//! same path Play uses). Orbit queues the install by writing an appmanifest
//! marked "update required" while that client is stopped; on start the client
//! downloads the game into `steamapps/common` and keeps the manifest's byte
//! counters current, which Orbit reads for progress. Stopping the client
//! pauses; Steam resumes from its partial download.
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::time::{Duration, Instant};

use regex::Regex;
use serde_json::json;
use tauri::AppHandle;

use crate::database::GameRepository;
use crate::services::container_steam::{self, SteamHost};
use crate::services::steam_content_log::{ContentLog, UpdateLog, UpdateStep};
use crate::services::steam_download::{find_game_executable, valid_app_id};
use crate::services::steam_windows::{self, DownloadOutcome};

/// Fully installed, with no update pending.
const FULLY_INSTALLED: u64 = 4;
/// Update required: Steam downloads the app as soon as the client is up.
const QUEUE_INSTALL: u64 = 1026;
const POLL: Duration = Duration::from_millis(500);
/// How long the client may sit without starting the download.
const START_TIMEOUT: Duration = Duration::from_secs(240);
const MANIFEST_LIMIT: u64 = 256 * 1024;

/// What the container's appmanifest says about one app.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ClientState {
    pub flags: u64,
    pub downloaded: u64,
    pub to_download: u64,
    pub staged: u64,
    pub to_stage: u64,
}

impl ClientState {
    pub fn installed(&self) -> bool {
        self.flags == FULLY_INSTALLED
    }

    /// Progress event for this state, or None while nothing is reported yet.
    pub fn progress(&self, label: &str) -> Option<serde_json::Value> {
        if self.to_download > 0 && self.downloaded < self.to_download {
            return Some(json!({
                "phase": "Downloading",
                "component": label,
                "downloadedBytes": self.downloaded,
                "totalBytes": self.to_download,
            }));
        }
        if self.to_stage > 0 && self.staged < self.to_stage {
            return Some(json!({
                "phase": "Installing",
                "component": label,
                "message": "Installing files",
                "downloadedBytes": self.staged,
                "totalBytes": self.to_stage,
            }));
        }
        None
    }
}

fn vdf_number(content: &str, key: &str) -> u64 {
    Regex::new(&format!(r#""{key}"\s+"(\d+)""#))
        .ok()
        .and_then(|re| re.captures(content))
        .and_then(|found| found.get(1)?.as_str().parse().ok())
        .unwrap_or(0)
}

pub fn parse_state(content: &str) -> ClientState {
    ClientState {
        flags: vdf_number(content, "StateFlags"),
        downloaded: vdf_number(content, "BytesDownloaded"),
        to_download: vdf_number(content, "BytesToDownload"),
        staged: vdf_number(content, "BytesStaged"),
        to_stage: vdf_number(content, "BytesToStage"),
    }
}

fn read_state(manifest: &Path) -> Option<ClientState> {
    let meta = fs::metadata(manifest).ok()?;
    if !meta.is_file() || meta.len() > MANIFEST_LIMIT {
        return None;
    }
    fs::read_to_string(manifest)
        .ok()
        .map(|text| parse_state(&text))
}

/// A Windows-safe folder name for the game, from its title.
pub fn install_folder(title: &str, app_id: &str) -> String {
    let cleaned: String = title
        .chars()
        .filter(|c| !matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'))
        .filter(|c| !c.is_control())
        .collect();
    let cleaned = cleaned.trim().trim_end_matches('.').trim();
    if cleaned.is_empty() || cleaned == "." || cleaned == ".." || cleaned.len() > 120 {
        format!("app-{app_id}")
    } else {
        cleaned.to_string()
    }
}

/// The appmanifest Steam reads as "install this app".
pub fn queue_manifest(app_id: &str, title: &str) -> String {
    let name = title.replace('"', "'");
    let folder = install_folder(title, app_id);
    format!(
        "\"AppState\"\n{{\n\t\"appid\"\t\t\"{app_id}\"\n\t\"Universe\"\t\t\"1\"\n\t\"name\"\t\t\"{name}\"\n\t\"StateFlags\"\t\t\"{QUEUE_INSTALL}\"\n\t\"installdir\"\t\t\"{folder}\"\n\t\"LastUpdated\"\t\t\"0\"\n\t\"UpdateResult\"\t\t\"0\"\n\t\"SizeOnDisk\"\t\t\"0\"\n\t\"buildid\"\t\t\"0\"\n\t\"BytesToDownload\"\t\t\"0\"\n\t\"BytesDownloaded\"\t\t\"0\"\n\t\"AutoUpdateBehavior\"\t\t\"0\"\n\t\"AllowOtherDownloadsWhileRunning\"\t\t\"0\"\n\t\"ScheduledAutoUpdate\"\t\t\"0\"\n\t\"InstalledDepots\"\n\t{{\n\t}}\n\t\"UserConfig\"\n\t{{\n\t}}\n\t\"MountedConfig\"\n\t{{\n\t}}\n}}\n"
    )
}

/// The game container's prefix and its Steam `steamapps`.
pub fn container_paths(app_id: &str) -> Result<(PathBuf, PathBuf), String> {
    let id = super::steam_native::downloads::container_id(app_id)?;
    let prefix = crate::runtimes::containers::root_in(&crate::runtimes::root())
        .join("games")
        .join(id)
        .join("prefix");
    let steamapps = crate::runtimes::containers::steam::steam_root(&prefix).join("steamapps");
    Ok((prefix, steamapps))
}

/// The game folder the container's Steam installed, once fully installed.
pub fn client_install_dir(app_id: &str) -> Option<PathBuf> {
    let (_, steamapps) = container_paths(app_id).ok()?;
    let manifest = steamapps.join(format!("appmanifest_{app_id}.acf"));
    if !read_state(&manifest)?.installed() {
        return None;
    }
    let folder = crate::services::steam_manifest::installdir_in(&manifest, app_id)?;
    let dir = steamapps.join("common").join(folder);
    dir.is_dir().then_some(dir)
}

/// Writes the install request unless Steam already tracks the app; an
/// existing manifest (a paused download) is left for Steam to resume.
pub fn queue_install(steamapps: &Path, app_id: &str, title: &str) -> Result<(), String> {
    let manifest = steamapps.join(format!("appmanifest_{app_id}.acf"));
    if manifest.exists() {
        return Ok(());
    }
    fs::create_dir_all(steamapps.join("common")).map_err(|err| err.to_string())?;
    fs::write(&manifest, queue_manifest(app_id, title)).map_err(|err| err.to_string())
}

fn step_message(step: &str) -> &'static str {
    match step {
        "container" | "compatibility" => "Preparing the game container",
        "steam" | "login" | "cloud" => "Signing in to Steam",
        _ => "Preparing download",
    }
}

/// Downloads one owned game with the container's Steam client. Blocks until
/// installed, stopped (pause / cancel) or failed. O(seconds of download).
pub fn run(
    app: &AppHandle,
    repo: &GameRepository,
    app_id: &str,
    key: &str,
    label: &str,
    cancel: &AtomicBool,
) -> Result<DownloadOutcome, String> {
    if !valid_app_id(app_id) {
        return Err("Steam app id must be a number".into());
    }
    let wine = steam_windows::play_wine_binary(repo).ok_or(
        "Install a Windows compatibility runtime in Settings before downloading this game",
    )?;
    let profile = crate::runtimes::settings::resolve_profile(
        repo,
        &crate::runtimes::WineProfile {
            runtime_path: wine.to_string_lossy().into_owned(),
            ..Default::default()
        },
    )
    .map_err(|err| format!("{err:#}"))?;
    let preferences = steam_windows::preferences(repo)?;
    let (prefix, steamapps) = container_paths(app_id)?;
    let host = SteamHost {
        wine: wine.clone(),
        prefix: prefix.clone(),
    };
    let mut progress = |step: &str| {
        steam_windows::emit_game_progress(
            app,
            key,
            label,
            json!({ "phase": "Installing", "component": label, "message": step_message(step) }),
        );
    };

    // A new container is created (and signed in) once before the request is
    // written, so the manifest lands in the Steam library the client reads.
    if !steamapps.parent().is_some_and(Path::is_dir) {
        super::steam_play::play_environment(&profile, app_id, cancel, &preferences, &mut progress)?;
        if let Some(outcome) = steam_windows::stop_outcome() {
            container_steam::shutdown(&host);
            return Ok(outcome);
        }
    }
    let manifest = steamapps.join(format!("appmanifest_{app_id}.acf"));
    if read_state(&manifest).is_some_and(|state| state.installed())
        && client_install_dir(app_id)
            .as_deref()
            .and_then(find_game_executable)
            .is_some()
    {
        return Ok(DownloadOutcome::Completed);
    }
    // Steam reads new manifests at startup, so the client restarts around the write.
    if container_steam::client_running(&prefix) {
        container_steam::shutdown(&host);
    }
    queue_install(&steamapps, app_id, label)?;
    // Only lines this client run writes count; earlier runs are in the log too.
    let mut log = ContentLog::from_end(&steamapps.with_file_name("logs").join("content_log.txt"));
    super::steam_play::play_environment(&profile, app_id, cancel, &preferences, &mut progress)?;

    let result = watch(app, &steamapps, app_id, key, label, &mut log);
    container_steam::shutdown(&host);
    result
}

/// Byte estimate while Steam downloads: what it has written into
/// `downloading/<appid>` (allocated blocks, so preallocated space does not
/// count), scaled from staged to network bytes. Never goes backwards.
pub fn download_estimate(staged: u64, download_total: u64, stage_total: u64) -> (u64, u64) {
    if download_total > 0 && stage_total > 0 {
        let scaled = (staged as u128 * download_total as u128 / stage_total as u128) as u64;
        return (scaled.min(download_total), download_total);
    }
    let total = stage_total.max(download_total);
    (staged.min(total), total)
}

/// Follows the client's content log (each step, totals, failures) and the
/// game's download folder (bytes) until Steam reports the game installed.
fn watch(
    app: &AppHandle,
    steamapps: &Path,
    app_id: &str,
    key: &str,
    label: &str,
    log: &mut ContentLog,
) -> Result<DownloadOutcome, String> {
    let manifest = steamapps.join(format!("appmanifest_{app_id}.acf"));
    let downloading = steamapps.join("downloading").join(app_id);
    let started = Instant::now();
    let mut update = UpdateLog::default();
    let mut downloaded = 0u64;
    let mut last_event = serde_json::Value::Null;
    loop {
        if let Some(outcome) = steam_windows::stop_outcome() {
            return Ok(outcome);
        }
        for line in log.new_lines() {
            update.apply(&line, app_id);
        }
        if let Some(reason) = &update.failure {
            return Err(format!("Steam stopped the download: {reason}"));
        }
        let state = read_state(&manifest).unwrap_or_default();
        let began = update.step != UpdateStep::Waiting || state.to_download > 0;
        if update.step == UpdateStep::Installed || (state.installed() && began) {
            steam_windows::note_download_total(update.download_total.max(state.to_download));
            return Ok(DownloadOutcome::Completed);
        }
        let event = match update.step {
            UpdateStep::Waiting => None,
            UpdateStep::Preparing => Some(json!({
                "phase": "Installing", "component": label, "message": "Preparing the download",
            })),
            UpdateStep::Preallocating => Some(json!({
                "phase": "Installing", "component": label, "message": "Allocating disk space",
            })),
            UpdateStep::Downloading => {
                let mut budget = 200_000;
                let staged =
                    crate::services::install_roots::disk_usage(&downloading, &[], &mut budget)
                        .max(state.staged);
                let (bytes, total) =
                    download_estimate(staged, update.download_total, update.stage_total);
                downloaded = downloaded.max(bytes.max(state.downloaded.min(total)));
                Some(json!({
                    "phase": "Downloading",
                    "component": label,
                    "downloadedBytes": downloaded,
                    "totalBytes": total,
                }))
            }
            UpdateStep::Verifying => Some(json!({ "phase": "Verifying", "component": label })),
            UpdateStep::Committing => Some(json!({
                "phase": "Installing", "component": label, "message": "Installing files",
            })),
            UpdateStep::Installed => None,
        };
        if let Some(event) = event {
            if event != last_event {
                steam_windows::emit_game_progress(app, key, label, event.clone());
                last_event = event;
            }
        }
        if !began && started.elapsed() > START_TIMEOUT {
            return Err(
                "Steam did not start the download. Check that you own the game and have space, then try again."
                    .into(),
            );
        }
        std::thread::sleep(POLL);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_a_manifest_steam_reads_as_an_install_request() {
        let text = queue_manifest("312990", "The Expendabros");
        let state = parse_state(&text);
        assert_eq!(state.flags, QUEUE_INSTALL);
        assert!(!state.installed());
        assert!(text.contains("\"installdir\"\t\t\"The Expendabros\""));
        assert!(text.contains("\"appid\"\t\t\"312990\""));
    }

    #[test]
    fn keeps_install_folders_windows_safe() {
        assert_eq!(
            install_folder("DOOM: The Dark Ages", "1"),
            "DOOM The Dark Ages"
        );
        assert_eq!(install_folder("../../etc", "7"), "....etc");
        assert_eq!(install_folder("???", "570"), "app-570");
        assert_eq!(install_folder(" Trailing. ", "1"), "Trailing");
    }

    #[test]
    fn reports_download_then_install_progress_from_the_manifest() {
        let downloading = parse_state(
            "\"StateFlags\"\t\t\"1026\"\n\"BytesToDownload\"\t\t\"200\"\n\"BytesDownloaded\"\t\t\"50\"\n",
        );
        let event = downloading.progress("Game").unwrap();
        assert_eq!(event["phase"], "Downloading");
        assert_eq!(event["downloadedBytes"], 50);
        let staging = parse_state(
            "\"StateFlags\"\t\t\"1026\"\n\"BytesToDownload\"\t\t\"200\"\n\"BytesDownloaded\"\t\t\"200\"\n\"BytesToStage\"\t\t\"400\"\n\"BytesStaged\"\t\t\"100\"\n",
        );
        assert_eq!(
            staging.progress("Game").unwrap()["message"],
            "Installing files"
        );
        let done = parse_state("\"StateFlags\"\t\t\"4\"\n");
        assert!(done.installed());
        assert!(done.progress("Game").is_none());
    }

    #[test]
    fn leaves_an_existing_manifest_for_steam_to_resume() {
        let steamapps =
            std::env::temp_dir().join(format!("orbit-client-dl-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&steamapps).unwrap();
        let manifest = steamapps.join("appmanifest_312990.acf");
        fs::write(
            &manifest,
            "\"StateFlags\"\t\t\"1062\"\n\"BytesDownloaded\"\t\t\"9\"\n",
        )
        .unwrap();
        queue_install(&steamapps, "312990", "The Expendabros").unwrap();
        assert_eq!(
            parse_state(&fs::read_to_string(&manifest).unwrap()).downloaded,
            9
        );
        fs::remove_file(&manifest).unwrap();
        queue_install(&steamapps, "312990", "The Expendabros").unwrap();
        assert_eq!(read_state(&manifest).unwrap().flags, QUEUE_INSTALL);
        assert!(steamapps.join("common").is_dir());
        let _ = fs::remove_dir_all(steamapps);
    }

    #[test]
    fn estimates_network_bytes_from_what_steam_has_written() {
        // The Expendabros: 129 MB download unpacks to 670 MB staged.
        assert_eq!(
            download_estimate(334_987_565, 129_107_072, 669_975_131),
            (64_553_535, 129_107_072)
        );
        assert_eq!(
            download_estimate(900, 129, 670),
            (129, 129),
            "never past the total"
        );
        assert_eq!(download_estimate(50, 0, 200), (50, 200));
        assert_eq!(download_estimate(0, 0, 0), (0, 0));
    }
}
