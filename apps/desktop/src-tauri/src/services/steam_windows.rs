//! Windows Steam runs inside Orbit's compatibility environment. The Mac Steam
//! app is never started. SteamCMD runs only for a download.

use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering};
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::database::GameRepository;
use crate::models::{GameArtwork, GamePlatform, GameProvider, ImportedGame, LaunchConfiguration};
use crate::runtimes::{self, WineProfile};
use crate::services::steam_catalog::{self, SteamCatalogEntry};
use crate::services::steam_download::{
    asks_for_secret, find_game_executable, install_dir, parse_progress_line, valid_app_id,
    DownloadStage,
};
use crate::utils::paths::app_data_dir;
use crate::utils::steam_account::{self, most_recent_account, userdata_account_id};

const ACCOUNT_KEY: &str = "steam-windows-account-v1";
const LIBRARY_KEY: &str = "steam-windows-library-v1";
const PREFERENCES_KEY: &str = "steam-windows-settings-v1";
const STEAMCMD_URL: &str = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_osx.tar.gz";
const STEAMCMD_LIMIT: u64 = 80_000_000;
const STEAM_WINE_URL: &str = "https://github.com/Gcenx/macOS_Wine_builds/releases/download/11.21/wine-devel-11.21-osx64.tar.xz";
const STEAM_WINE_SHA256: &str = "9909b486657e10ab66c7279371ae1f990345b596b3b1b3a0cf21f28af24fa0ce";
const STEAM_WINE_LIMIT: u64 = 260_000_000;
const STEAM_SETUP_KEY: &str = "steam:setup";
const STEAM_SETUP_LABEL: &str = "Steam for Windows";
const STEAM_SETUP_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const STEAM_CLIENT_TIMEOUT: Duration = Duration::from_secs(20 * 60);

static CLIENT_RUNNING: AtomicBool = AtomicBool::new(false);
static CANCEL_SIGN_IN: AtomicBool = AtomicBool::new(false);
static DOWNLOAD_ACTIVE: AtomicBool = AtomicBool::new(false);
static DOWNLOAD_CHILD: Mutex<Option<Child>> = Mutex::new(None);
/// Why the running download was stopped, so a pause is not reported as a failure.
static DOWNLOAD_STOP: AtomicU8 = AtomicU8::new(STOP_NONE);
/// Cancels container start-up for a download (shared with the launch path).
static DOWNLOAD_CANCEL: AtomicBool = AtomicBool::new(false);
const STOP_NONE: u8 = 0;
const STOP_CANCEL: u8 = 1;
const STOP_PAUSE: u8 = 2;
const STOP_OFFLINE: u8 = 3;
/// Largest total SteamCMD reported for the current download, in bytes.
static LAST_TOTAL: AtomicU64 = AtomicU64::new(0);

