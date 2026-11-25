//! Game downloads through the signed-in Windows Steam client, the way GameHub
//! does it: one Steam login for sign-in, Play and downloads.
//!
//! The game's own container runs Valve's client with the saved session (the
//! same path Play uses). Orbit queues the install by writing an appmanifest
//! marked "update required" while that client is stopped; on start the client
//! downloads the game into `steamapps/common` and keeps the manifest's byte
//! counters current, which Orbit reads for progress. Stopping the client
//! pauses; Steam resumes from its partial download. Progress is reported at
//! least once a second, with the measured rate, so the panel never goes stale.
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
/// Longest gap between progress events, so rate and elapsed time stay live.
const HEARTBEAT: Duration = Duration::from_secs(1);
/// How often the downloading folder is measured; walking it is the costly part.
const MEASURE_EVERY: Duration = Duration::from_secs(1);
/// Weight of the newest sample in the smoothed rate.
const RATE_SMOOTHING: f64 = 0.4;
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

/// The `steamapps` holding the game: its picked install location's Orbit
/// library, or the container's own Steam library on This Mac.
pub fn game_steamapps(app_id: &str) -> Result<PathBuf, String> {
    match crate::services::install_locations::library_for_app(app_id) {
        Some(library) => Ok(library.join("steamapps")),
        None => container_paths(app_id).map(|(_, steamapps)| steamapps),
    }
}

/// Mounts a picked location's library in the container as a Wine drive and
/// lists it in Steam's libraries. Call while the container's client is stopped.
fn register_library(prefix: &Path, library: &Path) -> Result<(), String> {
    let common = library.join("steamapps/common");
    fs::create_dir_all(&common).map_err(|_| {
        "Orbit cannot write to the install location. Check the drive's permissions.".to_string()
    })?;
    let steam_root = crate::runtimes::containers::steam::steam_root(prefix);
    super::steam_client_library::register(
        &steam_root,
        prefix,
        &[common.to_string_lossy().into_owned()],
    )?;
    let contentid = write_library_identity(library)?;
    super::steam_client_library::set_library_contentid(&steam_root, prefix, library, contentid)
}

/// The library's id in its `libraryfolder.vdf`, if it has one.
fn identity_of(file: &Path) -> Option<u64> {
    let text = fs::read_to_string(file).ok()?;
    let id = vdf_number(&text, "contentid");
    (id > 0).then_some(id)
}

/// Steam only mounts a secondary library whose identity file
/// (`libraryfolder.vdf`, at the library root and in `steamapps`) carries the
/// id its library list holds; otherwise the log says "Install folder S: not
/// mounted" and the download never starts. The folder's id is kept once
/// written, so every container sharing the library agrees. Returns the id.
pub fn write_library_identity(library: &Path) -> Result<u64, String> {
    let files = [
        library.join("libraryfolder.vdf"),
        library.join("steamapps/libraryfolder.vdf"),
    ];
    let id = files
        .iter()
        .find_map(|file| identity_of(file))
        .unwrap_or_else(|| uuid::Uuid::new_v4().as_u64_pair().0 & 0x7fff_ffff_ffff_ffff);
    let body =
        format!("\"libraryfolder\"\n{{\n\t\"contentid\"\t\t\"{id}\"\n\t\"label\"\t\t\"\"\n}}\n");
    for file in &files {
        if identity_of(file) != Some(id) {
            fs::write(file, &body).map_err(|_| {
                "Orbit cannot write to the install location. Check the drive's permissions."
                    .to_string()
            })?;
        }
    }
    Ok(id)
}

/// A game moving to a picked location leaves no unfinished copy in the
/// container's own library: Steam would hold both and keep the old one
/// paused. A finished install there is never touched. Only Orbit's container.
pub fn drop_unfinished_copy(container_steamapps: &Path, app_id: &str) {
    let manifest = container_steamapps.join(format!("appmanifest_{app_id}.acf"));
    if read_state(&manifest).is_none_or(|state| state.installed()) {
        return;
    }
    let _ = fs::remove_file(&manifest);
    let _ = fs::remove_dir_all(container_steamapps.join("downloading").join(app_id));
}

/// The game folder the container's Steam installed, once fully installed.
pub fn client_install_dir(app_id: &str) -> Option<PathBuf> {
    let steamapps = game_steamapps(app_id).ok()?;
    let manifest = steamapps.join(format!("appmanifest_{app_id}.acf"));
    if !read_state(&manifest)?.installed() {
        return None;
    }
    let folder = crate::services::steam_manifest::installdir_in(&manifest, app_id)?;
    let dir = steamapps.join("common").join(folder);
    dir.is_dir().then_some(dir)
}

/// Steam's "update paused" state bit. Steam never resumes such an update on
/// its own, so a request must clear it.
const UPDATE_PAUSED: u64 = 0x200;

