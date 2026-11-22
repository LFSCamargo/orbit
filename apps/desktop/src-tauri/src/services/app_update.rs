//! Orbit's own updates from the repository's GitHub releases.
//!
//! The newest release (never an Orbit Wine one: those are published with
//! `--latest=false`) carries `latest.json`. `tauri-plugin-updater` compares its
//! version with this build, downloads the `.app.tar.gz`, and refuses it unless
//! its minisign signature matches the public key in `tauri.conf.json`.
//!
//! Flow: check at startup (after a delay) and every 6 h while "Update Orbit
//! automatically" is on; download in the background, never while a game or
//! cloud stream plays; then wait. The person restarts from the toast, the Home
//! menu or Settings, or the update installs as Orbit quits. Only the `.app`
//! bundle is replaced; Application Support is never touched.
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

pub const STATE_EVENT: &str = "app-update";
/// Where a manual download lives when Orbit cannot update itself.
pub const RELEASES_URL: &str = "https://github.com/LFSCamargo/orbit/releases/latest";
const PREFERENCES_KEY: &str = "app-preferences-v1";
const STARTUP_DELAY: Duration = Duration::from_secs(30);
const CHECK_EVERY: Duration = Duration::from_secs(6 * 60 * 60);
/// How often the background loop wakes to see whether a check is due.
const LOOP_TICK: Duration = Duration::from_secs(5 * 60);
const PROGRESS_EVERY: Duration = Duration::from_millis(250);

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum AppUpdateState {
    Idle,
    Checking,
    UpToDate {
        checked_at: String,
    },
    Downloading {
        version: String,
        downloaded: u64,
        total: Option<u64>,
    },
    Ready {
        version: String,
        notes: Option<String>,
    },
    Unsupported {
        reason: String,
        releases_url: String,
    },
    Failed {
        message: String,
    },
}

static STATE: Mutex<AppUpdateState> = Mutex::new(AppUpdateState::Idle);
/// The verified download waiting to be installed.
static PENDING: Mutex<Option<(Update, Vec<u8>)>> = Mutex::new(None);
static BUSY: AtomicBool = AtomicBool::new(false);
static STARTED: AtomicBool = AtomicBool::new(false);
/// The updater plugin is registered: `tauri.conf.json` has a public key.
static CONFIGURED: AtomicBool = AtomicBool::new(false);

/// Whether this build's config carries the updater (public key and
/// endpoint). Builds without it (local, forks) run without updates instead
/// of failing to start.
pub fn configured(plugins: &std::collections::HashMap<String, serde_json::Value>) -> bool {
    plugins
        .get("updater")
        .and_then(|updater| updater.get("pubkey"))
        .and_then(serde_json::Value::as_str)
        .is_some_and(|key| !key.trim().is_empty())
}

pub fn set_configured(configured: bool) {
    CONFIGURED.store(configured, Ordering::SeqCst);
}

pub fn status() -> AppUpdateState {
    STATE.lock().clone()
}

fn set(app: &AppHandle, state: AppUpdateState) {
    *STATE.lock() = state.clone();
    let _ = app.emit(STATE_EVENT, state);
}

/// Why this copy of Orbit cannot replace itself, or `None` when it can.
/// `exe` is the running binary (`…/Orbit.app/Contents/MacOS/Orbit`).
pub fn unsupported_reason(exe: &Path, debug: bool) -> Option<String> {
    if debug {
        return Some("Development builds do not update themselves".into());
    }
    let path = exe.to_string_lossy();
    if path.contains("/AppTranslocation/") || path.starts_with("/Volumes/") {
        // macOS runs a quarantined or disk-image copy from a read-only place.
        return Some("Move Orbit to your Applications folder to get updates".into());
    }
    if !path.contains(".app/Contents/MacOS/") {
        return Some("Orbit is not running from its app".into());
    }
    None
}

/// Whether a background check is due: never checked, or `CHECK_EVERY` ago.
pub fn should_check(last: Option<Instant>, now: Instant) -> bool {
    last.is_none_or(|last| now.duration_since(last) >= CHECK_EVERY)
}