/// How a game download ended when SteamCMD did not fail.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DownloadOutcome {
    Completed,
    Cancelled,
    Paused,
    /// Stopped because the Mac went offline; the queue resumes it.
    Offline,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamWindowsStatus {
    pub signed_in: bool,
    pub account_name: Option<String>,
    pub steam_installed: bool,
    pub client_running: bool,
    pub client_logged_in: bool,
    pub client_phase: String,
    pub client_caption: String,
    pub owned_count: usize,
    /// A refresh token games can log on with. The account name alone is not enough.
    pub session_ready: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SteamWindowsPreferences {
    pub offline_mode: bool,
    pub verify_files: bool,
    #[serde(default)]
    pub additional_library_paths: Vec<String>,
    /// Steam Input (controller configuration) for games. Off by default: under
    /// Wine and Rosetta it translates every controller report in Steam's own
    /// process, which stutters games; winebus already hands the pad to the
    /// game as XInput (see `runtimes::controllers`).
    #[serde(default)]
    pub steam_input: bool,
    /// Steam's in-game overlay (Shift+Tab). Off: it hooks the game's rendering.
    #[serde(default)]
    pub steam_overlay: bool,
    /// Retired `playEngine` choice. Read so older settings still load (unknown
    /// fields are refused), never written back.
    #[serde(default, rename = "playEngine", skip_serializing)]
    legacy_play_engine: Option<serde_json::Value>,
}

impl Default for SteamWindowsPreferences {
    fn default() -> Self {
        Self {
            offline_mode: false,
            verify_files: true,
            additional_library_paths: Vec::new(),
            steam_input: false,
            steam_overlay: false,
            legacy_play_engine: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamOwnedGame {
    pub app_id: String,
    pub title: String,
    pub description: Option<String>,
    pub cover_url: String,
    pub hero_url: String,
    pub installed: bool,
}

pub fn session_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("steam-windows")
}

pub fn status(repo: &GameRepository) -> Result<SteamWindowsStatus, String> {
    adopt_existing_client_login(repo)?;
    let account = stored_account(repo)?;
    let owned_count = stored_entries(repo)?.len();
    let signed_in = account.is_some();
    let steam_installed = steam_client_ready(&steam_prefix());
    let client_running = live_client_running();
    let client_logged_in = live_client_logged_on();
    let (client_phase, client_caption) =
        super::steam_client::describe(signed_in, steam_installed, client_running, client_logged_in);
    Ok(SteamWindowsStatus {
        signed_in,
        account_name: account,
        steam_installed,
        client_running,
        client_logged_in,
        client_phase,
        client_caption,
        owned_count,
        session_ready: super::steam_native::session::has_saved(&session_dir(&app_data_dir())),
    })
}

pub(crate) fn emit_status(app: &AppHandle, repo: &GameRepository) {
    if let Ok(current) = status(repo) {
        if let Err(err) = app.emit("steam-client", &current) {
            eprintln!("Could not emit Steam client status: {err}");
        }
    }
}

pub(crate) fn set_login_window_running(running: bool) {
    CLIENT_RUNNING.store(running, Ordering::Relaxed);
}

pub(crate) fn login_in_progress() -> bool {
    CLIENT_RUNNING.load(Ordering::Relaxed)
}

pub(crate) fn download_active() -> bool {
    DOWNLOAD_ACTIVE.load(Ordering::SeqCst)
}

pub fn cancel_sign_in() {
    CANCEL_SIGN_IN.store(true, Ordering::Relaxed);
}

pub fn begin_sign_in() {
    CANCEL_SIGN_IN.store(false, Ordering::Relaxed);
}

pub fn sign_in_cancelled() -> bool {
    CANCEL_SIGN_IN.load(Ordering::Relaxed)
}

pub fn disconnect(repo: &GameRepository, data_dir: &Path) -> Result<(), String> {
    if let Some(wine) = steam_wine_binary() {
        stop_steam_wineserver(&wine, &session_dir(data_dir).join("prefix"));
    }
    super::steam_background_sync::remove_sync_dir(&crate::runtimes::root())?;
    remove_session_dir(data_dir)?;
    repo.set_setting(ACCOUNT_KEY, &json!(null))
        .map_err(|err| err.to_string())?;
    repo.set_setting(LIBRARY_KEY, &json!([]))
        .map_err(|err| err.to_string())?;
    Ok(())
}

pub fn preferences(repo: &GameRepository) -> Result<SteamWindowsPreferences, String> {
    let value = repo
        .get_setting(PREFERENCES_KEY)
        .map_err(|err| err.to_string())?;
    Ok(match value {
        Some(value) => serde_json::from_value(value).unwrap_or_default(),
        None => SteamWindowsPreferences::default(),
    })
}

pub fn set_preferences(
    repo: &GameRepository,
    mut preferences: SteamWindowsPreferences,
) -> Result<SteamWindowsPreferences, String> {
    preferences.additional_library_paths =
        crate::services::steam_library_paths::validate(&preferences.additional_library_paths)?;
    repo.set_setting(
        PREFERENCES_KEY,
        &serde_json::to_value(&preferences).map_err(|err| err.to_string())?,
    )
    .map_err(|err| err.to_string())?;
    Ok(preferences)
}

pub fn library(repo: &GameRepository) -> Result<Vec<SteamOwnedGame>, String> {
    Ok(present(
        stored_entries(repo)?,
        &preferences(repo)?.additional_library_paths,
    ))
}

pub fn present(entries: Vec<SteamCatalogEntry>, paths: &[String]) -> Vec<SteamOwnedGame> {
    let library = install_index(paths);
    entries
        .into_iter()
        .filter_map(|entry| {
            let library_install = library.by_id.get(&entry.app_id);
            let installed = orbit_installed(&entry.app_id) || library_install.is_some();
            if !steam_catalog::is_game(&entry, installed) {
                return None;
            }
            let title = if steam_catalog::is_placeholder_title(&entry.title, &entry.app_id) {
                library_install
                    .map(|install| install.title.clone())
                    .unwrap_or(entry.title)
            } else {
                entry.title
            };
            Some(SteamOwnedGame {
                installed,
                cover_url: entry
                    .cover_url
                    .filter(|url| url.starts_with("https://"))
                    .unwrap_or_else(|| steam_catalog::cover_url(&entry.app_id)),
                hero_url: entry
                    .hero_url
                    .filter(|url| url.starts_with("https://"))
                    .unwrap_or_else(|| steam_catalog::hero_url(&entry.app_id)),
                description: entry.description,
                title,
                app_id: entry.app_id,
            })
        })
        .collect()
}

pub fn stored_entries(repo: &GameRepository) -> Result<Vec<SteamCatalogEntry>, String> {
    let value = repo
        .get_setting(LIBRARY_KEY)
        .map_err(|err| err.to_string())?;
    Ok(steam_catalog::parse_stored_library(value))
}

pub fn play_records(
) -> std::collections::HashMap<String, crate::utils::steam_playtime::SteamPlayRecord> {
    let mut roots = Vec::new();
    if let Some(root) = crate::utils::steam_paths::detect_steam_root() {
        roots.push(root);
    }
    if let Some(root) = steam_support_dir() {
        roots.push(root);
    }
    crate::utils::steam_playtime::load_roots(&roots)
}

pub fn save_library(repo: &GameRepository, entries: &[SteamCatalogEntry]) -> Result<(), String> {
    repo.set_setting(LIBRARY_KEY, &steam_catalog::serialize_library(entries))
        .map_err(|err| err.to_string())
}

pub fn refresh_library(repo: &GameRepository) -> Result<Vec<SteamOwnedGame>, String> {
    refresh_owned_ids(repo)?;
    library(repo)
}

pub fn refresh_owned_ids(repo: &GameRepository) -> Result<(), String> {
    let account =
        stored_account(repo)?.ok_or("Sign in with Steam before refreshing the library")?;
    let recent = saved_account_identity(&account)?;
    let primary_root = steam_support_dir();
    let mac_root = crate::utils::steam_paths::detect_steam_root();
    let containers_root = crate::runtimes::containers::root_in(&crate::runtimes::root());
    let roots = super::steam_local_catalog::matching_steam_roots(
        &recent,
        primary_root.as_deref(),
        mac_root.as_deref(),
        &containers_root,
    );
    let local = super::steam_local_catalog::discover(&recent, &roots);
    // The web cookie is DPAPI-wrapped by the sign-in prefix's own Wine, so only
    // that Wine can read it (never the Wine games play with). Skip spawning Wine
    // when the cookie database is already past its 24h JWT lifetime.
    let prefix = steam_prefix();
    let fetched = if super::steam_session::has_fresh_cookies(&prefix) {
        steam_wine_binary().and_then(|wine| {
            super::steam_session::web_token(&wine, &prefix, &recent.steam_id)
                .ok()
                .and_then(|token| super::steam_qr::fetch_owned_games(token.expose()).ok())
        })
    } else {
        None
    };
    let entries = steam_catalog::apply_owned_snapshot_with_local(
        &stored_entries(repo)?,
        &local.local_ids,
        &local.entries,
        fetched.as_deref(),
    );
    if entries.is_empty() {
        return Err(
            "Steam has not saved your owned games yet. Keep Steam signed in, then refresh the library."
                .into(),
        );
    }
    save_library(repo, &entries)
}

fn saved_account_identity(account: &str) -> Result<steam_account::SteamAccount, String> {
    const LIMIT: u64 = 8 * 1024 * 1024;
    if let Some(support) = steam_support_dir() {
        let login_path = support.join("config/loginusers.vdf");
        if let Ok(metadata) = fs::symlink_metadata(&login_path) {
            if metadata.is_file() && !metadata.file_type().is_symlink() {
                if metadata.len() > LIMIT {
                    return Err("Steam login file was too large".into());
                }
                let mut login = String::new();
                fs::File::open(&login_path)
                    .map_err(|_| "Steam has not saved a local login yet")?
                    .take(LIMIT + 1)
                    .read_to_string(&mut login)
                    .map_err(|_| "Steam has not saved a local login yet")?;
                if login.len() as u64 > LIMIT {
                    return Err("Steam login file was too large".into());
                }
                let recent =
                    most_recent_account(&login).ok_or("Steam has not saved a local login yet")?;
                if !recent.name.eq_ignore_ascii_case(account) {
                    return Err("Steam is signed in as a different account. Sign in again.".into());
                }
                return Ok(recent);
            }
        }
    }
    if let Some(identity) =
        super::steam_native::session::saved_identity(&session_dir(&app_data_dir()))
    {
        if identity.name.eq_ignore_ascii_case(account) {
            return Ok(identity);
        }
        return Err("Steam is signed in as a different account. Sign in again.".into());
    }
    Err("Sign in with Steam before refreshing the library".into())
}

/// Fill an empty owned catalog from the signed-in prefix without failing Library reads.
pub fn ensure_owned_snapshot(repo: &GameRepository) -> Result<(), String> {
    if stored_account(repo)?.is_none() || !stored_entries(repo)?.is_empty() {
        return Ok(());
    }
    let _ = snapshot_local_owned(repo);
    Ok(())
}

fn snapshot_local_owned(repo: &GameRepository) -> Result<(), String> {
    let account =
        stored_account(repo)?.ok_or("Sign in with Steam before refreshing the library")?;
    let Some(support) = steam_support_dir() else {
        return Ok(());
    };
    let Some(recent) = read_support_account() else {
        return Ok(());
    };
    if recent.name != account {
        return Ok(());
    }
    let local_ids = read_owned_ids(&support, &recent.steam_id)?;
    let entries = steam_catalog::apply_owned_snapshot(&stored_entries(repo)?, &local_ids, None);
    if entries.is_empty() {
        return Ok(());
    }
    save_library(repo, &entries)
}

/// Keeps a login that the Windows Steam files already saved. A new sign-in uses
/// the in-app QR modal and does not open a Steam window.
pub fn connect(repo: &GameRepository) -> Result<SteamWindowsStatus, String> {
    let Some(existing) = read_support_account() else {
        return Err("Sign in with the QR code.".into());
    };
    save_account(repo, &existing.name)?;
    refresh_library(repo)?;
    status(repo)
}

/// Saves a login that Steam already wrote. A web cookie is not required. The
/// Steam window is closed once that login is stored.
pub fn capture_login(
    repo: &GameRepository,
) -> Result<(Option<SteamWindowsStatus>, Option<String>), String> {
    if !adopt_existing_client_login(repo)? {
        return Ok((None, None));
    }
    let library_error = if wine_steam_root().join("config/loginusers.vdf").is_file() {
        refresh_owned_ids(repo).err()
    } else {
        None
    };
    Ok((Some(status(repo)?), library_error))
}

/// Store a refresh token that is already on disk and stop the Wine process
/// that was only open to keep that login. Returns false when no client login
/// exists yet.
fn adopt_existing_client_login(repo: &GameRepository) -> Result<bool, String> {
    let session = session_dir(&app_data_dir());
    if !super::steam_native::session::needs_capture(&steam_prefix(), &session) {
        let saved = super::steam_native::session::has_saved(&session);
        if let Some(account) = account_to_restore(
            stored_account(repo)?,
            saved,
            account_name_in(&steam_prefix()),
        ) {
            save_account(repo, &account)?;
            // The library could not refresh without an account; fill it now.
            let _ = refresh_owned_ids(repo);
        }
        return Ok(saved);
    }
    if !capture_client_session()? {
        return Ok(false);
    }
    let Some(account) = account_name_in(&steam_prefix()) else {
        return Ok(true);
    };
    if stored_account(repo)?.is_some_and(|name| name != account) {
        save_library(repo, &[])?;
    }
    save_account(repo, &account)?;
    Ok(true)
}

/// The account to record when a client session is saved but no account is:
/// after Disconnect and a new sign-in, the session was kept while the account
/// stayed empty, so library refreshes failed and the catalog stopped growing.
fn account_to_restore(
    stored: Option<String>,
    session_saved: bool,
    signed_in: Option<String>,
) -> Option<String> {
    (stored.is_none() && session_saved)
        .then_some(signed_in)
        .flatten()
}

/// A `local.vdf` whose token could not be unwrapped, so status polls do not
/// start Wine again until Steam saves a different login.
static FAILED_UNWRAP: Mutex<Option<(u64, std::time::SystemTime)>> = Mutex::new(None);

/// Save the client token from the Settings sign-in so game containers can log
/// on with it, then stop that sign-in's Steam. Only the sign-in prefix is read:
/// game containers hold tokens Orbit wrote. Returns whether a client session
/// is saved.
pub(crate) fn capture_client_session() -> Result<bool, String> {
    let session = session_dir(&app_data_dir());
    let prefix = steam_prefix();
    if !super::steam_native::session::needs_capture(&prefix, &session) {
        return Ok(super::steam_native::session::has_saved(&session));
    }
    let wine = steam_wine_binary();
    let stamp = local_vdf_stamp(&prefix);
    super::steam_native::session::capture_from_client(&prefix, &session, |account| {
        let wine = wine.as_deref()?;
        if stamp.is_some() && *FAILED_UNWRAP.lock() == stamp {
            return None;
        }
        let token = super::steam_native::agent_host::unwrap_saved_token(wine, &prefix, account);
        if token.is_none() {
            *FAILED_UNWRAP.lock() = stamp;
        }
        token
    })?;
    if !super::steam_native::session::has_saved(&session) {
        return Ok(false);
    }
    crate::utils::steam_account::enable_saved_login(
        &crate::runtimes::containers::steam::steam_root(&prefix).join("config/loginusers.vdf"),
    );
    if let Some(wine) = wine {
        stop_steam_runtime(&wine, &prefix);
    }
    Ok(true)
}

fn local_vdf_stamp(prefix: &Path) -> Option<(u64, std::time::SystemTime)> {
    let stamp = |path: &Path| {
        let meta = fs::symlink_metadata(path).ok()?;
        (!meta.file_type().is_symlink() && meta.is_file())
            .then(|| Some((meta.len(), meta.modified().ok()?)))
            .flatten()
    };
    if let Some(active) = super::steam_native::agent_host::profile_user(prefix) {
        let active_path = prefix
            .join("drive_c/users")
            .join(active)
            .join("AppData/Local/Steam/local.vdf");
        if let Some(found) = stamp(&active_path) {
            return Some(found);
        }
    }
    let users = fs::read_dir(prefix.join("drive_c/users")).ok()?;
    let mut names: Vec<PathBuf> = users
        .flatten()
        .take(16)
        .filter(|entry| entry.file_name() != "Public")
        .map(|entry| entry.path())
        .collect();
    names.sort();
    names
        .into_iter()
        .find_map(|dir| stamp(&dir.join("AppData/Local/Steam/local.vdf")))
}

pub(crate) fn saved_client_waiting() -> bool {
    super::steam_native::session::client_login_ready(&steam_prefix())
}

fn account_name_in(prefix: &Path) -> Option<String> {
    let path = crate::runtimes::containers::steam::steam_root(prefix).join("config/loginusers.vdf");
    let meta = fs::symlink_metadata(&path).ok()?;
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > 8 * 1024 * 1024 {
        return None;
    }
    let mut text = String::new();
    fs::File::open(path)
        .ok()?
        .take(8 * 1024 * 1024 + 1)
        .read_to_string(&mut text)
        .ok()?;
    if text.len() as u64 > 8 * 1024 * 1024 {
        return None;
    }
    most_recent_account(&text).map(|account| account.name)
}

/// Saves the account confirmed by a QR login and the owned catalog fetched with it.
pub fn complete_qr_sign_in(
    repo: &GameRepository,
    name: &str,
    games: &[SteamCatalogEntry],
) -> Result<SteamWindowsStatus, String> {
    if !crate::utils::steam_account::valid_account_name(name) {
        return Err("Steam did not return an account name".into());
    }
    save_account(repo, name)?;
    let entries: Vec<SteamCatalogEntry> = games
        .iter()
        .filter(|game| valid_app_id(&game.app_id))
        .take(2_000)
        .cloned()
        .collect();
    save_library(repo, &entries)?;
    status(repo)
}

pub fn install_windows_steam(app: &AppHandle, repo: &GameRepository) -> Result<(), String> {
    let _ = repo;
    match install_windows_steam_inner(app) {
        Ok(()) => {
            emit_steam_setup(
                app,
                json!({
                    "phase": "Ready",
                    "component": STEAM_SETUP_LABEL,
                    "message": "Ready"
                }),
                true,
                None,
            );
            Ok(())
        }
        Err(error) => {
            emit_steam_setup(
                app,
                json!({
                    "phase": "Installing",
                    "component": STEAM_SETUP_LABEL
                }),
                true,
                Some(&error),
            );
            Err(error)
        }
    }
}

fn install_windows_steam_inner(app: &AppHandle) -> Result<(), String> {
    emit_steam_setup(
        app,
        json!({
            "phase": "Installing",
            "component": STEAM_SETUP_LABEL
        }),
        false,
        None,
    );
    if steam_client_ready(&steam_prefix()) {
        return Ok(());
    }
    let wine = ensure_steam_wine()?;
    let prefix = prepare_steam_prefix(&wine)?;
    if steam_client_ready(&prefix) {
        return Ok(());
    }
    let mut setup_child = None;
    if !steam_already_installed(&prefix) {
        let setup = session_dir(&app_data_dir()).join("SteamSetup.exe");
        if !setup.is_file() {
            emit_steam_setup(
                app,
                json!({
                    "phase": "Downloading",
                    "component": STEAM_SETUP_LABEL,
                    "downloadedBytes": 0,
                    "totalBytes": 0
                }),
                false,
                None,
            );
            download_steam_setup(&setup)?;
        }
        emit_steam_setup(
            app,
            json!({
                "phase": "Installing",
                "component": STEAM_SETUP_LABEL
            }),
            false,
            None,
        );
        setup_child = Some(
            hidden_steam_command(&wine, &prefix)
                .arg(&setup)
                .arg("/S")
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|_| "Steam's Windows installer could not be opened".to_string())?,
        );
        if !wait_for_file(
            &steam_exe_in(&prefix),
            STEAM_SETUP_TIMEOUT,
            Duration::from_millis(500),
        ) {
            if let Some(mut child) = setup_child.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
            return Err(
                "Steam for Windows did not finish installing. Try again from Settings → Steam."
                    .into(),
            );
        }
    }
    emit_steam_setup(
        app,
        json!({
            "phase": "Installing",
            "component": STEAM_SETUP_LABEL
        }),
        false,
        None,
    );
    let mut updater = None;
    if !steam_client_ready(&prefix) {
        if setup_child.is_none() {
            stop_steam_wineserver(&wine, &prefix);
        }
        updater = Some(
            hidden_steam_command(&wine, &prefix)
                .arg(steam_exe_in(&prefix))
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|_| "Steam could not start its Windows update".to_string())?,
        );
    }
    let ready = wait_for_steam_browser(app, &prefix, STEAM_CLIENT_TIMEOUT);
    if !ready {
        if let Some(mut child) = updater.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        if let Some(mut child) = setup_child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        return Err(
            "Steam did not finish installing its browser. Keep this Mac online and try signing in again."
                .into(),
        );
    }
    Ok(())
}

/// Stops the running game download and reports it as cancelled.
pub fn cancel_download() {
    stop_download(STOP_CANCEL);
}

/// Stops the running game download so the queue can resume it later.
/// SteamCMD keeps partial files, so the next run continues where this one stopped.
pub fn pause_download() {
    stop_download(STOP_PAUSE);
}

/// Stops the running game download because the network is gone.
pub fn stop_for_network() {
    stop_download(STOP_OFFLINE);
}

fn stop_download(reason: u8) {
    if !DOWNLOAD_ACTIVE.load(Ordering::SeqCst) {
        return;
    }
    DOWNLOAD_STOP.store(reason, Ordering::SeqCst);
    DOWNLOAD_CANCEL.store(true, Ordering::SeqCst);
    kill_download_child();
}

/// Records the size Steam reported for the finished download.
pub(crate) fn note_download_total(bytes: u64) {
    LAST_TOTAL.fetch_max(bytes, Ordering::SeqCst);
}

fn kill_download_child() {
    if let Some(child) = DOWNLOAD_CHILD.lock().as_mut() {
        let _ = child.kill();
    }
}

/// Bytes SteamCMD downloaded for the last finished game, when it reported any.
pub fn last_download_total() -> Option<i64> {
    let total = LAST_TOTAL.load(Ordering::SeqCst);
    (total > 0).then(|| i64::try_from(total).unwrap_or(i64::MAX))
}

pub(crate) fn stop_outcome() -> Option<DownloadOutcome> {
    match DOWNLOAD_STOP.load(Ordering::SeqCst) {
        STOP_CANCEL => Some(DownloadOutcome::Cancelled),
        STOP_PAUSE => Some(DownloadOutcome::Paused),
        STOP_OFFLINE => Some(DownloadOutcome::Offline),
        _ => None,
    }
}

/// Downloads one owned game: its macOS build through Steam for Mac when
/// `native`, otherwise the Windows build through the game container's client.
pub fn download(
    app: &AppHandle,
    repo: &GameRepository,
    app_id: &str,
    label: &str,
    native: bool,
) -> Result<DownloadOutcome, String> {
    if !valid_app_id(app_id) {
        return Err("Steam app id must be a number".into());
    }
    if DOWNLOAD_ACTIVE
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("A Steam download is already running".into());
    }
    DOWNLOAD_STOP.store(STOP_NONE, Ordering::SeqCst);
    DOWNLOAD_CANCEL.store(false, Ordering::SeqCst);
    LAST_TOTAL.store(0, Ordering::SeqCst);
    let key = format!("steam:{app_id}");
    // A pause or cancel during container start-up surfaces as an error from
    // the launch path; report it as the stop it was.
    let result = prepare_and_run_download(app, repo, app_id, &key, label, native)
        .or_else(|error| stop_outcome().ok_or(error));
    DOWNLOAD_ACTIVE.store(false, Ordering::SeqCst);
    DOWNLOAD_STOP.store(STOP_NONE, Ordering::SeqCst);
    result
}