/// An existing manifest made ready to download again: the paused bit and the
/// last failure (for example "not enough disk space") are cleared, the byte
/// counters stay so Steam resumes. None when nothing needs changing.
pub fn resume_manifest(text: &str) -> Option<String> {
    let state = parse_state(text);
    if state.installed() {
        return None;
    }
    let flags = (state.flags & !UPDATE_PAUSED) | 2;
    let result = vdf_number(text, "UpdateResult");
    if flags == state.flags && result == 0 {
        return None;
    }
    let set = |text: &str, key: &str, value: u64| {
        Regex::new(&format!(r#"("{key}"\s+")\d+(")"#))
            .map(|re| {
                re.replace(text, format!("${{1}}{value}${{2}}"))
                    .into_owned()
            })
            .unwrap_or_else(|_| text.to_string())
    };
    Some(set(&set(text, "StateFlags", flags), "UpdateResult", 0))
}

/// Writes the install request. An existing manifest (a paused or failed
/// download) is kept so Steam resumes it, with its pause cleared.
pub fn queue_install(steamapps: &Path, app_id: &str, title: &str) -> Result<(), String> {
    let manifest = steamapps.join(format!("appmanifest_{app_id}.acf"));
    if manifest.exists() {
        let text = fs::read_to_string(&manifest).map_err(|err| err.to_string())?;
        if let Some(resumed) = resume_manifest(&text) {
            fs::write(&manifest, resumed).map_err(|err| err.to_string())?;
        }
        return Ok(());
    }
    fs::create_dir_all(steamapps.join("common")).map_err(|err| err.to_string())?;
    fs::write(&manifest, queue_manifest(app_id, title)).map_err(|err| err.to_string())
}

fn step_message(step: &str) -> &'static str {
    match step {
        "container" | "compatibility" => "Preparing the game container",
        "steam" | "login" | "cloud" => "Signing in to Steam",
        _ => "Preparing",
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
    let (prefix, container_steamapps) = container_paths(app_id)?;
    let library = crate::services::install_locations::library_for_app(app_id);
    if library.as_deref().is_some_and(|library| !library.is_dir()) {
        return Err(
            "The install location for this game is not connected. Connect its drive, or remove the game from the queue and choose another location."
                .into(),
        );
    }
    let steamapps = game_steamapps(app_id)?;
    let host = SteamHost {
        wine: wine.clone(),
        prefix: prefix.clone(),
    };
    let mut progress = |step: &str| {
        let (step_id, detail) = crate::launching::progress::split_step(step);
        let message = detail.unwrap_or_else(|| step_message(step_id));
        steam_windows::emit_game_progress(
            app,
            key,
            label,
            json!({ "phase": "Installing", "component": label, "message": message }),
        );
    };

    // A new container is created (and signed in) once before the request is
    // written, so the manifest lands in the Steam library the client reads.
    if !container_steamapps.parent().is_some_and(Path::is_dir) {
        if let Err(err) = super::steam_play::download_environment(
            &profile,
            app_id,
            cancel,
            &preferences,
            &mut progress,
        ) {
            steam_windows::emit_status(app, repo);
            return Err(err);
        }
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
    if let Some(library) = &library {
        register_library(&prefix, library)?;
        drop_unfinished_copy(&container_steamapps, app_id);
    }
    queue_install(&steamapps, app_id, label)?;
    // Only lines this client run writes count; earlier runs are in the log too.
    // The log lives with the container's client, wherever the game installs.
    let mut log = ContentLog::from_end(
        &container_steamapps
            .with_file_name("logs")
            .join("content_log.txt"),
    );
    if let Err(err) = super::steam_play::download_environment(
        &profile,
        app_id,
        cancel,
        &preferences,
        &mut progress,
    ) {
        steam_windows::emit_status(app, repo);
        return Err(err);
    }

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

/// Where download bytes come from. The downloading folder's allocated blocks
/// count, unless that folder already held most of the staged size when the
/// download began: Steam preallocated real blocks (or resumed a large partial
/// download), so the folder cannot show growth. Then the bytes the Mac has
/// received since that moment stand in, on top of what Steam said it had.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ByteSource {
    Disk,
    Network { since: u64 },
}

impl ByteSource {
    pub fn choose(staged_at_start: u64, stage_total: u64, received_now: u64) -> Self {
        if stage_total > 0 && staged_at_start.saturating_mul(2) > stage_total {
            Self::Network {
                since: received_now,
            }
        } else {
            Self::Disk
        }
    }

    /// (downloaded, total) network bytes, never past the total.
    pub fn bytes(self, staged: u64, received_now: u64, update: &UpdateLog) -> (u64, u64) {
        match self {
            Self::Disk => download_estimate(staged, update.download_total, update.stage_total),
            Self::Network { since } => {
                let total = if update.download_total > 0 {
                    update.download_total
                } else {
                    update.stage_total
                };
                let got = update
                    .download_start
                    .saturating_add(received_now.saturating_sub(since));
                (got.min(total), total)
            }
        }
    }
}

/// Smoothed bytes per second from successive byte counts.
#[derive(Debug, Default)]
pub struct RateMeter {
    last: Option<(Instant, u64)>,
    rate: Option<f64>,
}

impl RateMeter {
    /// The rate after this sample; samples closer than 0.9 s keep the last one.
    pub fn sample(&mut self, bytes: u64, now: Instant) -> u64 {
        let Some((at, previous)) = self.last else {
            self.last = Some((now, bytes));
            return 0;
        };
        let elapsed = now.saturating_duration_since(at).as_secs_f64();
        if elapsed < 0.9 {
            return self.rate.map_or(0, |rate| rate.round() as u64);
        }
        let measured = bytes.saturating_sub(previous) as f64 / elapsed;
        self.last = Some((now, bytes));
        let rate = self.rate.map_or(measured, |rate| {
            rate * (1.0 - RATE_SMOOTHING) + measured * RATE_SMOOTHING
        });
        self.rate = Some(rate);
        rate.round() as u64
    }
}

/// The step event for the panel, without the rate. Waiting (signed in, Steam
/// not started yet) already counts as starting, so sign-in never lingers.
fn step_event(step: UpdateStep, label: &str, bytes: (u64, u64)) -> Option<serde_json::Value> {
    let message =
        |text: &str| json!({ "phase": "Installing", "component": label, "message": text });
    match step {
        UpdateStep::Waiting | UpdateStep::Preparing => Some(message("Starting download")),
        UpdateStep::Preallocating => Some(message("Allocating disk space")),
        UpdateStep::Downloading => Some(json!({
            "phase": "Downloading",
            "component": label,
            "downloadedBytes": bytes.0,
            "totalBytes": bytes.1,
        })),
        UpdateStep::Verifying => Some(json!({ "phase": "Verifying", "component": label })),
        UpdateStep::Committing => Some(message("Installing files")),
        UpdateStep::Installed => None,
    }
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
    let mut staged = 0u64;
    let mut source: Option<ByteSource> = None;
    let mut measured_at: Option<Instant> = None;
    let mut meter = RateMeter::default();
    let mut last_event = serde_json::Value::Null;
    let mut emitted_at = Instant::now();
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
        let mut total = 0u64;
        if update.step == UpdateStep::Downloading {
            if measured_at.is_none_or(|at| at.elapsed() >= MEASURE_EVERY) {
                let mut budget = 200_000;
                staged = crate::services::install_roots::disk_usage(&downloading, &[], &mut budget)
                    .max(state.staged);
                measured_at = Some(Instant::now());
            }
            let received = crate::services::network_monitor::received_bytes();
            let chosen = *source
                .get_or_insert_with(|| ByteSource::choose(staged, update.stage_total, received));
            let (bytes, of) = chosen.bytes(staged, received, &update);
            total = of;
            downloaded = downloaded.max(bytes.max(state.downloaded.min(of)));
        }
        if let Some(event) = step_event(update.step, label, (downloaded, total)) {
            if event != last_event || emitted_at.elapsed() >= HEARTBEAT {
                let mut payload = event.clone();
                if update.step == UpdateStep::Downloading {
                    payload["bytesPerSecond"] = json!(meter.sample(downloaded, Instant::now()));
                }
                steam_windows::emit_game_progress(app, key, label, payload);
                last_event = event;
                emitted_at = Instant::now();
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

    fn update(start: u64, download: u64, stage: u64) -> UpdateLog {
        UpdateLog {
            download_start: start,
            download_total: download,
            stage_total: stage,
            ..UpdateLog::default()
        }
    }

    #[test]
    fn preallocated_blocks_switch_progress_to_received_bytes() {
        // Steam preallocated 634 MB of the 670 MB stage before any byte
        // arrived; the folder read as 95% done and then never moved.
        let log = update(0, 129_107_072, 669_975_131);
        let source = ByteSource::choose(634_000_000, log.stage_total, 5_000);
        assert_eq!(source, ByteSource::Network { since: 5_000 });
        assert_eq!(source.bytes(634_000_000, 5_000, &log), (0, 129_107_072));
        assert_eq!(
            source.bytes(634_000_000, 10_005_000, &log),
            (10_000_000, 129_107_072)
        );
        assert_eq!(
            source.bytes(0, u64::MAX, &log).0,
            129_107_072,
            "never past the total"
        );
    }

    #[test]
    fn a_sparse_folder_keeps_counting_from_disk() {
        let log = update(0, 129_107_072, 669_975_131);
        let source = ByteSource::choose(1_000, log.stage_total, 0);
        assert_eq!(source, ByteSource::Disk);
        assert_eq!(
            source.bytes(334_987_565, 0, &log),
            (64_553_535, 129_107_072)
        );
    }

    #[test]
    fn a_resumed_download_starts_from_what_steam_already_had() {
        let log = update(80_000_000, 129_107_072, 669_975_131);
        let source = ByteSource::choose(420_000_000, log.stage_total, 1_000);
        assert_eq!(source.bytes(420_000_000, 1_000, &log).0, 80_000_000);
        assert_eq!(source.bytes(420_000_000, 2_001_000, &log).0, 82_000_000);
    }

    #[test]
    fn the_rate_is_smoothed_and_falls_when_bytes_stop() {
        let mut meter = RateMeter::default();
        let start = Instant::now();
        assert_eq!(meter.sample(0, start), 0);
        assert_eq!(
            meter.sample(10_000_000, start + Duration::from_secs(1)),
            10_000_000
        );
        assert_eq!(
            meter.sample(10_000_000, start + Duration::from_millis(1_500)),
            10_000_000,
            "too soon: the last rate stands"
        );
        assert_eq!(
            meter.sample(10_000_000, start + Duration::from_secs(2)),
            6_000_000
        );
        assert_eq!(
            meter.sample(10_000_000, start + Duration::from_secs(3)),
            3_600_000
        );
    }

    #[test]
    fn signed_in_but_not_started_reads_as_starting_the_download() {
        let waiting = step_event(UpdateStep::Waiting, "Game", (0, 0)).unwrap();
        assert_eq!(waiting["message"], "Starting download");
        assert_eq!(step_message("login"), "Signing in to Steam");
        let downloading = step_event(UpdateStep::Downloading, "Game", (5, 10)).unwrap();
        assert_eq!(downloading["downloadedBytes"], 5);
        assert!(step_event(UpdateStep::Installed, "Game", (0, 0)).is_none());
    }

    #[test]
    fn a_paused_failed_manifest_is_made_ready_to_resume() {
        // Regression: Devil May Cry 5 failed once for disk space (StateFlags
        // 1554 = 0x612, Update Paused; UpdateResult 12). Orbit kept the file
        // and Steam never restarted a paused update: "Steam did not start
        // the download" after four minutes.
        let text = "\"AppState\"\n{\n\t\"StateFlags\"\t\t\"1554\"\n\t\"UpdateResult\"\t\t\"12\"\n\t\"BytesToDownload\"\t\t\"35526537552\"\n\t\"BytesDownloaded\"\t\t\"100\"\n}\n";
        let resumed = resume_manifest(text).expect("changed");
        let state = parse_state(&resumed);
        assert_eq!(state.flags & UPDATE_PAUSED, 0);
        assert_eq!(state.flags, 1026 | 0x10);
        assert_eq!(vdf_number(&resumed, "UpdateResult"), 0);
        assert_eq!(state.downloaded, 100, "partial bytes stay");
        assert_eq!(resume_manifest(&resumed), None);
        assert_eq!(resume_manifest("\"StateFlags\"\t\t\"4\"\n"), None);
    }

    #[test]
    fn a_picked_library_keeps_one_identity_in_both_files() {
        let library = std::env::temp_dir().join(format!("orbit-libid-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(library.join("steamapps")).unwrap();
        let id = write_library_identity(&library).unwrap();
        assert!(id > 0);
        for file in ["libraryfolder.vdf", "steamapps/libraryfolder.vdf"] {
            let text = fs::read_to_string(library.join(file)).unwrap();
            assert!(text.starts_with("\"libraryfolder\""));
            assert!(text.contains(&format!("\"{id}\"")));
        }
        assert_eq!(
            write_library_identity(&library).unwrap(),
            id,
            "kept once written"
        );
        fs::remove_file(library.join("libraryfolder.vdf")).unwrap();
        assert_eq!(
            write_library_identity(&library).unwrap(),
            id,
            "restored from the other"
        );
        let _ = fs::remove_dir_all(library);
    }

    #[test]
    fn moving_a_game_drops_only_an_unfinished_container_copy() {
        let steamapps = std::env::temp_dir().join(format!("orbit-move-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(steamapps.join("downloading/601150")).unwrap();
        let manifest = steamapps.join("appmanifest_601150.acf");
        fs::write(&manifest, "\"StateFlags\"\t\t\"1554\"\n").unwrap();
        drop_unfinished_copy(&steamapps, "601150");
        assert!(!manifest.exists());
        assert!(!steamapps.join("downloading/601150").exists());
        fs::write(&manifest, "\"StateFlags\"\t\t\"4\"\n").unwrap();
        drop_unfinished_copy(&steamapps, "601150");
        assert!(manifest.exists(), "a finished install stays");
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
