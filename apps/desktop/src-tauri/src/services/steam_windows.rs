//! Windows Steam runs inside Orbit's compatibility environment. The Mac Steam
//! app is never started. SteamCMD runs only for a download.

use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
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
    asks_for_secret, find_game_executable, install_dir, parse_progress_line, steamcmd_arguments,
    valid_app_id,
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
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PlayEngine {
    /// Use a GameHub container when GameHub manages the game, otherwise Orbit's
    /// own silent Steam client.
    #[default]
    Auto,
    /// Always use Orbit's own Steam for Windows environment.
    Orbit,
    /// Require the GameHub container; fail instead of falling back.
    Gamehub,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SteamWindowsPreferences {
    pub offline_mode: bool,
    pub verify_files: bool,
    #[serde(default)]
    pub additional_library_paths: Vec<String>,
    #[serde(default)]
    pub play_engine: PlayEngine,
}

impl Default for SteamWindowsPreferences {
    fn default() -> Self {
        Self {
            offline_mode: false,
            verify_files: true,
            additional_library_paths: Vec::new(),
            play_engine: PlayEngine::default(),
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
    })
}

pub(crate) fn set_login_window_running(running: bool) {
    CLIENT_RUNNING.store(running, Ordering::Relaxed);
}

pub(crate) fn login_in_progress() -> bool {
    CLIENT_RUNNING.load(Ordering::Relaxed)
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
        .map(|entry| {
            let library_install = library.by_id.get(&entry.app_id);
            let title = if steam_catalog::is_placeholder_title(&entry.title, &entry.app_id) {
                library_install
                    .map(|install| install.title.clone())
                    .unwrap_or(entry.title)
            } else {
                entry.title
            };
            SteamOwnedGame {
                installed: orbit_installed(&entry.app_id) || library_install.is_some(),
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
            }
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
    let Some(support) = steam_support_dir() else {
        return Err(
            "Install Steam for Windows in Settings → Steam before refreshing the library".into(),
        );
    };
    let login_path = support.join("config/loginusers.vdf");
    if !login_path.is_file() {
        return Err("Sign in with Steam before refreshing the library".into());
    }
    let metadata =
        fs::metadata(&login_path).map_err(|_| "Steam has not saved a local login yet")?;
    if metadata.len() > 8 * 1024 * 1024 {
        return Err("Steam login file was too large".into());
    }
    let login =
        fs::read_to_string(&login_path).map_err(|_| "Steam has not saved a local login yet")?;
    let recent = most_recent_account(&login).ok_or("Steam has not saved a local login yet")?;
    if recent.name != account {
        return Err("Steam is signed in as a different account. Sign in again.".into());
    }
    let local_ids = read_owned_ids(&support, &recent.steam_id)?;
    let fetched = play_wine_binary(repo).and_then(|wine| {
        super::steam_session::web_token(&wine, &steam_prefix(), &recent.steam_id)
            .ok()
            .and_then(|token| super::steam_qr::fetch_owned_games(token.expose()).ok())
    });
    let entries =
        steam_catalog::apply_owned_snapshot(&stored_entries(repo)?, &local_ids, fetched.as_deref());
    if entries.is_empty() {
        return Err(
            "Steam has not saved your owned games yet. Keep Steam signed in, then refresh the library."
                .into(),
        );
    }
    save_library(repo, &entries)
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

/// Saves a login once Steam's own window has written it. The library error is
/// returned beside the status so a slow Steam write does not undo the sign-in.
pub fn capture_login(
    repo: &GameRepository,
) -> Result<(Option<SteamWindowsStatus>, Option<String>), String> {
    let Some(existing) = read_support_account() else {
        return Ok((None, None));
    };
    let local_ids = steam_support_dir()
        .and_then(|support| read_owned_ids(&support, &existing.steam_id).ok())
        .unwrap_or_default();
    let has_web_session = play_wine_binary(repo).is_some_and(|wine| {
        super::steam_session::web_token(&wine, &steam_prefix(), &existing.steam_id).is_ok()
    });
    // loginusers.vdf is written before Steam finishes its session. Keep the
    // official client alive until tickets or an authenticated web cookie exist.
    if !has_web_session && local_ids.is_empty() {
        return Ok((None, None));
    }
    if stored_account(repo)?.is_some_and(|name| name != existing.name) {
        save_library(repo, &[])?;
    }
    save_account(repo, &existing.name)?;
    if let Some(support) = steam_support_dir() {
        crate::utils::steam_account::enable_saved_login(&support.join("config/loginusers.vdf"));
    }
    let library_error = refresh_owned_ids(repo).err();
    Ok((Some(status(repo)?), library_error))
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
            steam_runtime_command(&wine, &prefix)
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
            steam_runtime_command(&wine, &prefix)
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
            "Steam did not finish installing its browser. Keep this Mac online and try Install Steam for Windows again."
                .into(),
        );
    }
    Ok(())
}

pub fn cancel_download() {
    if let Some(child) = DOWNLOAD_CHILD.lock().as_mut() {
        let _ = child.kill();
    }
}

pub fn download(app: &AppHandle, repo: &GameRepository, app_id: &str) -> Result<(), String> {
    if !valid_app_id(app_id) {
        return Err("Steam app id must be a number".into());
    }
    let account = stored_account(repo)?.ok_or("Sign in with Steam before downloading")?;
    let session = session_dir(&app_data_dir());
    let destination = install_dir(&session, app_id)?;
    fs::create_dir_all(&destination).map_err(|err| err.to_string())?;
    let binary = ensure_steamcmd(&session)?;
    let prefs = preferences(repo)?;
    let args = steamcmd_arguments(
        &account,
        app_id,
        &destination,
        prefs.offline_mode,
        prefs.verify_files,
    )?;
    if DOWNLOAD_ACTIVE
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("A Steam download is already running".into());
    }
    CLIENT_RUNNING.store(true, Ordering::Relaxed);
    let key = format!("steam:{app_id}");
    let label = format!("Steam {app_id}");
    let result = run_steamcmd(app, &binary, &args, &key, &label);
    CLIENT_RUNNING.store(false, Ordering::Relaxed);
    DOWNLOAD_ACTIVE.store(false, Ordering::SeqCst);
    result
}

pub fn play(repo: &GameRepository, app_id: &str) -> Result<String, String> {
    if !valid_app_id(app_id) {
        return Err("Steam app id must be a number".into());
    }
    let destination = install_dir(&session_dir(&app_data_dir()), app_id)?;
    let orbit_exe = find_game_executable(&destination);
    let library = install_index(&preferences(repo)?.additional_library_paths);
    let executable = orbit_exe
        .or_else(|| {
            library
                .by_id
                .get(app_id)
                .and_then(|install| find_game_executable(&install.install_dir))
        })
        .ok_or("Download the game before playing")?;
    let runtime = play_wine_binary(repo)
        .ok_or("Install Steam for Windows in Settings → Steam before playing this game")?;
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
        install_size_bytes: None,
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

fn wine_steam_root() -> PathBuf {
    wine_steam_root_in(&steam_prefix())
}

pub(crate) fn steam_exe() -> PathBuf {
    wine_steam_root().join("steam.exe")
}

fn steam_support_dir() -> Option<PathBuf> {
    let path = wine_steam_root();
    path.is_dir().then_some(path)
}

pub fn installed_app_ids(
    entries: &[SteamCatalogEntry],
    paths: &[String],
) -> std::collections::HashSet<String> {
    let library = install_index(paths).by_id;
    let mut ids: std::collections::HashSet<String> = library.keys().cloned().collect();
    for entry in entries {
        if orbit_installed(&entry.app_id) {
            ids.insert(entry.app_id.clone());
        }
    }
    ids
}

pub(crate) fn play_wine_binary(repo: &GameRepository) -> Option<PathBuf> {
    steam_wine_binary().or_else(|| wine_executable(repo))
}

fn orbit_installed(app_id: &str) -> bool {
    let Ok(dir) = install_dir(&session_dir(&app_data_dir()), app_id) else {
        return false;
    };
    dir.join(format!("steamapps/appmanifest_{app_id}.acf"))
        .is_file()
        || find_game_executable(&dir).is_some()
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
        .env("WINEDEBUG", "-all");
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

fn require_windows_steam() -> Result<PathBuf, String> {
    let prefix = steam_prefix();
    let exe = steam_exe_in(&prefix);
    if !exe.is_file() {
        return Err("Install Steam for Windows in Settings → Steam before signing in".into());
    }
    if !steam_client_ready(&prefix) {
        return Err(
            "Steam is still installing its browser. Use Install Steam for Windows, then sign in"
                .into(),
        );
    }
    Ok(exe)
}

fn wine_steam_root_in(prefix: &Path) -> PathBuf {
    prefix.join("drive_c/Program Files (x86)/Steam")
}

fn steam_exe_in(prefix: &Path) -> PathBuf {
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
    let started = Instant::now();
    loop {
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
        if steam_client_ready(prefix) {
            return true;
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
/// wineserver is killed. GameHub's private SteamAgent is not used.
pub(crate) fn request_steam_shutdown(wine: &Path, prefix: &Path) {
    let steam = steam_exe();
    if !steam.is_file() || !wine.is_file() || !prefix.is_dir() {
        return;
    }
    let mut command = steam_runtime_command(wine, prefix);
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

fn stop_steam_wineserver(wine: &Path, prefix: &Path) {
    let Some(server) = wine.parent().map(|bin| bin.join("wineserver")) else {
        return;
    };
    if !server.is_file() || !prefix.is_dir() {
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
    for pid in prefix_process_ids(&listing, prefix) {
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
) -> Result<(), String> {
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
    let mut last_emit = Instant::now()
        .checked_sub(Duration::from_secs(1))
        .unwrap_or_else(Instant::now);
    let mut last_percent = -1i64;
    let mut secret = false;
    while let Some(line) = next_output_line(&mut stdout) {
        if asks_for_secret(&line) {
            secret = true;
            cancel_download();
            break;
        }
        let Some(progress) = parse_progress_line(&line) else {
            continue;
        };
        let percent =
            (progress.downloaded_bytes.saturating_mul(100) / progress.total_bytes.max(1)) as i64;
        if percent == last_percent && last_emit.elapsed() < Duration::from_millis(250) {
            continue;
        }
        last_percent = percent;
        last_emit = Instant::now();
        let _ = app.emit(
            "steam-download-progress",
            json!({
                "key": key,
                "label": label,
                "done": false,
                "progress": {
                    "phase": "Downloading",
                    "component": label,
                    "downloadedBytes": progress.downloaded_bytes,
                    "totalBytes": progress.total_bytes,
                }
            }),
        );
    }
    let status = DOWNLOAD_CHILD
        .lock()
        .take()
        .and_then(|mut child| child.wait().ok());
    if secret {
        return Err("Steam asked for a password or Guard code. Use Sign in with Steam, then try the download again.".into());
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
            "progress": { "phase": "Ready", "component": label, "message": "Ready" }
        }),
    );
    Ok(())
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
                play_engine: PlayEngine::Gamehub,
            },
        )
        .unwrap();
        assert!(saved.offline_mode);
        assert!(!saved.verify_files);
        let again = preferences(&repo).unwrap();
        assert!(again.offline_mode);
        assert!(!again.verify_files);
        assert_eq!(again.play_engine, PlayEngine::Gamehub);
        // A stored preference without play_engine still parses (upgrade path).
        repo.set_setting(
            PREFERENCES_KEY,
            &serde_json::json!({"offlineMode": false, "verifyFiles": true}),
        )
        .unwrap();
        assert_eq!(preferences(&repo).unwrap().play_engine, PlayEngine::Auto);
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
}

fn install_index(paths: &[String]) -> crate::services::steam_manifest::SteamInstallIndex {
    crate::services::steam_library_paths::index(paths)
}