/// Downloads with the container's signed-in Windows Steam client (one login
/// for sign-in, Play and downloads), or with Steam for Mac and its own login
/// for a native build. SteamCMD is no longer used: it needs a separate login
/// the Windows client's DPAPI-wrapped token cannot provide.
fn prepare_and_run_download(
    app: &AppHandle,
    repo: &GameRepository,
    app_id: &str,
    key: &str,
    label: &str,
    native: bool,
) -> Result<DownloadOutcome, String> {
    emit_game_progress(
        app,
        key,
        label,
        json!({ "phase": "Installing", "component": label, "message": "Preparing" }),
    );
    let outcome = if native {
        super::steam_mac_download::run(app, app_id, key, label)?
    } else {
        stored_account(repo)?.ok_or("Sign in to Steam in Settings → Steam, then try again.")?;
        super::steam_client_download::run(app, repo, app_id, key, label, &DOWNLOAD_CANCEL)?
    };
    if outcome == DownloadOutcome::Completed {
        let _ = app.emit(
            "steam-download-progress",
            json!({
                "key": key,
                "label": label,
                "done": true,
                "progress": { "phase": "Ready", "component": label, "message": "Installed" }
            }),
        );
    }
    Ok(outcome)
}

pub(crate) fn emit_game_progress(
    app: &AppHandle,
    key: &str,
    label: &str,
    progress: serde_json::Value,
) {
    let _ = app.emit(
        "steam-download-progress",
        json!({ "key": key, "label": label, "done": false, "progress": progress }),
    );
}

pub fn play(repo: &GameRepository, app_id: &str) -> Result<String, String> {
    if !valid_app_id(app_id) {
        return Err("Steam app id must be a number".into());
    }
    let libraries = play_library_paths(repo);
    let library = install_index(&libraries);
    let executable = super::steam_native::installed::executable_in_libraries(
        app_id,
        &libraries,
        &orbit_install_dirs(app_id),
    )
    .or_else(|| {
        super::steam_native::installed::executable_from_manifest(
            app_id,
            &libraries,
            &container_manifest(app_id)?,
        )
    })
    .or_else(|| {
        let dirs =
            super::steam_native::installed::install_dirs(&wine_steam_root(), &[app_id.to_string()]);
        super::steam_native::installed::executable_by_installdir(dirs.get(app_id)?, &libraries)
    })
    .ok_or("Download the game before playing")?;
    let runtime = play_wine_binary(repo)
        .ok_or("Install a Windows compatibility runtime in Settings before playing this game")?;
    save_install(repo, app_id, &executable, &runtime, &library)
}

/// Saves a finished Orbit download as a library installation, so the title
/// shows as installed (with its size) before it is played the first time.
/// The runtime is filled in when one is installed; `play` refreshes it.
pub fn register_download(repo: &GameRepository, app_id: &str) -> Result<String, String> {
    if !valid_app_id(app_id) {
        return Err("Steam app id must be a number".into());
    }
    let executable = orbit_install_dirs(app_id)
        .iter()
        .find_map(|dir| find_game_executable(dir))
        .ok_or("The download finished without a game executable")?;
    let runtime = play_wine_binary(repo).unwrap_or_default();
    save_install(
        repo,
        app_id,
        &executable,
        &runtime,
        &crate::services::steam_manifest::SteamInstallIndex::default(),
    )
}

/// Sizes Steam recorded for an Orbit-managed install, read from the
/// appmanifest SteamCMD writes next to the game files.
pub fn orbit_install_sizes(app_id: &str) -> crate::services::steam_manifest::ManifestSizes {
    let client_manifest = super::steam_client_download::game_steamapps(app_id)
        .ok()
        .map(|steamapps| steamapps.join(format!("appmanifest_{app_id}.acf")));
    orbit_install_dirs(app_id)
        .iter()
        .map(|dir| dir.join(format!("steamapps/appmanifest_{app_id}.acf")))
        .chain(client_manifest)
        .map(|manifest| crate::services::steam_manifest::manifest_sizes(&manifest))
        .find(|sizes| sizes.size_on_disk.is_some())
        .unwrap_or_default()
}