/// "Update Orbit automatically" from the saved app preferences; on unless
/// it was turned off.
pub fn auto_update_enabled(saved: Option<&serde_json::Value>) -> bool {
    let parsed;
    let value = match saved {
        Some(serde_json::Value::String(text)) => {
            parsed = serde_json::from_str::<serde_json::Value>(text).ok();
            parsed.as_ref()
        }
        other => other,
    };
    value
        .and_then(|value| value.get("autoUpdateApp"))
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(true)
}

/// Whether the pending update may be installed now.
pub fn install_blocked(game_running: bool, pending: bool) -> Option<&'static str> {
    if game_running {
        return Some("Finish your game first. Orbit updates once it ends");
    }
    if !pending {
        return Some("No update is ready yet");
    }
    None
}

/// Debug builds only: a local `latest.json` for end-to-end tests. A release
/// build always uses the endpoint in `tauri.conf.json`.
pub fn endpoint_override(debug: bool, value: Option<String>) -> Option<tauri::Url> {
    if !debug {
        return None;
    }
    let url = tauri::Url::parse(&value?).ok()?;
    matches!(url.scheme(), "http" | "https").then_some(url)
}

/// Rate limit for progress events.
struct Throttle {
    every: Duration,
    last: Option<Instant>,
}

impl Throttle {
    fn due(&mut self, now: Instant) -> bool {
        if self
            .last
            .is_some_and(|last| now.duration_since(last) < self.every)
        {
            return false;
        }
        self.last = Some(now);
        true
    }
}

fn updater(app: &AppHandle) -> Result<tauri_plugin_updater::Updater, String> {
    let mut builder = app.updater_builder();
    let local = endpoint_override(
        cfg!(debug_assertions),
        std::env::var("ORBIT_UPDATE_ENDPOINT").ok(),
    );
    if let Some(url) = local {
        builder = builder
            .endpoints(vec![url])
            .map_err(|err| err.to_string())?;
    }
    builder.build().map_err(|err| err.to_string())
}

/// Check GitHub and, when a newer Orbit exists, download and verify it.
/// `manual` (Check now) also runs while a game plays; the background loop
/// does not. One check at a time.
pub async fn check(app: &AppHandle, manual: bool) {
    if matches!(status(), AppUpdateState::Ready { .. }) {
        return;
    }
    // A debug build pointed at a local endpoint is the end-to-end test.
    let local_test = endpoint_override(
        cfg!(debug_assertions),
        std::env::var("ORBIT_UPDATE_ENDPOINT").ok(),
    )
    .is_some();
    let reason = std::env::current_exe()
        .ok()
        .and_then(|exe| unsupported_reason(&exe, cfg!(debug_assertions) && !local_test));
    let reason = reason.or_else(|| {
        (!CONFIGURED.load(Ordering::SeqCst))
            .then(|| "This build of Orbit has no update key".to_string())
    });
    if let Some(reason) = reason {
        set(
            app,
            AppUpdateState::Unsupported {
                reason,
                releases_url: RELEASES_URL.into(),
            },
        );
        return;
    }
    if !manual && crate::launching::game_activity::running() {
        return;
    }
    if BUSY.swap(true, Ordering::SeqCst) {
        return;
    }
    let result = check_inner(app).await;
    BUSY.store(false, Ordering::SeqCst);
    if let Err(message) = result {
        set(app, AppUpdateState::Failed { message });
    }
}

