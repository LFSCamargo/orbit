//! Silent, non-blocking Steam client sync for newly purchased games.
//!
//! Valve requires an authenticated Steam CM session to refresh a `SteamClient`
//! login's licenses (bare HTTP `GenerateAccessTokenForApp` returns AccessDenied
//! for client tokens). When local Steam roots are stale — for example, a game
//! was purchased on Steam Mobile or the web without opening Mac Steam — Orbit
//! runs Valve's official `steam.exe` headlessly (`-silent -no-browser`) inside
//! a reusable APFS-cloned sync container (`runtimes/containers/steam-sync`),
//! lets Steam update `packageinfo.vdf` / `appinfo.vdf` / `licensecache`, shuts
//! that client down immediately, and refreshes Orbit's SQLite catalog.
//!
//! `steam-windows/prefix` is never modified or left running. Any Play,
//! download, sign-in, sign-out, or app exit cancels the sync immediately.
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime};

use tauri::{AppHandle, Emitter, Manager};

use crate::runtimes::containers::layout::prefix_ready;
use crate::runtimes::containers::steam::steam_root;
use crate::services::container_steam::{self, SteamHost};
use crate::services::steam_catalog;
use crate::services::steam_catalog_sync;
use crate::services::steam_native::{agent_host, client_provision, session};
use crate::services::steam_windows;
use crate::utils::api_keys::steamgriddb_api_key;
use crate::utils::steam_account;
use crate::AppState;

const LOGON_TIMEOUT: Duration = Duration::from_secs(60);
const PICS_MAX_WAIT: Duration = Duration::from_secs(15);
const PICS_MIN_WAIT: Duration = Duration::from_secs(3);
const PICS_QUIET_SETTLE: Duration = Duration::from_millis(2_500);
const POLL_INTERVAL: Duration = Duration::from_millis(250);

/// State owned by `AppState` (no process-global static owners).
pub struct SteamSyncControl {
    running: Arc<AtomicBool>,
    cancel: Arc<AtomicBool>,
}

impl SteamSyncControl {
    pub fn new() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            cancel: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    /// Cancels an in-flight sync and stops its prefix so Play, Download,
    /// Sign-in, Sign-out, or app exit never contend with it.
    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
        if self.running.load(Ordering::SeqCst) {
            let prefix = sync_prefix(&crate::runtimes::root());
            if prefix.is_dir() {
                crate::services::steam_resident::stop_prefix(&prefix);
            }
        }
    }

    fn try_claim(&self) -> Option<SyncGuard> {
        self.running
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .ok()?;
        self.cancel.store(false, Ordering::SeqCst);
        Some(SyncGuard {
            running: self.running.clone(),
            cancel: self.cancel.clone(),
        })
    }
}

struct SyncGuard {
    running: Arc<AtomicBool>,
    cancel: Arc<AtomicBool>,
}

impl Drop for SyncGuard {
    fn drop(&mut self) {
        self.running.store(false, Ordering::SeqCst);
    }
}

/// Ensures the sync container's Steam client is shut down on every exit path,
/// unless already stopped faster (for instance after logon refusal or cancel).
struct HostShutdown<'a>(Option<&'a SteamHost>);

impl HostShutdown<'_> {
    fn disarm(&mut self) {
        self.0 = None;
    }
}

impl Drop for HostShutdown<'_> {
    fn drop(&mut self) {
        if let Some(host) = self.0.take() {
            container_steam::shutdown(host);
        }
    }
}

pub fn sync_dir(runtimes_root: &Path) -> PathBuf {
    crate::runtimes::containers::root_in(runtimes_root).join("steam-sync")
}

pub fn sync_prefix(runtimes_root: &Path) -> PathBuf {
    sync_dir(runtimes_root).join("prefix")
}

/// Removes the cached sync container on Sign out. Refuses symlink escapes.
pub fn remove_sync_dir(runtimes_root: &Path) -> Result<(), String> {
    let dir = sync_dir(runtimes_root);
    if !dir.exists() {
        return Ok(());
    }
    let meta = fs::symlink_metadata(&dir).map_err(|err| err.to_string())?;
    if meta.file_type().is_symlink() {
        return Err("Refusing to remove a symlinked Steam sync folder".into());
    }
    let containers = crate::runtimes::containers::root_in(runtimes_root)
        .canonicalize()
        .map_err(|err| err.to_string())?;
    let target = dir.canonicalize().map_err(|err| err.to_string())?;
    if target.parent() != Some(containers.as_path()) {
        return Err("Refusing to delete a Steam sync folder outside Orbit's containers".into());
    }
    crate::services::steam_resident::stop_prefix(&target.join("prefix"));
    fs::remove_dir_all(&target).map_err(|err| err.to_string())
}