fn save_install(
    repo: &GameRepository,
    app_id: &str,
    executable: &Path,
    runtime: &Path,
    library: &crate::services::steam_manifest::SteamInstallIndex,
) -> Result<String, String> {
    let title = stored_entries(repo)?
        .into_iter()
        .find(|entry| entry.app_id == app_id)
        .map(|entry| entry.title)
        .filter(|title| !steam_catalog::is_placeholder_title(title, app_id))
        .or_else(|| {
            library
                .by_id
                .get(app_id)
                .map(|install| install.title.clone())
        })
        .unwrap_or_else(|| format!("Steam {app_id}"));
    let imported = ImportedGame {
        stable_key: format!("steam-windows:{app_id}"),
        title: title.clone(),
        sort_title: title.to_lowercase(),
        description: None,
        provider: GameProvider::Steam,
        platform: GamePlatform::Windows,
        source_id: Some(app_id.to_string()),
        launch_config: LaunchConfiguration::Wine {
            profile: WineProfile {
                executable: executable.to_string_lossy().into_owned(),
                runtime_path: runtime.to_string_lossy().into_owned(),
                ..WineProfile::default()
            },
        },
        artwork: GameArtwork {
            cover: Some(steam_catalog::cover_url(app_id)),
            hero: Some(steam_catalog::hero_url(app_id)),
            logo: Some(steam_catalog::logo_url(app_id)),
            icon: None,
        },
        total_playtime_seconds: 0,
        install_size_bytes: orbit_install_sizes(app_id).size_on_disk.or_else(|| {
            library
                .by_id
                .get(app_id)
                .and_then(|install| install.size_on_disk)
        }),
        achievements: Vec::new(),
    };
    let upserted = repo
        .upsert_imported(&[imported])
        .map_err(|err| err.to_string())?;
    upserted
        .game_ids
        .into_iter()
        .next()
        .ok_or_else(|| "The game could not be saved".into())
}

fn save_account(repo: &GameRepository, name: &str) -> Result<(), String> {
    repo.set_setting(ACCOUNT_KEY, &json!(name))
        .map_err(|err| err.to_string())
}

pub(crate) fn remember_account(repo: &GameRepository, name: &str) -> Result<(), String> {
    save_account(repo, name)
}

pub(crate) fn stored_account(repo: &GameRepository) -> Result<Option<String>, String> {
    let value = repo
        .get_setting(ACCOUNT_KEY)
        .map_err(|err| err.to_string())?;
    Ok(match value {
        Some(serde_json::Value::String(name))
            if crate::utils::steam_account::valid_account_name(&name) =>
        {
            Some(name)
        }
        _ => None,
    })
}

pub(crate) fn steam_prefix() -> PathBuf {
    session_dir(&app_data_dir()).join("prefix")
}

pub(crate) fn wine_steam_root() -> PathBuf {
    wine_steam_root_in(&steam_prefix())
}

pub(crate) fn steam_exe() -> PathBuf {
    wine_steam_root().join("steam.exe")
}

fn steam_support_dir() -> Option<PathBuf> {
    let path = wine_steam_root();
    path.is_dir().then_some(path)
}

/// Steam library `common` folders Orbit plays Windows games from.
pub fn windows_library_paths(repo: &GameRepository) -> Vec<String> {
    play_library_paths(repo)
}

fn play_library_paths(repo: &GameRepository) -> Vec<String> {
    let extra = preferences(repo)
        .map(|prefs| prefs.additional_library_paths)
        .unwrap_or_default();
    play_library_paths_from(&extra)
}

fn play_library_paths_from(extra: &[String]) -> Vec<String> {
    let merged = super::install_locations::merge_library_paths(extra);
    super::steam_native::installed::library_paths(
        dirs::home_dir().as_deref(),
        crate::utils::steam_paths::detect_steam_root().as_deref(),
        &merged,
    )
}

pub fn installed_app_ids(
    entries: &[SteamCatalogEntry],
    paths: &[String],
) -> std::collections::HashSet<String> {
    let libraries = play_library_paths_from(paths);
    let mut ids = super::steam_native::installed::discover(
        &libraries,
        &crate::runtimes::containers::root_in(&crate::runtimes::root()).join("games"),
        &session_dir(&app_data_dir()).join("games"),
    );
    for entry in entries {
        if orbit_installed(&entry.app_id) {
            ids.insert(entry.app_id.clone());
        }
    }
    // A library can lose an app's manifest while the game folder stays; Steam's
    // appinfo cache still names that folder.
    let missing: Vec<String> = entries
        .iter()
        .filter(|entry| !ids.contains(&entry.app_id))
        .map(|entry| entry.app_id.clone())
        .collect();
    for (app_id, installdir) in
        super::steam_native::installed::install_dirs(&wine_steam_root(), &missing)
    {
        if super::steam_native::installed::executable_by_installdir(&installdir, &libraries)
            .is_some()
        {
            ids.insert(app_id);
        }
    }
    ids
}

/// The Wine a Steam title plays with. A CrossOver-class Orbit Wine (MSync and
/// D3DMetal hooks) wins; the sign-in Wine lacks both and runs games slowly.
pub(crate) fn play_wine_binary(repo: &GameRepository) -> Option<PathBuf> {
    runtimes::wine_capabilities::installed_crossover(&runtimes::root())
        .or_else(steam_wine_binary)
        .or_else(|| wine_executable(repo))
}

/// The manifest the game container's own Steam keeps for this app.
fn container_manifest(app_id: &str) -> Option<PathBuf> {
    let id = super::steam_native::downloads::container_id(app_id).ok()?;
    let prefix = crate::runtimes::containers::root_in(&crate::runtimes::root())
        .join("games")
        .join(id)
        .join("prefix");
    Some(
        crate::runtimes::containers::steam::steam_root(&prefix)
            .join(format!("steamapps/appmanifest_{app_id}.acf")),
    )
}

pub(crate) fn orbit_install_dirs(app_id: &str) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    // Installed by the game container's own Steam client.
    if let Some(dir) = super::steam_client_download::client_install_dir(app_id) {
        dirs.push(dir);
    }
    if let Ok(dir) = super::steam_native::downloads::install_dir(&crate::runtimes::root(), app_id) {
        dirs.push(dir);
    }
    if let Ok(dir) = install_dir(&session_dir(&app_data_dir()), app_id) {
        dirs.push(dir);
    }
    dirs
}

fn orbit_installed(app_id: &str) -> bool {
    orbit_install_dirs(app_id).iter().any(|dir| {
        dir.join(format!("steamapps/appmanifest_{app_id}.acf"))
            .is_file()
            || find_game_executable(dir).is_some()
    })
}

pub(crate) fn steam_runtime_command(wine: &Path, prefix: &Path) -> Command {
    let mut command = Command::new(wine);
    command.env_clear();
    for key in ["HOME", "USER", "TMPDIR", "LOGNAME"] {
        if let Some(value) = std::env::var_os(key) {
            command.env(key, value);
        }
    }
    let mut path = wine
        .parent()
        .map(|bin| bin.as_os_str().to_owned())
        .unwrap_or_default();
    path.push(":/usr/bin:/bin:/usr/sbin:/sbin");
    command
        .env("PATH", path)
        .env("LANG", "en_US.UTF-8")
        .env("LC_ALL", "en_US.UTF-8")
        .env("WINEPREFIX", prefix)
        .env("WINEDEBUG", "-all")
        .envs(runtimes::wine_capabilities::container_sync_env(wine));
    if is_helper_prefix(prefix, &helper_prefixes()) {
        command.env(
            "WINEDLLOVERRIDES",
            runtimes::controllers::NO_CONTROLLERS_DLL,
        );
    } else {
        // Games Steam starts inherit these.
        command
            .envs(runtimes::controllers::container_controller_env())
            .envs(runtimes::audio::container_audio_env());
    }
    command
}

/// Prefixes whose Steam only signs in or syncs the library, never a game.
fn helper_prefixes() -> [PathBuf; 2] {
    [
        steam_prefix(),
        super::steam_background_sync::sync_prefix(&runtimes::root()),
    ]
}

fn is_helper_prefix(prefix: &Path, helpers: &[PathBuf]) -> bool {
    helpers.iter().any(|helper| helper == prefix)
}

/// The one entry for every Windows Steam client Orbit starts (container
/// clients, the setup installer, the updater, `-shutdown`, background sync):
/// Steam runs without a Dock icon, app menu, Cmd-Tab entry or menu bar icon
/// (`runtimes::hidden_client`). Never for the game or the sign-in window,
/// which has to show its QR code. Steam for Mac has its own entry,
/// `steam_mac_client`.
pub(crate) fn hidden_steam_command(wine: &Path, prefix: &Path) -> Command {
    let mut command = steam_runtime_command(wine, prefix);
    runtimes::hidden_client::apply(&mut command);
    command
}

fn steam_wine_root() -> PathBuf {
    session_dir(&app_data_dir()).join("wine-11.21")
}

pub(crate) fn steam_wine_binary() -> Option<PathBuf> {
    find_wine_binary(&steam_wine_root())
}

pub(crate) fn prepare_login_runtime() -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let steam = require_windows_steam()?;
    let wine = ensure_steam_wine()?;
    let prefix = prepare_steam_prefix(&wine)?;
    Ok((wine, prefix, steam))
}

fn ensure_steam_wine() -> Result<PathBuf, String> {
    if let Some(binary) = steam_wine_binary() {
        return Ok(binary);
    }
    let root = steam_wine_root();
    fs::create_dir_all(&root).map_err(|err| err.to_string())?;
    let archive = root.join("wine-devel-11.21-osx64.tar.xz");
    download_verified(
        &archive,
        STEAM_WINE_URL,
        STEAM_WINE_SHA256,
        STEAM_WINE_LIMIT,
    )?;
    let status = Command::new("tar")
        .args(["-xJf"])
        .arg(&archive)
        .arg("-C")
        .arg(&root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|_| "Could not unpack the Steam compatibility runtime".to_string())?;
    let _ = fs::remove_file(&archive);
    if !status.success() {
        return Err("Could not unpack the Steam compatibility runtime".into());
    }
    find_wine_binary(&root)
        .ok_or_else(|| "The Steam compatibility runtime did not contain wine".into())
}

pub(crate) fn prepare_client_sign_in() -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let wine = ensure_steam_wine()?;
    let prefix = prepare_steam_prefix(&wine)?;
    // The sign-in prefix only needs Valve's client long enough to save the
    // account. Play kills that Wine process and reuses the saved files.
    crate::services::steam_native::client_provision::provision_container(
        &crate::runtimes::root(),
        &prefix,
    )?;
    let steam = steam_exe_in(&prefix);
    if !steam.is_file() {
        return Err("Steam's sign-in window is not ready".into());
    }
    Ok((wine, prefix, steam))
}