async fn check_inner(app: &AppHandle) -> Result<(), String> {
    set(app, AppUpdateState::Checking);
    let update = updater(app)?.check().await.map_err(|_| {
        "Orbit could not check GitHub for updates. It will try again later".to_string()
    })?;
    let Some(update) = update else {
        set(
            app,
            AppUpdateState::UpToDate {
                checked_at: chrono::Utc::now().to_rfc3339(),
            },
        );
        return Ok(());
    };
    let version = update.version.clone();
    let notes = update.body.clone();
    let mut downloaded = 0u64;
    let mut throttle = Throttle {
        every: PROGRESS_EVERY,
        last: None,
    };
    set(
        app,
        AppUpdateState::Downloading {
            version: version.clone(),
            downloaded: 0,
            total: None,
        },
    );
    let bytes = update
        .download(
            |chunk, total| {
                downloaded += chunk as u64;
                if throttle.due(Instant::now()) {
                    set(
                        app,
                        AppUpdateState::Downloading {
                            version: version.clone(),
                            downloaded,
                            total,
                        },
                    );
                }
            },
            || {},
        )
        .await
        // A bad signature lands here too: the archive is never kept.
        .map_err(|_| {
            format!("Orbit {version} could not be downloaded or failed its signature check")
        })?;
    *PENDING.lock() = Some((update, bytes));
    set(app, AppUpdateState::Ready { version, notes });
    Ok(())
}

/// Install the verified update and relaunch Orbit. Refused while a game plays.
pub fn install_and_restart(app: &AppHandle) -> Result<(), String> {
    let running = crate::launching::game_activity::running()
        || app
            .try_state::<crate::AppState>()
            .is_some_and(|state| state.sessions.get_active().is_some());
    if let Some(reason) = install_blocked(running, PENDING.lock().is_some()) {
        return Err(reason.into());
    }
    let Some((update, bytes)) = PENDING.lock().take() else {
        return Err("No update is ready yet".into());
    };
    if let Err(error) = update.install(&bytes) {
        let message = format!("Orbit could not install the update: {error}");
        *PENDING.lock() = Some((update, bytes));
        return Err(message);
    }
    app.restart()
}

/// As Orbit quits: install a ready update when no game is left running and
/// no administrator prompt would appear (the app's folder is writable).
pub fn install_on_exit() {
    if crate::launching::game_activity::running() {
        return;
    }
    let writable = std::env::current_exe()
        .ok()
        .and_then(|exe| bundle_parent(&exe))
        .is_some_and(|dir| is_writable(&dir));
    if !writable {
        return;
    }
    if let Some((update, bytes)) = PENDING.lock().take() {
        let _ = update.install(&bytes);
    }
}

/// The folder holding `Orbit.app`, from the running binary.
pub fn bundle_parent(exe: &Path) -> Option<std::path::PathBuf> {
    exe.ancestors()
        .find(|path| path.extension().is_some_and(|ext| ext == "app"))
        .and_then(Path::parent)
        .map(Path::to_path_buf)
}

fn is_writable(dir: &Path) -> bool {
    let Ok(c_path) = std::ffi::CString::new(dir.as_os_str().as_encoded_bytes()) else {
        return false;
    };
    // SAFETY: access(2) only reads the path.
    unsafe { libc::access(c_path.as_ptr(), libc::W_OK) == 0 }
}

fn enabled(app: &AppHandle) -> bool {
    let saved = app
        .try_state::<crate::AppState>()
        .and_then(|state| state.repo.get_setting(PREFERENCES_KEY).ok().flatten());
    auto_update_enabled(saved.as_ref())
}