/// Headless Steam flags: logs on to Steam CM and syncs licenses/PICS without
/// launching CEF (`steamwebhelper.exe`) or opening any visible UI.
pub fn headless_sync_args(steam_exe: &Path) -> Vec<String> {
    vec![
        steam_exe.to_string_lossy().into_owned(),
        "-silent".into(),
        "-no-browser".into(),
        "-nofriendsui".into(),
        "-no-dwrite".into(),
        "-noverifyfiles".into(),
    ]
}

/// Starts a single non-blocking Steam CM sync when online, signed in, and idle.
/// Keeps all filesystem and SQLite checks on the background worker thread so
/// async Tauri commands never block the executor.
pub fn schedule(app: AppHandle) {
    if !crate::services::network_monitor::online()
        || steam_windows::download_active()
        || steam_windows::login_in_progress()
        || crate::services::download_queue::has_work()
    {
        return;
    }
    let state = app.state::<AppState>();
    let Some(guard) = state.steam_library_sync.try_claim() else {
        return;
    };
    let _ = std::thread::Builder::new()
        .name("orbit-steam-sync".into())
        .spawn(move || {
            let _guard = guard;
            run_sync(&app, &_guard.cancel);
        });
}

fn can_start(state: &AppState) -> bool {
    if !crate::services::network_monitor::online()
        || state.sessions.get_active().is_some()
        || state.sessions.is_launching()
        || crate::services::download_queue::has_work()
        || steam_windows::download_active()
        || steam_windows::login_in_progress()
    {
        return false;
    }
    let session_dir = steam_windows::session_dir(&crate::utils::paths::app_data_dir());
    session::has_saved(&session_dir)
        && steam_windows::stored_account(&state.repo)
            .ok()
            .flatten()
            .is_some()
        && steam_windows::play_wine_binary(&state.repo).is_some()
        && prefix_ready(&steam_windows::steam_prefix())
}

fn should_abort(app: &AppHandle, cancel: &AtomicBool) -> bool {
    if cancel.load(Ordering::SeqCst)
        || !crate::services::network_monitor::online()
        || steam_windows::download_active()
        || steam_windows::login_in_progress()
    {
        return true;
    }
    let state = app.state::<AppState>();
    state.sessions.get_active().is_some()
        || state.sessions.is_launching()
        || crate::services::download_queue::has_work()
}