fn require_windows_steam() -> Result<PathBuf, String> {
    let exe = steam_exe_in(&steam_prefix());
    if !exe.is_file() {
        return Err("Steam's sign-in window is not ready".into());
    }
    Ok(exe)
}

fn wine_steam_root_in(prefix: &Path) -> PathBuf {
    prefix.join("drive_c/Program Files (x86)/Steam")
}

pub(crate) fn steam_exe_in(prefix: &Path) -> PathBuf {
    wine_steam_root_in(prefix).join("steam.exe")
}

fn steam_webhelper_in(prefix: &Path) -> Option<PathBuf> {
    crate::services::steam_browser::helper_exe(&wine_steam_root_in(prefix))
}

fn steam_client_ready(prefix: &Path) -> bool {
    steam_exe_in(prefix).is_file() && steam_webhelper_in(prefix).is_some()
}

fn prefix_has_steam(prefix: &Path) -> bool {
    steam_exe_in(prefix).is_file()
        || wine_steam_root_in(prefix)
            .join("config/loginusers.vdf")
            .is_file()
}

fn steam_already_installed(prefix: &Path) -> bool {
    steam_exe_in(prefix).is_file()
}

fn should_reset_prefix(prefix: &Path) -> bool {
    prefix.exists() && !prefix_ready(prefix) && !prefix_has_steam(prefix)
}

fn wait_for_file(path: &Path, timeout: Duration, poll: Duration) -> bool {
    wait_for_file_until(path, timeout, poll, sign_in_cancelled)
}

fn wait_for_file_until(
    path: &Path,
    timeout: Duration,
    poll: Duration,
    cancelled: impl Fn() -> bool,
) -> bool {
    let started = Instant::now();
    loop {
        if cancelled() {
            return false;
        }
        if path.is_file() {
            return true;
        }
        let elapsed = started.elapsed();
        if elapsed >= timeout {
            return path.is_file();
        }
        std::thread::sleep(poll.min(timeout - elapsed));
    }
}

fn wait_for_steam_browser(app: &AppHandle, prefix: &Path, timeout: Duration) -> bool {
    let started = Instant::now();
    let poll = Duration::from_millis(500);
    loop {
        if steam_client_ready(prefix) || sign_in_cancelled() {
            return steam_client_ready(prefix);
        }
        emit_steam_setup(
            app,
            json!({
                "phase": "Downloading",
                "component": STEAM_SETUP_LABEL,
                "downloadedBytes": steam_package_bytes(prefix),
                "totalBytes": 0
            }),
            false,
            None,
        );
        let elapsed = started.elapsed();
        if elapsed >= timeout {
            return steam_client_ready(prefix);
        }
        std::thread::sleep(poll.min(timeout - elapsed));
    }
}

fn steam_package_bytes(prefix: &Path) -> u64 {
    let dir = wine_steam_root_in(prefix).join("package");
    let Ok(entries) = fs::read_dir(&dir) else {
        return 0;
    };
    entries
        .flatten()
        .filter_map(|entry| entry.metadata().ok())
        .filter(|meta| meta.is_file())
        .map(|meta| meta.len())
        .sum()
}

pub(crate) fn shutdown_argv(steam_exe: &Path) -> Vec<String> {
    vec![steam_exe.to_string_lossy().into_owned(), "-shutdown".into()]
}

/// Ask the official client to exit so it can write ConnectCache / ssfn before
/// wineserver is killed.
pub(crate) fn request_steam_shutdown(wine: &Path, prefix: &Path) {
    let steam = steam_exe();
    if !steam.is_file() || !wine.is_file() || !prefix.is_dir() {
        return;
    }
    // `steam.exe -shutdown` starts Steam when none is running, and Orbit's quit
    // then left that client behind.
    if !super::container_steam::client_running(prefix) {
        return;
    }
    let mut command = hidden_steam_command(wine, prefix);
    command.args(shutdown_argv(&steam));
    if let Some(dir) = steam.parent() {
        command.current_dir(dir);
    }
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let cancel = AtomicBool::new(false);
    if let Ok(mut child) = command.spawn() {
        let _ = crate::runtimes::process::wait_bounded(&mut child, Duration::from_secs(8), &cancel);
    }
}

pub(crate) fn wait_for_saved_session(steam_root: &Path, timeout: Duration) {
    let deadline = Instant::now() + timeout;
    loop {
        if steam_account::saved_client_session(steam_root) {
            return;
        }
        if Instant::now() >= deadline {
            return;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

pub(crate) fn stop_steam_prefix() {
    if let Some(wine) = steam_wine_binary() {
        stop_steam_runtime(&wine, &steam_prefix());
    }
}

pub(crate) fn stop_steam_runtime(wine: &Path, prefix: &Path) {
    stop_steam_wineserver(wine, prefix);
    reap_prefix_processes(prefix);
}

fn resolve_wineserver(wine: &Path) -> Option<PathBuf> {
    let parent = wine.parent()?;
    let beside = parent.join("wineserver");
    if beside.is_file() {
        return Some(beside);
    }
    let bundled = parent.parent()?.join("bin/wineserver");
    bundled.is_file().then_some(bundled)
}

fn stop_steam_wineserver(wine: &Path, prefix: &Path) {
    let Some(server) = resolve_wineserver(wine) else {
        return;
    };
    if !prefix.is_dir() {
        return;
    }
    let cancel = AtomicBool::new(false);
    if let Ok(mut kill) = steam_runtime_command(&server, prefix)
        .arg("-k")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        let _ = crate::runtimes::process::wait_bounded(&mut kill, Duration::from_secs(5), &cancel);
    }
    if let Ok(mut waiter) = steam_runtime_command(&server, prefix)
        .arg("-w")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        let _ =
            crate::runtimes::process::wait_bounded(&mut waiter, Duration::from_secs(8), &cancel);
    }
}

fn live_client_running() -> bool {
    prefix_has_steam_exe(&process_listing(), &steam_prefix())
        || CLIENT_RUNNING.load(Ordering::Relaxed)
}

fn live_client_logged_on() -> bool {
    prefix_client_logged_on(&process_listing(), &steam_prefix(), &read_connection_log())
}

fn prefix_client_logged_on(listing: &str, prefix: &Path, connection: &str) -> bool {
    prefix_has_steam_exe(listing, prefix) && steam_account::connection_logged_on(connection)
}

fn prefix_has_steam_exe(listing: &str, prefix: &Path) -> bool {
    let needle = prefix.to_string_lossy();
    !needle.is_empty()
        && listing.lines().any(|line| {
            line.contains(needle.as_ref()) && line.to_ascii_lowercase().contains("steam.exe")
        })
}

fn process_listing() -> String {
    let Ok(output) = Command::new("ps")
        .args(["axww", "-o", "pid=,command="])
        .output()
    else {
        return String::new();
    };
    if output.stdout.len() > 8 * 1024 * 1024 {
        return String::new();
    }
    String::from_utf8_lossy(&output.stdout).into_owned()
}

fn read_connection_log() -> String {
    const LIMIT: u64 = 256 * 1024;
    let path = wine_steam_root().join("logs/connection_log.txt");
    let Ok(metadata) = fs::metadata(&path) else {
        return String::new();
    };
    let Ok(mut file) = fs::File::open(&path) else {
        return String::new();
    };
    if metadata.len() > LIMIT && file.seek(SeekFrom::Start(metadata.len() - LIMIT)).is_err() {
        return String::new();
    }
    let mut content = String::new();
    if file.take(LIMIT).read_to_string(&mut content).is_err() {
        return String::new();
    }
    content
}

fn cwd_process_ids(listing: &str, prefix: &Path) -> Vec<u32> {
    let needle = prefix.to_string_lossy();
    if needle.is_empty() {
        return Vec::new();
    }
    let inside = format!("{needle}/");
    let self_pid = std::process::id();
    let mut pid = None;
    let mut ids = Vec::new();
    for line in listing.lines().take(20_000) {
        if let Some(rest) = line.strip_prefix('p') {
            pid = rest.parse().ok();
            continue;
        }
        let Some(cwd) = line.strip_prefix('c') else {
            continue;
        };
        let Some(pid) = pid else {
            continue;
        };
        if pid > 1 && pid != self_pid && (cwd == needle.as_ref() || cwd.starts_with(&inside)) {
            ids.push(pid);
            if ids.len() == 32 {
                break;
            }
        }
    }
    ids
}

fn prefix_process_ids(listing: &str, prefix: &Path) -> Vec<u32> {
    let needle = prefix.to_string_lossy();
    if needle.is_empty() {
        return Vec::new();
    }
    let self_pid = std::process::id();
    listing
        .lines()
        .filter(|line| line.contains(needle.as_ref()))
        .filter_map(|line| line.split_whitespace().next()?.parse::<u32>().ok())
        .filter(|pid| *pid > 1 && *pid != self_pid)
        .take(32)
        .collect()
}

fn reap_prefix_processes(prefix: &Path) {
    let Ok(output) = Command::new("ps")
        .args(["axww", "-o", "pid=,command="])
        .output()
    else {
        return;
    };
    if output.stdout.len() > 8 * 1024 * 1024 {
        return;
    }
    let listing = String::from_utf8_lossy(&output.stdout);
    let mut pids = prefix_process_ids(&listing, prefix);
    if let Ok(cwd) = Command::new("lsof")
        .args(["-nP", "-F", "pc", "-d", "cwd"])
        .output()
    {
        if cwd.stdout.len() <= 8 * 1024 * 1024 {
            let cwd_listing = String::from_utf8_lossy(&cwd.stdout);
            for pid in cwd_process_ids(&cwd_listing, prefix) {
                if !pids.contains(&pid) && pids.len() < 32 {
                    pids.push(pid);
                }
            }
        }
    }
    for pid in pids {
        let _ = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .status();
    }
}

fn emit_steam_setup(app: &AppHandle, progress: serde_json::Value, done: bool, error: Option<&str>) {
    let mut payload = json!({
        "key": STEAM_SETUP_KEY,
        "label": STEAM_SETUP_LABEL,
        "done": done,
        "progress": progress,
    });
    if let Some(error) = error {
        payload["error"] = json!(error);
    }
    let _ = app.emit("steam-download-progress", payload);
}

fn prepare_steam_prefix(wine: &Path) -> Result<PathBuf, String> {
    let prefix = steam_prefix();
    if prefix_has_steam(&prefix) {
        return Ok(prefix);
    }
    if should_reset_prefix(&prefix) {
        stop_steam_wineserver(wine, &prefix);
        fs::remove_dir_all(&prefix).map_err(|err| err.to_string())?;
    }
    if prefix_ready(&prefix) {
        return Ok(prefix);
    }
    fs::create_dir_all(&prefix).map_err(|err| err.to_string())?;
    let output = steam_runtime_command(wine, &prefix)
        .arg("wineboot")
        .arg("-i")
        .stdin(Stdio::null())
        .output()
        .map_err(|_| "The Steam compatibility environment could not be created".to_string())?;
    if let Some(server) = wine.parent().map(|bin| bin.join("wineserver")) {
        if server.is_file() {
            if let Ok(mut waiter) = steam_runtime_command(&server, &prefix)
                .arg("-w")
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
            {
                let _ = crate::runtimes::process::wait_bounded(
                    &mut waiter,
                    Duration::from_secs(8),
                    &AtomicBool::new(false),
                );
            }
        }
    }
    if !output.status.success() || !prefix_ready(&prefix) {
        let detail = String::from_utf8_lossy(&output.stderr);
        let detail = detail.trim();
        if !prefix_has_steam(&prefix) {
            stop_steam_wineserver(wine, &prefix);
            let _ = fs::remove_dir_all(&prefix);
        }
        return Err(if detail.is_empty() {
            "The Steam compatibility environment could not be created".into()
        } else {
            format!("The Steam compatibility environment could not be created: {detail}")
        });
    }
    Ok(prefix)
}

fn download_verified(dest: &Path, url: &str, sha256: &str, limit: u64) -> Result<(), String> {
    use sha2::{Digest, Sha256};
    let client = reqwest::blocking::Client::builder()
        .user_agent("Orbit")
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|err| err.to_string())?;
    let mut response = client.get(url).send().map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Could not download the Steam runtime (HTTP {})",
            response.status()
        ));
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let mut file = fs::File::create(dest).map_err(|err| err.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    let mut total = 0u64;
    loop {
        let read = response.read(&mut buffer).map_err(|err| err.to_string())?;
        if read == 0 {
            break;
        }
        total += read as u64;
        if total > limit {
            return Err("The Steam runtime download is larger than expected".into());
        }
        hasher.update(&buffer[..read]);
        file.write_all(&buffer[..read])
            .map_err(|err| err.to_string())?;
    }
    let digest = hex_encode(hasher.finalize().as_slice());
    if !digest.eq_ignore_ascii_case(sha256) {
        let _ = fs::remove_file(dest);
        return Err("The Steam runtime download did not match its checksum".into());
    }
    Ok(())
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

fn prefix_ready(prefix: &Path) -> bool {
    prefix.join("system.reg").is_file()
        && prefix
            .join("drive_c/windows/system32/kernel32.dll")
            .exists()
}

fn find_wine_binary(root: &Path) -> Option<PathBuf> {
    let mut seen = 0usize;
    for entry in walkdir::WalkDir::new(root)
        .max_depth(8)
        .into_iter()
        .filter_map(Result::ok)
    {
        seen += 1;
        if seen > 800 {
            break;
        }
        if !entry.file_type().is_file() {
            continue;
        }
        if entry.file_name() != "wine" {
            continue;
        }
        let server = entry.path().parent()?.join("wineserver");
        if server.is_file() {
            return Some(entry.into_path());
        }
    }
    None
}

fn read_support_account() -> Option<crate::utils::steam_account::SteamAccount> {
    let path = steam_support_dir()?.join("config/loginusers.vdf");
    let content = fs::read_to_string(path).ok()?;
    most_recent_account(&content)
}

fn read_owned_ids(support: &Path, steam_id: &str) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    if let Some(account_id) = userdata_account_id(steam_id) {
        files.push(
            support
                .join("userdata")
                .join(account_id)
                .join("config/localconfig.vdf"),
        );
    }
    if let Ok(entries) = fs::read_dir(support.join("userdata")) {
        for entry in entries.flatten().take(4) {
            files.push(entry.path().join("config/localconfig.vdf"));
        }
    }
    for path in files {
        let Ok(metadata) = fs::metadata(&path) else {
            continue;
        };
        if metadata.len() > 8 * 1024 * 1024 {
            continue;
        }
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let ids = crate::utils::steam_account::local_library_ids(&content);
        if !ids.is_empty() {
            return Ok(ids);
        }
    }
    Ok(Vec::new())
}