/// Starts the background checks once.
pub fn start(app: AppHandle) {
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(move || {
        std::thread::sleep(STARTUP_DELAY);
        let mut last: Option<Instant> = None;
        loop {
            if enabled(&app)
                && !crate::launching::game_activity::running()
                && should_check(last, Instant::now())
            {
                tauri::async_runtime::block_on(check(&app, false));
                last = Some(Instant::now());
            }
            std::thread::sleep(LOOP_TICK);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn only_an_installed_release_build_updates_itself() {
        let installed = Path::new("/Applications/Orbit.app/Contents/MacOS/Orbit");
        assert_eq!(unsupported_reason(installed, false), None);
        assert!(unsupported_reason(installed, true).is_some(), "dev build");
        let translocated = Path::new(
            "/private/var/folders/x/T/AppTranslocation/ABC/d/Orbit.app/Contents/MacOS/Orbit",
        );
        assert!(unsupported_reason(translocated, false)
            .unwrap()
            .contains("Applications"));
        let disk_image = Path::new("/Volumes/Orbit/Orbit.app/Contents/MacOS/Orbit");
        assert!(unsupported_reason(disk_image, false).is_some());
        assert!(unsupported_reason(Path::new("/usr/local/bin/orbit"), false).is_some());
        let user_apps = Path::new("/Users/me/Applications/Orbit.app/Contents/MacOS/Orbit");
        assert_eq!(unsupported_reason(user_apps, false), None);
    }

    #[test]
    fn the_updater_is_used_only_with_a_public_key_in_the_config() {
        let config = |value: serde_json::Value| {
            serde_json::from_value::<std::collections::HashMap<String, serde_json::Value>>(value)
                .unwrap()
        };
        assert!(!configured(&config(serde_json::json!({}))));
        assert!(!configured(&config(
            serde_json::json!({ "updater": { "pubkey": " " } })
        )));
        assert!(configured(&config(serde_json::json!({
            "updater": { "pubkey": "dW50cnVzdGVk", "endpoints": [] }
        }))));
    }

    #[test]
    fn checks_run_at_startup_then_every_six_hours() {
        let now = Instant::now();
        assert!(should_check(None, now));
        assert!(!should_check(Some(now), now + Duration::from_secs(60)));
        assert!(should_check(Some(now), now + CHECK_EVERY));
    }

    #[test]
    fn automatic_updates_are_on_unless_turned_off() {
        assert!(auto_update_enabled(None));
        assert!(auto_update_enabled(Some(
            &serde_json::json!({ "scanOnStartup": true })
        )));
        assert!(!auto_update_enabled(Some(
            &serde_json::json!({ "autoUpdateApp": false })
        )));
        assert!(!auto_update_enabled(Some(&serde_json::json!(
            "{\"autoUpdateApp\":false}"
        ))));
        assert!(auto_update_enabled(Some(&serde_json::json!("not json"))));
    }

    #[test]
    fn a_running_game_or_a_missing_download_blocks_the_install() {
        assert!(install_blocked(true, true).unwrap().contains("game"));
        assert!(install_blocked(false, false).is_some());
        assert_eq!(install_blocked(false, true), None);
    }

    #[test]
    fn only_debug_builds_take_a_local_endpoint() {
        let local = Some("http://127.0.0.1:8765/latest.json".to_string());
        assert!(endpoint_override(true, local.clone()).is_some());
        assert_eq!(endpoint_override(false, local), None);
        assert_eq!(
            endpoint_override(true, Some("file:///tmp/latest.json".into())),
            None
        );
        assert_eq!(endpoint_override(true, None), None);
    }

    #[test]
    fn progress_events_are_throttled() {
        let mut throttle = Throttle {
            every: PROGRESS_EVERY,
            last: None,
        };
        let start = Instant::now();
        assert!(throttle.due(start));
        assert!(!throttle.due(start + Duration::from_millis(100)));
        assert!(throttle.due(start + PROGRESS_EVERY));
    }

    #[test]
    fn the_app_folder_is_found_from_the_binary() {
        assert_eq!(
            bundle_parent(Path::new("/Applications/Orbit.app/Contents/MacOS/Orbit")),
            Some(PathBuf::from("/Applications"))
        );
        assert_eq!(bundle_parent(Path::new("/usr/local/bin/orbit")), None);
        assert!(is_writable(&std::env::temp_dir()));
        assert!(!is_writable(Path::new("/System")));
    }

    #[test]
    fn the_state_reaches_the_ui_in_camel_case() {
        let value = serde_json::to_value(AppUpdateState::Downloading {
            version: "2.2.0".into(),
            downloaded: 10,
            total: Some(20),
        })
        .unwrap();
        assert_eq!(
            value,
            serde_json::json!({ "status": "downloading", "version": "2.2.0", "downloaded": 10, "total": 20 })
        );
        let value = serde_json::to_value(AppUpdateState::Unsupported {
            reason: "r".into(),
            releases_url: RELEASES_URL.into(),
        })
        .unwrap();
        assert_eq!(value["releasesUrl"], RELEASES_URL);
    }
}