fn run_sync(app: &AppHandle, cancel: &AtomicBool) {
    let state = app.state::<AppState>();
    if !can_start(&state) {
        return;
    }
    let Ok(Some(account)) = steam_windows::stored_account(&state.repo) else {
        return;
    };
    let session_dir = steam_windows::session_dir(&crate::utils::paths::app_data_dir());
    let Some(credentials) = session::agent_credentials(&session_dir) else {
        return;
    };
    if !credentials.account_name.eq_ignore_ascii_case(&account) {
        return;
    }
    let Some(wine) = steam_windows::play_wine_binary(&state.repo) else {
        return;
    };
    let runtimes_root = crate::runtimes::root();
    let prefix = sync_prefix(&runtimes_root);
    if prepare_sync_prefix(
        &runtimes_root,
        &prefix,
        &wine,
        &session_dir,
        &credentials,
        cancel,
    )
    .is_err()
    {
        return;
    }
    if should_abort(app, cancel) {
        return;
    }

    let root = steam_root(&prefix);
    let steam_exe = root.join("steam.exe");
    if !steam_exe.is_file() {
        return;
    }
    let host = SteamHost {
        wine: wine.clone(),
        prefix: prefix.clone(),
    };
    let loginusers = root.join("config/loginusers.vdf");
    steam_account::enable_saved_login(&loginusers);
    if container_steam::write_updater_lock(&root).is_err() {
        return;
    }
    if container_steam::enable_auto_login(&host, &credentials.account_name, cancel).is_err() {
        return;
    }
    if !container_steam::tray_already_hidden(&host.prefix) {
        container_steam::hide_tray(&host, cancel);
    }

    let mut tracker = {
        container_steam::prepare_fresh_logs(&root);
        container_steam::LogTracker::from_end(&root, "connection_log.txt")
    };
    let baseline = CacheStamp::read(&root, &credentials.steam_id);
    if let Err(err) = fs::remove_file(root.join("steam.pid")) {
        if err.kind() != std::io::ErrorKind::NotFound {
            eprintln!("Steam sync pid file could not be removed: {err}");
        }
    }

    let mut command = steam_windows::hidden_steam_command(&host.wine, &host.prefix);
    command
        .args(headless_sync_args(&steam_exe))
        .current_dir(&root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    if command.spawn().is_err() {
        return;
    }
    let outcome = {
        let mut shutdown = HostShutdown(Some(&host));
        let outcome = wait_for_pics_sync(
            app,
            &root,
            &credentials.steam_id,
            &mut tracker,
            baseline,
            cancel,
        );
        if outcome == SyncOutcome::Refused {
            shutdown.disarm();
            container_steam::clear_refused_session(
                &session_dir,
                &[&steam_windows::steam_prefix(), &prefix],
                || container_steam::force_stop(&host),
            );
        } else if outcome != SyncOutcome::Synced || should_abort(app, cancel) {
            shutdown.disarm();
            container_steam::force_stop(&host);
        }
        outcome
    };
    if outcome == SyncOutcome::Refused {
        steam_windows::emit_status(app, &state.repo);
        return;
    }
    if outcome != SyncOutcome::Synced || should_abort(app, cancel) {
        return;
    }

    // Re-verify the signed-in account didn't change while syncing.
    if steam_windows::stored_account(&state.repo).ok().flatten() != Some(account.clone()) {
        return;
    }
    let before = steam_windows::stored_entries(&state.repo).unwrap_or_default();
    let before_count = before.len();
    if steam_windows::refresh_owned_ids(&state.repo).is_err() {
        return;
    }
    let Ok(entries) = steam_windows::stored_entries(&state.repo) else {
        return;
    };
    let paths = steam_windows::preferences(&state.repo)
        .map(|prefs| prefs.additional_library_paths)
        .unwrap_or_default();
    let installed = steam_windows::installed_app_ids(&entries, &paths);
    let entries = steam_catalog::include_installed(entries, &installed);
    let key = steamgriddb_api_key(&state.repo);
    if entries.len() != before_count || steam_catalog::catalog_needs_hydrate(&entries) {
        steam_catalog_sync::schedule(
            app.clone(),
            entries,
            key,
            installed,
            Default::default(),
            false,
            Some(account),
        );
        let _ = app.emit("steam-library-updated", ());
    }
}

fn prepare_sync_prefix(
    runtimes_root: &Path,
    prefix: &Path,
    wine: &Path,
    session_dir: &Path,
    credentials: &session::AgentCredentials,
    cancel: &AtomicBool,
) -> Result<(), String> {
    if prefix
        .symlink_metadata()
        .is_ok_and(|meta| meta.file_type().is_symlink())
    {
        return Err("Steam sync prefix cannot be a symlink".into());
    }
    if !prefix_ready(prefix) {
        let source = steam_windows::steam_prefix();
        if !prefix_ready(&source) {
            return Err("Steam sign-in prefix is not ready".into());
        }
        if prefix.exists() {
            crate::services::steam_resident::stop_prefix(prefix);
            fs::remove_dir_all(prefix).map_err(|err| err.to_string())?;
        }
        crate::runtimes::containers::clone::clone_tree(&source, prefix)
            .map_err(|err| format!("{err:#}"))?;
    }
    client_provision::provision_container(runtimes_root, prefix)?;
    if needs_login_seed(prefix, session_dir, &credentials.steam_id) {
        agent_host::seed_saved_login_with_cancel(wine, prefix, credentials, cancel)?;
    }
    Ok(())
}

fn needs_login_seed(prefix: &Path, session_dir: &Path, steam_id: &str) -> bool {
    let loginusers = steam_root(prefix).join("config/loginusers.vdf");
    let matching_account = read_loginusers_capped(&loginusers)
        .and_then(|text| steam_account::most_recent_account(&text))
        .is_some_and(|account| account.steam_id == steam_id);
    if !matching_account {
        return true;
    }
    let session_mtime = fs::metadata(session_dir.join("native-session.json"))
        .and_then(|meta| meta.modified())
        .ok();
    let local_vdf_mtime = agent_host::profile_user(prefix)
        .map(|user| {
            prefix
                .join("drive_c/users")
                .join(user)
                .join("AppData/Local/Steam/local.vdf")
        })
        .and_then(|path| fs::metadata(path).and_then(|meta| meta.modified()).ok());
    match (session_mtime, local_vdf_mtime) {
        (_, None) => true,
        (Some(saved), Some(seeded)) => saved > seeded,
        (None, Some(_)) => false,
    }
}

fn read_loginusers_capped(path: &Path) -> Option<String> {
    const LIMIT: u64 = 8 * 1024 * 1024;
    let meta = fs::symlink_metadata(path).ok()?;
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > LIMIT {
        return None;
    }
    let mut text = String::new();
    fs::File::open(path)
        .ok()?
        .take(LIMIT + 1)
        .read_to_string(&mut text)
        .ok()?;
    (text.len() as u64 <= LIMIT).then_some(text)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
struct FileStamp {
    len: u64,
    modified: Option<SystemTime>,
}

impl FileStamp {
    fn read(path: &Path) -> Self {
        fs::metadata(path)
            .map(|meta| Self {
                len: meta.len(),
                modified: meta.modified().ok(),
            })
            .unwrap_or_default()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
struct CacheStamp {
    packageinfo: FileStamp,
    appinfo: FileStamp,
    licensecache: FileStamp,
}

impl CacheStamp {
    fn read(root: &Path, steam_id: &str) -> Self {
        let license = steam_account::userdata_account_id(steam_id)
            .map(|id| FileStamp::read(&root.join("userdata").join(id).join("config/licensecache")))
            .unwrap_or_default();
        Self {
            packageinfo: FileStamp::read(&root.join("appcache/packageinfo.vdf")),
            appinfo: FileStamp::read(&root.join("appcache/appinfo.vdf")),
            licensecache: license,
        }
    }
}

/// Pure settle state machine after `[Logged On`: waits at least `PICS_MIN_WAIT`,
/// extends up to `PICS_MAX_WAIT` while `packageinfo.vdf` / `appinfo.vdf` /
/// `licensecache` are actively changing, and exits once they stay quiet for
/// `PICS_QUIET_SETTLE`.
struct PicsSettle {
    logged_on_at: Instant,
    last_stamp: CacheStamp,
    last_change_at: Option<Instant>,
}

impl PicsSettle {
    fn new(now: Instant, baseline: CacheStamp) -> Self {
        Self {
            logged_on_at: now,
            last_stamp: baseline,
            last_change_at: None,
        }
    }

    /// Returns true once PICS caches have settled or the wait window elapsed.
    fn observe(&mut self, now: Instant, current: CacheStamp) -> bool {
        if current != self.last_stamp {
            self.last_stamp = current;
            self.last_change_at = Some(now);
            return false;
        }
        let elapsed = now.saturating_duration_since(self.logged_on_at);
        if elapsed >= PICS_MAX_WAIT {
            return true;
        }
        if elapsed < PICS_MIN_WAIT {
            return false;
        }
        match self.last_change_at {
            Some(changed) => now.saturating_duration_since(changed) >= PICS_QUIET_SETTLE,
            None => true,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SyncOutcome {
    Synced,
    Refused,
    AbortedOrTimedOut,
}

fn wait_for_pics_sync(
    app: &AppHandle,
    root: &Path,
    steam_id: &str,
    tracker: &mut container_steam::LogTracker,
    baseline: CacheStamp,
    cancel: &AtomicBool,
) -> SyncOutcome {
    let deadline = Instant::now() + LOGON_TIMEOUT;
    let mut settle: Option<PicsSettle> = None;
    loop {
        if should_abort(app, cancel) {
            return SyncOutcome::AbortedOrTimedOut;
        }
        let now = Instant::now();
        if let Some(state) = settle.as_mut() {
            if state.observe(now, CacheStamp::read(root, steam_id)) {
                return SyncOutcome::Synced;
            }
        } else {
            let log = tracker.read(root, "connection_log.txt");
            let console = container_steam::read_log_from(root, "console_log.txt", 0);
            if container_steam::logon_refused_in(&log, &console) {
                return SyncOutcome::Refused;
            }
            if steam_account::connection_logged_on(&log) {
                settle = Some(PicsSettle::new(now, baseline));
            } else if now >= deadline {
                return SyncOutcome::AbortedOrTimedOut;
            }
        }
        std::thread::sleep(POLL_INTERVAL);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn headless_sync_runs_silently_without_browser_or_secrets() {
        let args = headless_sync_args(Path::new("/Steam/steam.exe"));
        assert!(args.contains(&"-silent".into()));
        assert!(args.contains(&"-no-browser".into()));
        assert!(args.contains(&"-nofriendsui".into()));
        assert!(args.contains(&"-noverifyfiles".into()));
        assert!(!args.iter().any(|arg| arg == "-applaunch"));
        assert!(!args.iter().any(|arg| arg.contains("password")));
    }

    #[test]
    fn control_allows_only_one_in_flight_sync_and_drop_releases_it() {
        let control = SteamSyncControl::new();
        assert!(!control.is_running());
        let first = control.try_claim().expect("first claim");
        assert!(control.is_running());
        assert!(control.try_claim().is_none());
        drop(first);
        assert!(!control.is_running());
        assert!(control.try_claim().is_some());
    }

    #[test]
    fn pics_settle_waits_for_quiet_after_cache_updates() {
        let t0 = Instant::now();
        let initial = CacheStamp::default();
        let mut settle = PicsSettle::new(t0, initial);
        assert!(!settle.observe(t0 + Duration::from_secs(1), initial));
        let updated = CacheStamp {
            packageinfo: FileStamp {
                len: 40_000,
                modified: None,
            },
            ..initial
        };
        assert!(!settle.observe(t0 + Duration::from_secs(2), updated));
        assert!(
            !settle.observe(t0 + Duration::from_secs(4), updated),
            "still inside quiet window after change at t+2s"
        );
        assert!(
            settle.observe(t0 + Duration::from_millis(4_600), updated),
            "quiet window elapsed after last change"
        );
    }

    #[test]
    fn pics_settle_finishes_after_min_wait_when_nothing_changed() {
        let t0 = Instant::now();
        let initial = CacheStamp::default();
        let mut settle = PicsSettle::new(t0, initial);
        assert!(!settle.observe(t0 + Duration::from_secs(2), initial));
        assert!(settle.observe(t0 + PICS_MIN_WAIT, initial));
    }

    #[test]
    fn pics_settle_stops_at_max_wait_even_under_continuous_writes() {
        let t0 = Instant::now();
        let mut stamp = CacheStamp::default();
        let mut settle = PicsSettle::new(t0, stamp);
        for sec in 1..15 {
            stamp.appinfo.len = sec * 100;
            assert!(!settle.observe(t0 + Duration::from_secs(sec), stamp));
        }
        assert!(settle.observe(t0 + PICS_MAX_WAIT, stamp));
    }

    #[test]
    #[cfg(unix)]
    fn remove_sync_dir_removes_only_sync_folder_and_rejects_symlinks() {
        let root = std::env::temp_dir().join(format!("orbit-sync-rm-{}", uuid::Uuid::new_v4()));
        let outside = std::env::temp_dir().join(format!("orbit-sync-out-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("keep"), b"keep").unwrap();
        let containers = crate::runtimes::containers::root_in(&root);
        fs::create_dir_all(&containers).unwrap();
        std::os::unix::fs::symlink(&outside, containers.join("steam-sync")).unwrap();
        assert!(remove_sync_dir(&root).is_err());
        assert!(outside.join("keep").is_file());
        fs::remove_file(containers.join("steam-sync")).unwrap();
        fs::create_dir_all(containers.join("steam-sync/prefix")).unwrap();
        fs::write(containers.join("steam-sync/prefix/x"), b"1").unwrap();
        remove_sync_dir(&root).unwrap();
        assert!(!containers.join("steam-sync").exists());
        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(outside);
    }
}