fn download_steam_setup(setup: &Path) -> Result<(), String> {
    const URL: &str = "https://cdn.akamai.steamstatic.com/client/installer/SteamSetup.exe";
    let client = reqwest::blocking::Client::builder()
        .user_agent("Orbit")
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|err| err.to_string())?;
    let mut response = client.get(URL).send().map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Could not download Steam for Windows (HTTP {})",
            response.status()
        ));
    }
    if let Some(parent) = setup.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let mut file = fs::File::create(setup).map_err(|err| err.to_string())?;
    let mut buffer = [0u8; 64 * 1024];
    let mut total = 0u64;
    loop {
        let read = response.read(&mut buffer).map_err(|err| err.to_string())?;
        if read == 0 {
            break;
        }
        total += read as u64;
        if total > 30_000_000 {
            return Err("Steam's Windows installer is larger than expected".into());
        }
        file.write_all(&buffer[..read])
            .map_err(|err| err.to_string())?;
    }
    let mut header = [0u8; 2];
    fs::File::open(setup)
        .and_then(|mut stored| stored.read_exact(&mut header))
        .map_err(|_| "Steam's Windows installer was empty".to_string())?;
    if header != [0x4d, 0x5a] {
        return Err("Steam's Windows installer was not a Windows program".into());
    }
    Ok(())
}

fn remove_session_dir(data_dir: &Path) -> Result<(), String> {
    let session = session_dir(data_dir);
    if !session.exists() {
        return Ok(());
    }
    let parent = data_dir.canonicalize().map_err(|err| err.to_string())?;
    let target = session.canonicalize().map_err(|err| err.to_string())?;
    if target.parent() != Some(parent.as_path()) {
        return Err("Refusing to delete a Steam folder outside Orbit's data".into());
    }
    fs::remove_dir_all(&target).map_err(|err| err.to_string())
}

fn ensure_steamcmd(session: &Path) -> Result<PathBuf, String> {
    let binary = session.join("steamcmd").join("steamcmd.sh");
    if binary.is_file() {
        return Ok(binary);
    }
    let directory = session.join("steamcmd");
    fs::create_dir_all(&directory).map_err(|err| err.to_string())?;
    let archive = directory.join("steamcmd_osx.tar.gz");
    download_official_steamcmd(&archive)?;
    let status = Command::new("tar")
        .args(["-xzf"])
        .arg(&archive)
        .arg("-C")
        .arg(&directory)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|_| "Could not unpack SteamCMD".to_string())?;
    let _ = fs::remove_file(&archive);
    if !status.success() || !binary.is_file() {
        return Err("Valve's SteamCMD archive did not contain steamcmd.sh".into());
    }
    Ok(binary)
}

fn download_official_steamcmd(archive: &Path) -> Result<(), String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent("Orbit")
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|err| err.to_string())?;
    let mut response = client
        .get(STEAMCMD_URL)
        .send()
        .map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Could not download SteamCMD (HTTP {})",
            response.status()
        ));
    }
    let mut file = fs::File::create(archive).map_err(|err| err.to_string())?;
    let mut buffer = [0u8; 64 * 1024];
    let mut total = 0u64;
    loop {
        let read = response.read(&mut buffer).map_err(|err| err.to_string())?;
        if read == 0 {
            break;
        }
        total += read as u64;
        if total > STEAMCMD_LIMIT {
            return Err("SteamCMD download is larger than expected".into());
        }
        file.write_all(&buffer[..read])
            .map_err(|err| err.to_string())?;
    }
    let mut header = [0u8; 2];
    let mut stored = fs::File::open(archive).map_err(|err| err.to_string())?;
    stored
        .read_exact(&mut header)
        .map_err(|_| "SteamCMD download was empty".to_string())?;
    if header != [0x1f, 0x8b] {
        return Err("SteamCMD download was not a gzip archive".into());
    }
    Ok(())
}

fn run_steamcmd(
    app: &AppHandle,
    binary: &Path,
    args: &[String],
    key: &str,
    label: &str,
) -> Result<DownloadOutcome, String> {
    let mut child = steamcmd_command(binary)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "SteamCMD could not start".to_string())?;
    let mut stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => {
            let _ = child.kill();
            return Err("SteamCMD did not report progress".into());
        }
    };
    *DOWNLOAD_CHILD.lock() = Some(child);
    // A stop requested while SteamCMD was starting has no child to kill yet.
    if stop_outcome().is_some() {
        kill_download_child();
    }
    let mut last_emit = Instant::now()
        .checked_sub(Duration::from_secs(1))
        .unwrap_or_else(Instant::now);
    let mut last_percent = -1i64;
    let mut last_stage = None;
    let mut secret = false;
    while let Some(line) = next_output_line(&mut stdout) {
        if asks_for_secret(&line) {
            secret = true;
            kill_download_child();
            break;
        }
        let Some(progress) = parse_progress_line(&line) else {
            continue;
        };
        let percent =
            (progress.downloaded_bytes.saturating_mul(100) / progress.total_bytes.max(1)) as i64;
        if Some(progress.stage) == last_stage
            && percent == last_percent
            && last_emit.elapsed() < Duration::from_millis(250)
        {
            continue;
        }
        if progress.stage == DownloadStage::Downloading {
            LAST_TOTAL.fetch_max(progress.total_bytes, Ordering::SeqCst);
        }
        last_stage = Some(progress.stage);
        last_percent = percent;
        last_emit = Instant::now();
        let phase = match progress.stage {
            DownloadStage::Downloading => "Downloading",
            DownloadStage::Verifying => "Verifying",
            DownloadStage::Preallocating => "Installing",
        };
        let mut payload = json!({
            "phase": phase,
            "component": label,
            "downloadedBytes": progress.downloaded_bytes,
            "totalBytes": progress.total_bytes,
        });
        if progress.stage == DownloadStage::Preallocating {
            payload["message"] = json!("Allocating disk space");
        }
        emit_game_progress(app, key, label, payload);
    }
    let status = DOWNLOAD_CHILD
        .lock()
        .take()
        .and_then(|mut child| child.wait().ok());
    if secret {
        return Err("Sign in once with Steam, then try the download again.".into());
    }
    if let Some(outcome) = stop_outcome() {
        return Ok(outcome);
    }
    if !status.is_some_and(|status| status.success()) {
        return Err("SteamCMD did not finish the download".into());
    }
    let _ = app.emit(
        "steam-download-progress",
        json!({
            "key": key,
            "label": label,
            "done": true,
            "progress": { "phase": "Ready", "component": label, "message": "Installed" }
        }),
    );
    Ok(DownloadOutcome::Completed)
}

fn steamcmd_command(binary: &Path) -> Command {
    let mut command = Command::new(binary);
    command.env_clear();
    for key in ["PATH", "HOME", "USER", "TMPDIR", "LANG", "LOGNAME"] {
        if let Some(value) = std::env::var_os(key) {
            command.env(key, value);
        }
    }
    command
}

fn next_output_line(reader: &mut impl Read) -> Option<String> {
    let mut line = Vec::new();
    let mut byte = [0u8; 1];
    loop {
        let read = reader.read(&mut byte).ok()?;
        if read == 0 {
            return (!line.is_empty()).then(|| String::from_utf8_lossy(&line).into_owned());
        }
        if byte[0] == b'\n' || byte[0] == b'\r' {
            if !line.is_empty() {
                return Some(String::from_utf8_lossy(&line).into_owned());
            }
            continue;
        }
        if line.len() < 2_048 {
            line.push(byte[0]);
        }
    }
}

fn wine_executable(repo: &GameRepository) -> Option<PathBuf> {
    let actives = runtimes::selections::load(repo).ok()?;
    let path = PathBuf::from(runtimes::selections::active_wine_path(
        &runtimes::root(),
        &actives,
    )?);
    if path
        .file_name()
        .is_some_and(|name| name == "wine" || name == "wine64")
    {
        return Some(path);
    }
    let mut seen = 0usize;
    for entry in walkdir::WalkDir::new(&path)
        .max_depth(8)
        .into_iter()
        .filter_map(Result::ok)
    {
        seen += 1;
        if seen > 500 {
            break;
        }
        if !entry.file_type().is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy();
        if name != "wine" && name != "wine64" {
            continue;
        }
        let sibling = entry.path().parent()?.join("wineserver");
        if sibling.is_file() {
            return Some(entry.into_path());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn helper_steams_never_see_controllers() {
        // Regression: the library-sync Steam's Steam Input took the
        // controller and its Guide button opened Big Picture.
        let sync = PathBuf::from("/Orbit/runtimes/containers/steam-sync/prefix");
        let game = PathBuf::from("/Orbit/runtimes/containers/games/steam-1/prefix");
        assert!(is_helper_prefix(&sync, std::slice::from_ref(&sync)));
        assert!(!is_helper_prefix(&game, &[sync]));
        let env = |command: &Command, key: &str| {
            command
                .get_envs()
                .find(|(name, _)| *name == key)
                .and_then(|(_, value)| value.map(|value| value.to_string_lossy().into_owned()))
        };
        let wine = Path::new("/opt/wine/bin/wine");
        let helper = steam_runtime_command(wine, &helper_prefixes()[1]);
        assert_eq!(
            env(&helper, "WINEDLLOVERRIDES").as_deref(),
            Some(runtimes::controllers::NO_CONTROLLERS_DLL)
        );
        assert_eq!(env(&helper, runtimes::controllers::CONFIG_VAR), None);
        let player = steam_runtime_command(wine, &game);
        assert_eq!(env(&player, "WINEDLLOVERRIDES"), None);
        assert!(env(&player, runtimes::controllers::CONFIG_VAR).is_some());
    }

    #[test]
    fn a_saved_session_restores_a_missing_account() {
        let name = || Some("orbit_user".to_string());
        assert_eq!(account_to_restore(None, true, name()), name());
        assert_eq!(account_to_restore(name(), true, Some("other".into())), None);
        assert_eq!(account_to_restore(None, false, name()), None);
        assert_eq!(account_to_restore(None, true, None), None);
    }

    #[test]
    #[ignore = "fetches the real owned library with the saved web session"]
    fn live_owned_games_come_from_the_web_session() {
        let support = steam_support_dir().unwrap();
        let account = read_support_account().unwrap();
        let local = read_owned_ids(&support, &account.steam_id).unwrap();
        let wine = steam_wine_binary().unwrap();
        let token =
            super::super::steam_session::web_token(&wine, &steam_prefix(), &account.steam_id);
        eprintln!("local ids {} web token {}", local.len(), token.is_ok());
        let owned = super::super::steam_qr::fetch_owned_games(token.unwrap().expose()).unwrap();
        eprintln!("owned games {}", owned.len());
    }

    #[test]
    #[ignore = "refreshes the real owned library"]
    fn live_refresh_saves_the_whole_owned_library() {
        let repo = GameRepository::open(&crate::utils::paths::database_path()).unwrap();
        eprintln!("before {}", stored_entries(&repo).unwrap().len());
        let signed_in = status(&repo).unwrap().signed_in;
        refresh_owned_ids(&repo).unwrap();
        let entries = stored_entries(&repo).unwrap();
        let paths = preferences(&repo).unwrap().additional_library_paths;
        let installed = installed_app_ids(&entries, &paths);
        eprintln!(
            "signed in {signed_in}, owned {}, installed {:?}",
            entries.len(),
            installed
        );
        assert!(signed_in && entries.len() > 3);
        assert!(installed.contains("1593500"), "God of War is on disk");
        let scanned = crate::importers::steam_windows::SteamWindowsImporter::new()
            .with_library_paths(paths)
            .with_owned(
                entries
                    .into_iter()
                    .map(|entry| (entry.app_id, entry.title))
                    .collect(),
                wine_steam_root(),
            )
            .imported_games()
            .unwrap();
        let titles: Vec<_> = scanned.iter().map(|game| game.title.as_str()).collect();
        eprintln!("scan imports {titles:?}");
        assert!(titles.contains(&"God of War"));
    }

    #[test]
    #[ignore = "reads the real Settings sign-in and runs Wine"]
    fn live_settings_sign_in_becomes_a_container_session() {
        assert!(capture_client_session().unwrap());
        let saved = crate::services::steam_native::session::agent_credentials(&session_dir(
            &app_data_dir(),
        ))
        .unwrap();
        assert!(orbit_steam::is_client_token(
            &saved.refresh_token,
            &saved.steam_id
        ));
    }

    #[test]
    #[ignore = "logs a real game container on with the saved Settings sign-in"]
    fn live_container_logs_on_with_the_settings_sign_in() {
        let app_id = std::env::var("ORBIT_LIVE_APP_ID").unwrap_or_else(|_| "883710".into());
        let host = crate::services::container_steam::SteamHost {
            wine: steam_wine_binary().unwrap(),
            prefix: runtimes::root().join(format!("containers/games/steam-{app_id}/prefix")),
        };
        let result = crate::services::container_steam::ensure_running(
            &host,
            &app_id,
            crate::services::steam_play_config::PlayConfig {
                steam_input: true,
                overlay: false,
            },
            &AtomicBool::new(false),
            crate::services::container_steam::ClientWait::Startup,
        );
        crate::services::container_steam::shutdown(&host);
        result.unwrap();
    }

    #[test]
    fn steam_input_and_the_overlay_default_off_and_a_saved_choice_is_kept() {
        let older: SteamWindowsPreferences = serde_json::from_value(serde_json::json!({
            "offlineMode": true,
            "verifyFiles": true,
            "additionalLibraryPaths": ["/Games/steamapps/common"]
        }))
        .unwrap();
        // Regression: Steam Input on by default stuttered controller play in
        // Wine containers while keyboard and mouse played smoothly.
        assert!(!older.steam_input);
        assert!(!older.steam_overlay);
        let defaults = SteamWindowsPreferences::default();
        assert!(!defaults.steam_input && !defaults.steam_overlay);
        let chosen: SteamWindowsPreferences = serde_json::from_value(serde_json::json!({
            "offlineMode": false,
            "verifyFiles": true,
            "steamInput": true
        }))
        .unwrap();
        assert!(chosen.steam_input, "a game that needs Steam Input keeps it");
    }

    #[test]
    fn offline_mode_persists_without_a_password() {
        let path = std::env::temp_dir().join(format!("orbit-steam-prefs-{}", uuid::Uuid::new_v4()));
        let repo = crate::database::GameRepository::open(&path).unwrap();
        assert!(!preferences(&repo).unwrap().offline_mode);
        let saved = set_preferences(
            &repo,
            SteamWindowsPreferences {
                offline_mode: true,
                verify_files: false,
                additional_library_paths: Vec::new(),
                ..SteamWindowsPreferences::default()
            },
        )
        .unwrap();
        assert!(saved.offline_mode);
        assert!(!saved.verify_files);
        let again = preferences(&repo).unwrap();
        assert!(again.offline_mode);
        assert!(!again.verify_files);
        // Settings saved while the GameHub play engine existed keep every
        // other preference, and the retired key is dropped on the next save.
        repo.set_setting(
            PREFERENCES_KEY,
            &serde_json::json!({
                "offlineMode": true,
                "verifyFiles": false,
                "playEngine": "gamehub"
            }),
        )
        .unwrap();
        let legacy = preferences(&repo).unwrap();
        assert!(legacy.offline_mode);
        assert!(!legacy.verify_files);
        set_preferences(&repo, legacy).unwrap();
        let rewritten = repo.get_setting(PREFERENCES_KEY).unwrap().unwrap();
        assert!(rewritten.get("playEngine").is_none());
        let stored = repo
            .get_setting(PREFERENCES_KEY)
            .unwrap()
            .unwrap()
            .to_string();
        assert!(!stored.to_ascii_lowercase().contains("password"));
        drop(repo);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn a_prefix_without_kernel32_is_not_ready() {
        let root =
            std::env::temp_dir().join(format!("orbit-prefix-ready-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("drive_c/windows/system32")).unwrap();
        fs::write(root.join("system.reg"), b"reg").unwrap();
        assert!(!prefix_ready(&root));
        fs::write(root.join("drive_c/windows/system32/kernel32.dll"), b"dll").unwrap();
        assert!(prefix_ready(&root));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_prefix_with_steam_is_kept_even_without_kernel32() {
        let root = std::env::temp_dir().join(format!("orbit-keep-steam-{}", uuid::Uuid::new_v4()));
        let steam = wine_steam_root_in(&root);
        fs::create_dir_all(&steam).unwrap();
        fs::write(steam.join("steam.exe"), b"MZ").unwrap();
        assert!(prefix_has_steam(&root));
        assert!(!should_reset_prefix(&root));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_prefix_with_a_saved_login_is_kept() {
        let root = std::env::temp_dir().join(format!("orbit-keep-login-{}", uuid::Uuid::new_v4()));
        let config = wine_steam_root_in(&root).join("config");
        fs::create_dir_all(&config).unwrap();
        fs::write(config.join("loginusers.vdf"), b"\"users\"\n{\n}\n").unwrap();
        assert!(prefix_has_steam(&root));
        assert!(!should_reset_prefix(&root));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn an_incomplete_prefix_without_steam_can_be_reset() {
        let root =
            std::env::temp_dir().join(format!("orbit-reset-prefix-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("drive_c")).unwrap();
        fs::write(root.join("user.reg"), b"reg").unwrap();
        assert!(!prefix_has_steam(&root));
        assert!(should_reset_prefix(&root));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn shutdown_asks_official_steam_to_exit() {
        let argv = shutdown_argv(Path::new("/Steam/steam.exe"));
        assert_eq!(argv[0], "/Steam/steam.exe");
        assert_eq!(argv[1], "-shutdown");
        assert!(!argv.iter().any(|arg| arg.contains("password")));
        assert!(!argv.iter().any(|arg| arg.contains("SteamAgent")));
    }

    #[test]
    fn client_is_logged_in_only_while_steam_exe_is_logged_on() {
        let prefix = Path::new("/tmp/orbit-steam-prefix");
        let running = "\
  84643 WINEPREFIX=/tmp/orbit-steam-prefix steam.exe -silent
";
        let logged =
            "[Logged On, 4, 7] [U:1:280673132] RecvMsgClientLogOnResponse() : processing complete\n";
        let connecting = "[Connecting, 0, 7] [U:1:0] Connect() starting connection\n";
        assert!(prefix_client_logged_on(running, prefix, logged));
        assert!(!prefix_client_logged_on(running, prefix, connecting));
        assert!(!prefix_client_logged_on(
            running,
            prefix,
            "[2026-11-15 21:31:57] [Logged Off, 0, 0] [U:1:280673132] scheduling LogOn()\n"
        ));
        assert!(!prefix_client_logged_on(
            "99 /Applications/Steam.app/Contents/MacOS/steam\n",
            prefix,
            logged
        ));
        assert!(!prefix_has_steam_exe("", prefix));
    }

    #[test]
    fn prefix_process_ids_ignore_native_steam_and_pid_one() {
        let prefix = Path::new("/tmp/orbit-steam-prefix");
        let listing = "\
    1 /sbin/launchd
  84643 WINEPREFIX=/tmp/orbit-steam-prefix steam.exe -silent
    99 /Applications/Steam.app/Contents/MacOS/steam
  92297 WINEPREFIX=/tmp/orbit-steam-prefix steamwebhelper.exe steamid=0
";
        assert_eq!(prefix_process_ids(listing, prefix), vec![84643, 92297]);
        assert!(prefix_process_ids(listing, Path::new("/missing")).is_empty());
    }

    #[test]
    fn cwd_listing_reaps_wine_whose_command_line_omits_the_prefix() {
        let prefix = Path::new("/tmp/orbit-steam-prefix");
        let listing = "\
p1
c/
p92825
c/tmp/orbit-steam-prefix/drive_c/windows/system32
p99
c/Applications/Steam.app
p92826
c/tmp/orbit-steam-prefix-other
";
        assert_eq!(cwd_process_ids(listing, prefix), vec![92825]);
    }

    #[test]
    fn steam_is_already_installed_when_steam_exe_exists() {
        let root = std::env::temp_dir().join(format!("orbit-steam-ready-{}", uuid::Uuid::new_v4()));
        let steam = wine_steam_root_in(&root);
        fs::create_dir_all(&steam).unwrap();
        assert!(!steam_already_installed(&root));
        fs::write(steam.join("steam.exe"), b"MZ").unwrap();
        assert!(steam_already_installed(&root));
        assert!(!steam_client_ready(&root));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn steam_is_not_ready_to_sign_in_until_the_browser_exists() {
        let root = std::env::temp_dir().join(format!("orbit-steam-cef-{}", uuid::Uuid::new_v4()));
        let helper = wine_steam_root_in(&root).join("bin/cef/cef.win64/steamwebhelper.exe");
        fs::create_dir_all(helper.parent().unwrap()).unwrap();
        fs::write(steam_exe_in(&root), b"MZ").unwrap();
        assert!(steam_already_installed(&root));
        assert!(!steam_client_ready(&root));
        fs::write(&helper, b"MZcef").unwrap();
        assert!(steam_client_ready(&root));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn win7_browser_helper_counts_as_ready() {
        let root = std::env::temp_dir().join(format!("orbit-steam-win7-{}", uuid::Uuid::new_v4()));
        let helper = wine_steam_root_in(&root).join("bin/cef/cef.win7x64/steamwebhelper.exe");
        fs::create_dir_all(helper.parent().unwrap()).unwrap();
        fs::write(steam_exe_in(&root), b"MZ").unwrap();
        assert!(!steam_client_ready(&root));
        fs::write(&helper, b"MZcef").unwrap();
        assert!(steam_client_ready(&root));
        assert_eq!(steam_webhelper_in(&root).as_deref(), Some(helper.as_path()));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn wait_for_file_finds_steam_once_it_exists() {
        let path = std::env::temp_dir().join(format!("orbit-wait-{}.exe", uuid::Uuid::new_v4()));
        let _ = fs::remove_file(&path);
        assert!(!wait_for_file(
            &path,
            Duration::from_millis(20),
            Duration::from_millis(5)
        ));
        fs::write(&path, b"MZ").unwrap();
        assert!(wait_for_file(
            &path,
            Duration::from_millis(20),
            Duration::from_millis(5)
        ));
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn sign_out_deletes_only_the_orbit_steam_folder() {
        let root =
            std::env::temp_dir().join(format!("orbit-steam-session-{}", uuid::Uuid::new_v4()));
        let session = session_dir(&root);
        let sibling = root.join("artwork-cache");
        fs::create_dir_all(session.join("games")).unwrap();
        fs::write(session.join("games").join("note"), b"session").unwrap();
        fs::create_dir_all(&sibling).unwrap();
        fs::write(sibling.join("keep"), b"keep").unwrap();
        remove_session_dir(&root).unwrap();
        assert!(!session.exists());
        assert_eq!(fs::read_to_string(sibling.join("keep")).unwrap(), "keep");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn qr_sign_in_saves_the_account_and_owned_ids_without_a_token() {
        let repo = crate::database::GameRepository::open_in_memory().unwrap();
        let saved = complete_qr_sign_in(
            &repo,
            "orbit_player",
            &[
                SteamCatalogEntry {
                    app_id: "570".into(),
                    title: "Dota 2".into(),
                    ..SteamCatalogEntry::default()
                },
                SteamCatalogEntry {
                    app_id: "nope".into(),
                    title: "skip".into(),
                    ..SteamCatalogEntry::default()
                },
                SteamCatalogEntry::from_app_id("730").unwrap(),
            ],
        )
        .unwrap();
        assert!(saved.signed_in);
        assert_eq!(saved.account_name.as_deref(), Some("orbit_player"));
        assert_eq!(saved.owned_count, 2);
        let stored = repo.get_setting(ACCOUNT_KEY).unwrap().unwrap().to_string()
            + &repo.get_setting(LIBRARY_KEY).unwrap().unwrap().to_string();
        assert!(stored.contains("Dota 2"));
        assert!(!stored.to_ascii_lowercase().contains("token"));
        assert!(!stored.to_ascii_lowercase().contains("password"));
    }

    #[test]
    fn library_keeps_saved_titles_and_original_steam_art_urls() {
        let repo = crate::database::GameRepository::open_in_memory().unwrap();
        repo.set_setting(
            LIBRARY_KEY,
            &json!([{
                "appId":"550",
                "title":"Left 4 Dead 2",
                "description":"Co-op horror.",
                "coverUrl":"https://cdn.steamgriddb.com/grid/l4d2.png"
            }]),
        )
        .unwrap();
        let games = library(&repo).unwrap();
        assert_eq!(games[0].title, "Left 4 Dead 2");
        assert_eq!(games[0].description.as_deref(), Some("Co-op horror."));
        assert_eq!(
            games[0].cover_url,
            "https://cdn.steamgriddb.com/grid/l4d2.png"
        );
        assert!(!games[0].title.contains("Steam 550"));
    }

    #[test]
    fn installed_app_ids_include_extra_library_titles_missing_from_the_owned_catalog() {
        let root =
            std::env::temp_dir().join(format!("orbit-extra-library-{}", uuid::Uuid::new_v4()));
        let apps = root.join("steamapps");
        std::fs::create_dir_all(apps.join("common/Watch_Dogs2")).unwrap();
        std::fs::write(apps.join("common/Watch_Dogs2/WatchDogs2.exe"), b"MZ").unwrap();
        std::fs::write(
            apps.join("appmanifest_447040.acf"),
            r#""appid" "447040" "name" "Watch_Dogs 2" "installdir" "Watch_Dogs2""#,
        )
        .unwrap();
        let paths = vec![apps.join("common").to_string_lossy().into_owned()];
        let ids = installed_app_ids(&[], &paths);
        assert!(ids.contains("447040"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn local_vdf_stamp_prefers_active_wine_profile_user() {
        let root = std::env::temp_dir().join(format!("orbit-vdf-stamp-{}", uuid::Uuid::new_v4()));
        for name in ["aaa_other", "crossover"] {
            let dir = root
                .join("drive_c/users")
                .join(name)
                .join("AppData/Local/Steam");
            std::fs::create_dir_all(&dir).unwrap();
            let body = if name == "crossover" {
                "active-user-token"
            } else {
                "old"
            };
            std::fs::write(dir.join("local.vdf"), body).unwrap();
        }
        std::fs::write(
            root.join("user.reg"),
            "\"APPDATA\"=\"C:\\\\users\\\\crossover\\\\AppData\\\\Roaming\"\n",
        )
        .unwrap();
        let (len, _) = local_vdf_stamp(&root).unwrap();
        assert_eq!(len, "active-user-token".len() as u64);
        let _ = std::fs::remove_dir_all(root);
    }
}

fn install_index(paths: &[String]) -> crate::services::steam_manifest::SteamInstallIndex {
    crate::services::steam_library_paths::index(paths)
}
