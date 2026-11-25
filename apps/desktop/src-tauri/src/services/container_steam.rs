//! The Steam client a game's container needs while it plays: started silently
//! with the saved login before the game, invisible (no tray icon, no windows),
//! and shut down with the game. Steamworks titles refuse to start without it
//! and would otherwise launch a visible Steam themselves.
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use super::steam_windows::{
    shutdown_argv, steam_exe_in, steam_runtime_command, stop_steam_runtime,
};
use crate::utils::{steam_account, steam_vdf};

const READY_TIMEOUT: Duration = Duration::from_secs(180);
const LOG_LIMIT: u64 = 256 * 1024;
/// `keep_steam_window_closed` moved Valve's client here in earlier builds.
const KEPT_SUFFIX: &str = "steam.exe.orbit-kept";

/// One container's Steam: the Wine that runs it and the prefix it lives in.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SteamHost {
    pub wine: PathBuf,
    pub prefix: PathBuf,
}

const NO_CLIENT: &str =
    "This game's Windows environment has no Steam client. Sign in again from Settings → Steam";
const SIGN_IN_AGAIN: &str = "Your saved Steam sign-in is no longer valid. Sign in again from Settings → Steam, then press Play";
const SHARE_SIGN_IN: &str =
    "Sign in with Steam’s own window from Settings → Steam. Orbit closes that window after the account is saved.";

/// How far the client must get before the caller goes on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClientWait {
    /// Fully started: a game attaching earlier exits 53.
    Startup,
    /// Logged on: Steam starts queued downloads from here, so a download
    /// does not wait for the rest of the client's start-up.
    LoggedOn,
}

#[derive(Debug, PartialEq, Eq)]
enum SessionLaunch {
    /// `ORBIT_STEAM_AGENT=1`: the in-container agent tries first.
    Agent,
    /// Valve's silent `steam.exe` with the saved refresh token.
    Silent,
    /// No saved Settings sign-in.
    SignInAgain,
}

/// Valve's silent client logs on with the saved token. The agent costs about a
/// minute before it gives up, so it only runs when explicitly enabled.
fn session_launch(saved_refresh_token: bool, agent_enabled: bool) -> SessionLaunch {
    match (saved_refresh_token, agent_enabled) {
        (false, _) => SessionLaunch::SignInAgain,
        (true, true) => SessionLaunch::Agent,
        (true, false) => SessionLaunch::Silent,
    }
}

#[derive(PartialEq, Eq)]
enum AgentOutcome {
    Ready,
    UseSilentClient,
}

fn login_present(prefix: &Path) -> bool {
    steam_exe_in(prefix)
        .parent()
        .is_some_and(|root| root.join("config/loginusers.vdf").is_file())
}

struct StageReporter<'a, F: FnMut(&str)> {
    emit: &'a mut F,
    last: Option<&'static str>,
}

impl<'a, F: FnMut(&str)> StageReporter<'a, F> {
    fn new(emit: &'a mut F) -> Self {
        Self { emit, last: None }
    }

    fn update(&mut self, detail: &'static str) {
        if self.last != Some(detail) {
            self.last = Some(detail);
            (self.emit)(&format!("login|{detail}"));
        }
    }
}

/// Start the container's Steam and wait until it is logged on with the saved
/// Settings sign-in. Valve's client binaries are linked in on demand (they are
/// not in the seed prefix). An expired session asks for Settings → Steam.
pub fn ensure_running(
    host: &SteamHost,
    app_id: &str,
    config: super::steam_play_config::PlayConfig,
    cancel: &AtomicBool,
    wait: ClientWait,
) -> Result<(), String> {
    ensure_running_with(host, app_id, config, cancel, wait, &mut |_| {})
}

/// Starts the container's silent Steam client while reporting sub-stage progress
/// (`"login|<detail>"`) so the launch overlay stays informative through boot.
pub fn ensure_running_with(
    host: &SteamHost,
    app_id: &str,
    config: super::steam_play_config::PlayConfig,
    cancel: &AtomicBool,
    wait: ClientWait,
    progress: &mut impl FnMut(&str),
) -> Result<(), String> {
    if cancel.load(Ordering::Relaxed) {
        return Err("Launch cancelled".into());
    }
    let mut reporter = StageReporter::new(progress);
    let session_dir = super::steam_windows::session_dir(&crate::utils::paths::app_data_dir());
    // Settings may have signed in without Orbit storing the token yet (or with
    // a newer login than the stored one). Store it now instead of failing.
    if let Err(err) = super::steam_windows::capture_client_session() {
        eprintln!("Saved Steam sign-in could not be read: {err}");
    }
    let saved = super::steam_native::session::agent_credentials(&session_dir);
    let launch = session_launch(saved.is_some(), super::steam_native::agent::agent_enabled());
    let Some(credentials) = saved.filter(|_| launch != SessionLaunch::SignInAgain) else {
        return Err(SHARE_SIGN_IN.into());
    };
    // One Orbit Steam at a time: another game's resident client goes first.
    super::steam_resident::stop_all_except(Some(&host.prefix));
    if !super::steam_native::client_provision::is_client_complete(&host.prefix) {
        super::steam_native::client_provision::provision_container(
            &crate::runtimes::root(),
            &host.prefix,
        )?;
    }
    super::steam_native::session::apply_to_prefix(&host.prefix, &session_dir)?;
    if launch == SessionLaunch::Agent
        && start_agent(host, &credentials, cancel)? == AgentOutcome::Ready
    {
        return Ok(());
    }
    if super::steam_native::agent_host::installed(&host.prefix) {
        // An earlier Play left the agent as this container's steam.exe.
        super::steam_native::agent_host::restore_valve_client(&host.prefix);
    }
    // Unless this client is already logged on, wrap the token with this
    // container's Wine: a ConnectCache copied from steam-windows only unwraps
    // under the Wine build that wrote it.
    let root = steam_exe_in(&host.prefix)
        .parent()
        .map(Path::to_path_buf)
        .ok_or(NO_CLIENT)?;
    if !ready(&host.prefix, &root, LogMarks::default(), wait) {
        reporter.update("Injecting the saved Steam login");
        super::steam_native::agent_host::seed_saved_login_with_cancel(
            &host.wine,
            &host.prefix,
            &credentials,
            cancel,
        )?;
        // Steam reads these at start and rewrites them on exit, so only now.
        if let Err(err) =
            super::steam_play_config::apply(&root, &credentials.steam_id, app_id, config)
        {
            eprintln!("Steam play options were not applied: {err}");
        }
    }
    start_silent_client(host, cancel, wait, &mut reporter)
}

fn start_agent(
    host: &SteamHost,
    credentials: &super::steam_native::session::AgentCredentials,
    cancel: &AtomicBool,
) -> Result<AgentOutcome, String> {
    match super::steam_native::agent_host::ensure_running(
        &host.wine,
        &host.prefix,
        credentials,
        cancel,
    ) {
        Ok(()) => Ok(AgentOutcome::Ready),
        Err(err) if err == "Launch cancelled" => Err(err),
        Err(err) => {
            super::steam_native::agent_host::request_stop(&host.prefix);
            stop_steam_runtime(&host.wine, &host.prefix);
            if super::steam_native::agent_host::restore_valve_client(&host.prefix)
                && login_present(&host.prefix)
            {
                Ok(AgentOutcome::UseSilentClient)
            } else {
                Err(err)
            }
        }
    }
}

fn start_silent_client<F: FnMut(&str)>(
    host: &SteamHost,
    cancel: &AtomicBool,
    wait: ClientWait,
    reporter: &mut StageReporter<'_, F>,
) -> Result<(), String> {
    if cancel.load(Ordering::Relaxed) {
        return Err("Launch cancelled".into());
    }
    let steam = steam_exe_in(&host.prefix);
    let root = steam
        .parent()
        .ok_or("This game's Windows environment has no Steam folder")?
        .to_path_buf();
    restore_steam_exe(&root);
    if !steam.is_file() || super::steam_native::agent_host::installed(&host.prefix) {
        return Err(NO_CLIENT.into());
    }
    let loginusers = root.join("config/loginusers.vdf");
    if !loginusers.is_file() {
        return Err("Sign in with Steam before playing this game".into());
    }
    steam_account::enable_saved_login(&loginusers);
    write_updater_lock(&root)?;
    if let Some(account) = saved_account_name(&loginusers) {
        enable_auto_login(host, &account, cancel)?;
    }
    repair_library_folders(&root, &orbit_libraries(&host.prefix));
    if ready(&host.prefix, &root, LogMarks::default(), wait) {
        return Ok(());
    }
    // Not ready means not usable: a client stuck on a refused login, or one
    // left without a server by a crashed session. No game runs yet, so stop
    // this container's leftovers and start one client with the current login.
    if steam_running(&process_commands(), &host.prefix) {
        force_stop(host);
    }
    if cancel.load(Ordering::Relaxed) {
        return Err("Launch cancelled".into());
    }
    if !tray_already_hidden(&host.prefix) {
        hide_tray(host, cancel);
    }
    if cancel.load(Ordering::Relaxed) {
        return Err("Launch cancelled".into());
    }
    // Archive any previous log before spawning so a fresh launch starts at offset 0
    // and cannot skip lines if Steam truncates then outgrows the prior file size.
    prepare_fresh_logs(&root);
    let mut since = LogMarks::default();
    let ui_mark = log_len(&root, "steamui_login.txt");
    reporter.update("Starting Steam for this game");
    {
        if let Err(err) = std::fs::remove_file(root.join("steam.pid")) {
            if err.kind() != std::io::ErrorKind::NotFound {
                eprintln!("Previous Steam pid file could not be removed: {err}");
            }
        }
        // The browser helper is only needed to place a sign-in window. A
        // silent client can log on without it.
        if super::steam_browser::helper_dir(&root).is_some() {
            super::steam_browser::prepare(&steam).map_err(|err| format!("{err:#}"))?;
        }
        let mut command = steam_runtime_command(&host.wine, &host.prefix);
        command
            .args(super::steam_play::silent_client_args(&steam))
            .current_dir(&root)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        command
            .spawn()
            .map_err(|_| "Windows Steam could not be started for this game".to_string())?;
    }
    let deadline = Instant::now() + READY_TIMEOUT;
    while Instant::now() < deadline {
        if cancel.load(Ordering::Relaxed) {
            force_stop(host);
            return Err("Launch cancelled".into());
        }
        since.track(&root);
        let connection = read_log_from(&root, "connection_log.txt", since.connection);
        let console = read_log_from(&root, "console_log.txt", since.console);
        let steamui_login = read_log_from(&root, "steamui_login.txt", ui_mark);
        if client_ready(
            &process_commands(),
            &host.prefix,
            server_alive(&host.prefix),
            &ClientLogs {
                bootstrap: &read_log(&root, "bootstrap_log.txt"),
                connection: &connection,
                console: &console,
            },
            wait,
        ) {
            return Ok(());
        }
        if logon_refused_in(&connection, &console) {
            // Invalidate persisted tokens BEFORE stopping Wine so an interrupted
            // teardown can never leave Orbit reporting a refused login as Authorized.
            let session_dir =
                super::steam_windows::session_dir(&crate::utils::paths::app_data_dir());
            let steam_prefix = super::steam_windows::steam_prefix();
            let sync_prefix = super::steam_background_sync::sync_prefix(&crate::runtimes::root());
            return handle_logon_refusal(
                &session_dir,
                &[&steam_prefix, &host.prefix, &sync_prefix],
                || force_stop(host),
            );
        }
        reporter.update(login_stage_detail(&connection, &steamui_login, wait));
        std::thread::sleep(Duration::from_millis(250));
    }
    shutdown(host);
    if bootstrap_busy(&read_log(&root, "bootstrap_log.txt")) {
        Err("Steam is still updating for this game. Press Play again in a moment".into())
    } else {
        Err("Steam did not sign in for this game. Sign in again from Settings → Steam".into())
    }
}

/// Clears rejected session state across `session_dir` and `prefixes` first,
/// then stops the container runtime.
pub(crate) fn clear_refused_session(session_dir: &Path, prefixes: &[&Path], stop: impl FnOnce()) {
    if let Err(err) = super::steam_native::session::invalidate_client_session(session_dir, prefixes)
    {
        eprintln!("Rejected Steam session could not be cleared: {err}");
    }
    stop();
}

/// Immediately clears rejected session files across `session_dir` and Wine
/// prefixes before running `stop`, then returns the re-authentication message.
pub(crate) fn handle_logon_refusal(
    session_dir: &Path,
    prefixes: &[&Path],
    stop: impl FnOnce(),
) -> Result<(), String> {
    clear_refused_session(session_dir, prefixes, stop);
    Err(SIGN_IN_AGAIN.into())
}

/// Pure sub-stage label derived from the container client's active logs.
pub(crate) fn login_stage_detail(
    connection: &str,
    steamui_login: &str,
    wait: ClientWait,
) -> &'static str {
    if wait == ClientWait::Startup && steam_account::connection_logged_on(connection) {
        return "Preparing Steam for launch";
    }
    if connection.contains("[Logging On")
        || connection.contains("Using JWT")
        || connection.contains("LogOn()")
    {
        return "Signing in to Steam";
    }
    if connection.contains("Connectivity test")
        || connection.contains("PingWebSocketCM")
        || steamui_login.contains("WaitingForNetwork")
        || steamui_login.contains("Starting login")
    {
        return "Connecting to Steam";
    }
    "Starting Steam for this game"
}

/// Stops the container's Wine runtime immediately without waiting 8s for
/// `steam.exe -shutdown` (used on cancelled launches or refused credentials).
pub(crate) fn force_stop(host: &SteamHost) {
    if super::steam_native::agent_host::installed(&host.prefix) {
        super::steam_native::agent_host::request_stop(&host.prefix);
    }
    stop_steam_runtime(&host.wine, &host.prefix);
    super::steam_resident::stop_prefix(&host.prefix);
}

/// Ask the container's Steam to exit, then stop everything left in the prefix.
pub fn shutdown(host: &SteamHost) {
    if super::steam_native::agent_host::installed(&host.prefix) {
        // The agent is not Valve's steam.exe; it watches for a stop file.
        force_stop(host);
        return;
    }
    let steam = steam_exe_in(&host.prefix);
    if steam.is_file() && host.wine.is_file() {
        let mut command = steam_runtime_command(&host.wine, &host.prefix);
        command
            .args(shutdown_argv(&steam))
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        if let Some(dir) = steam.parent() {
            command.current_dir(dir);
        }
        let cancel = AtomicBool::new(false);
        if let Ok(mut child) = command.spawn() {
            let _ =
                crate::runtimes::process::wait_bounded(&mut child, Duration::from_secs(8), &cancel);
        }
    }
    stop_steam_runtime(&host.wine, &host.prefix);
    super::steam_resident::stop_prefix(&host.prefix);
}

/// Where this start's lines begin in Steam's logs.
#[derive(Clone, Copy, Default)]
struct LogMarks {
    connection: u64,
    console: u64,
}

impl LogMarks {
    fn track(&mut self, root: &Path) {
        if log_len(root, "connection_log.txt") < self.connection {
            self.connection = 0;
        }
        if log_len(root, "console_log.txt") < self.console {
            self.console = 0;
        }
    }
}

/// Reads from a log file while permanently resetting the cursor to 0 if Steam
/// truncates or rotates the log mid-wait.
pub(crate) struct LogTracker {
    offset: u64,
    high_water: u64,
}

impl LogTracker {
    pub(crate) fn from_end(root: &Path, name: &str) -> Self {
        let offset = log_len(root, name);
        Self {
            offset,
            high_water: offset,
        }
    }

    pub(crate) fn read(&mut self, root: &Path, name: &str) -> String {
        let current = log_len(root, name);
        if current < self.high_water {
            self.offset = 0;
        }
        self.high_water = current;
        read_log_from(root, name, self.offset)
    }
}

pub(crate) fn prepare_fresh_logs(root: &Path) {
    let logs = root.join("logs");
    for (current, previous) in [
        ("connection_log.txt", "connection_log.previous.txt"),
        ("console_log.txt", "console_log.previous.txt"),
    ] {
        let from = logs.join(current);
        let Ok(meta) = from.symlink_metadata() else {
            continue;
        };
        if meta.file_type().is_symlink() || !meta.is_file() {
            continue;
        }
        let to = logs.join(previous);
        if to
            .symlink_metadata()
            .is_ok_and(|item| item.file_type().is_symlink())
        {
            continue;
        }
        let _ = std::fs::rename(&from, &to);
    }
}

struct ClientLogs<'a> {
    bootstrap: &'a str,
    connection: &'a str,
    console: &'a str,
}

fn ready(prefix: &Path, root: &Path, since: LogMarks, wait: ClientWait) -> bool {
    let connection = read_log_from(root, "connection_log.txt", since.connection);
    let console = read_log_from(root, "console_log.txt", since.console);
    client_ready(
        &process_commands(),
        prefix,
        server_alive(prefix),
        &ClientLogs {
            bootstrap: &read_log(root, "bootstrap_log.txt"),
            connection: &connection,
            console: &console,
        },
        wait,
    )
}

fn client_ready(
    commands: &str,
    prefix: &Path,
    server_alive: bool,
    logs: &ClientLogs,
    wait: ClientWait,
) -> bool {
    steam_running(commands, prefix)
        && server_alive
        && !bootstrap_busy(logs.bootstrap)
        && steam_account::connection_logged_on(logs.connection)
        && (wait == ClientWait::LoggedOn || startup_finished(logs.console))
}

/// Steam logs on before it serves games. A game that starts in between cannot
/// reach it, asks Steam to relaunch it, and exits 53.
fn startup_finished(console: &str) -> bool {
    console.contains("System startup time:")
}

/// Steam refused the saved login: it will not retry on its own.
pub(crate) fn logon_refused(connection: &str) -> bool {
    logon_refused_in(connection, "")
}

/// Steam refused the saved login in either `connection_log.txt` or `console_log.txt`.
pub(crate) fn logon_refused_in(connection: &str, console: &str) -> bool {
    const CONNECTION_REASONS: &[&str] = &[
        "'Invalid Password'",
        "'Expired'",
        "'Access Denied'",
        "'Revoked'",
        "'Account Logon Denied'",
        "'Invalid Login Auth Code'",
    ];
    const CONSOLE_FAILURES: &[&str] = &[
        "LogonFailure Access Denied",
        "LogonFailure Invalid Password",
        "LogonFailure Expired",
        "LogonFailure Revoked",
        "LogonFailure Account Logon Denied",
    ];
    connection.lines().any(|line| {
        (line.contains("RecvMsgClientLogOnResponse()")
            && CONNECTION_REASONS
                .iter()
                .any(|reason| line.contains(reason)))
            || (line.contains("Clearing in-memory token") && line.contains("LogonFailureReceived"))
    }) || connection.contains("Do not reconnect")
        || console.lines().any(|line| {
            CONSOLE_FAILURES
                .iter()
                .any(|failure| line.contains(failure))
        })
}

pub(crate) fn log_len(root: &Path, name: &str) -> u64 {
    std::fs::metadata(root.join("logs").join(name))
        .map(|meta| meta.len())
        .unwrap_or(0)
}

/// Whether this prefix's wineserver is alive: Wine names its socket after the
/// prefix directory's device and inode. A stale directory without a listening
/// socket means the server is gone.
fn server_alive(prefix: &Path) -> bool {
    // SAFETY: getuid has no preconditions.
    let uid = unsafe { libc::getuid() };
    server_socket_in(&PathBuf::from(format!("/tmp/.wine-{uid}")), prefix)
        .is_some_and(|socket| std::os::unix::net::UnixStream::connect(socket).is_ok())
}

fn server_socket_in(base: &Path, prefix: &Path) -> Option<PathBuf> {
    use std::os::unix::fs::MetadataExt;
    let meta = std::fs::metadata(prefix).ok()?;
    Some(
        base.join(format!("server-{:x}-{:x}", meta.dev(), meta.ino()))
            .join("socket"),
    )
}

/// Processes started for exactly this prefix (`WINEPREFIX=` in their
/// environment) whose server is gone. Never Orbit itself.
pub(crate) fn orphan_pids(listing: &str, prefix: &Path) -> Vec<u32> {
    let marker = format!("WINEPREFIX={}", prefix.to_string_lossy());
    let own = std::process::id();
    listing
        .lines()
        .filter_map(|line| {
            let line = line.trim_start();
            let (pid, rest) = line.split_once(char::is_whitespace)?;
            let pid: u32 = pid.parse().ok()?;
            let tagged = rest.match_indices(&marker).any(|(at, _)| {
                rest[at + marker.len()..]
                    .chars()
                    .next()
                    .map_or(true, char::is_whitespace)
            });
            (tagged && pid != own).then_some(pid)
        })
        .collect()
}

/// Put Valve's client back where the game and Orbit expect it.
fn restore_steam_exe(root: &Path) {
    let steam = root.join("steam.exe");
    let kept = root.join(KEPT_SUFFIX);
    if !steam.exists() && kept.is_file() {
        let _ = std::fs::rename(&kept, &steam);
    }
}

/// A container sees extra libraries through links in its own `C:` library, so
/// only that library is kept. Earlier builds appended the same drive library on
/// every launch, which Steam then reports as "not mounted".
/// Wine drives this container maps to install locations the person picked.
fn orbit_libraries(prefix: &Path) -> Vec<String> {
    super::install_locations::libraries()
        .iter()
        .filter_map(|library| super::steam_client_library::mapped_wine_drive(prefix, library))
        .collect()
}

fn repair_library_folders(root: &Path, keep: &[String]) {
    for file in ["steamapps/libraryfolders.vdf", "config/libraryfolders.vdf"] {
        let path = root.join(file);
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        if let Some(repaired) = known_libraries(&text, keep) {
            let _ = std::fs::write(&path, repaired);
        }
    }
}

/// Keeps the main library and Orbit's install-location drives, once each;
/// drops every other drive library. O(libraries + keep).
fn known_libraries(text: &str, keep: &[String]) -> Option<String> {
    use super::steam_client_library::library_key;
    let mut fields = steam_vdf::parse(text).ok()?;
    let (_, steam_vdf::Value::Object(libraries)) = fields.first_mut()? else {
        return None;
    };
    let keep: std::collections::HashSet<String> =
        keep.iter().map(|path| library_key(path)).collect();
    let mut seen = std::collections::HashSet::new();
    let before = libraries.len();
    libraries.retain(|(key, value)| match value {
        steam_vdf::Value::Object(entry) => entry.iter().any(|(name, path)| {
            name.eq_ignore_ascii_case("path")
                && matches!(path, steam_vdf::Value::Text(text)
                    if (is_main_library(text) || keep.contains(&library_key(text)))
                        && seen.insert(library_key(text)))
        }),
        // Non-library keys (contentstatsid and similar) stay.
        steam_vdf::Value::Text(_) => !key.chars().all(|c| c.is_ascii_digit()),
    });
    if libraries.len() == before {
        return None;
    }
    let mut index = 0;
    for (key, value) in libraries.iter_mut() {
        if matches!(value, steam_vdf::Value::Object(_)) {
            *key = index.to_string();
            index += 1;
        }
    }
    Some(steam_vdf::write(&fields))
}

fn is_main_library(path: &str) -> bool {
    path.replace("\\\\", "\\")
        .eq_ignore_ascii_case(r"C:\Program Files (x86)\Steam")
}

/// True when `user.reg` already disables Wine's systray icon, skipping a
/// redundant `reg add` Wine spawn on launch.
pub(crate) fn tray_already_hidden(prefix: &Path) -> bool {
    const LIMIT: u64 = 8 * 1024 * 1024;
    let path = prefix.join("user.reg");
    let Ok(meta) = path.symlink_metadata() else {
        return false;
    };
    if meta.file_type().is_symlink() || !meta.is_file() || meta.len() > LIMIT {
        return false;
    }
    let Ok(file) = std::fs::File::open(path) else {
        return false;
    };
    let mut text = String::new();
    if file.take(LIMIT + 1).read_to_string(&mut text).is_err() || text.len() as u64 > LIMIT {
        return false;
    }
    let mut in_explorer = false;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') {
            in_explorer = trimmed.starts_with(r"[Software\\Wine\\Explorer]");
            continue;
        }
        if in_explorer && trimmed == "\"ShowSystray\"=dword:00000000" {
            return true;
        }
    }
    false
}

pub(crate) fn hide_tray(host: &SteamHost, cancel: &AtomicBool) {
    if cancel.load(Ordering::Relaxed) {
        return;
    }
    let mut command = steam_runtime_command(&host.wine, &host.prefix);
    command
        .arg("reg")
        .arg("add")
        .args(crate::runtimes::settings::hide_tray_icons())
        .arg("/f")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    if let Ok(mut child) = command.spawn() {
        if let Err(err) =
            crate::runtimes::process::wait_bounded(&mut child, Duration::from_secs(20), cancel)
        {
            if !cancel.load(Ordering::Relaxed) {
                eprintln!("Wine systray setting did not finish cleanly: {err}");
            }
        }
    }
}

fn saved_account_name(loginusers: &Path) -> Option<String> {
    let file = std::fs::File::open(loginusers).ok()?;
    let mut content = String::new();
    file.take(1024 * 1024).read_to_string(&mut content).ok()?;
    steam_account::most_recent_account(&content).map(|account| account.name)
}

/// Steam stays logged off in silent mode unless this registry value names the
/// saved account. The account name is not a secret; the token stays in the
/// login files.
pub(crate) fn enable_auto_login(
    host: &SteamHost,
    account: &str,
    cancel: &AtomicBool,
) -> Result<(), String> {
    if cancel.load(Ordering::Relaxed) {
        return Err("Launch cancelled".into());
    }
    if !steam_account::valid_account_name(account) {
        return Err("Sign in with Steam before playing this game".into());
    }
    let mut command = steam_runtime_command(&host.wine, &host.prefix);
    command
        .args([
            "reg",
            "add",
            r"HKCU\Software\Valve\Steam",
            "/v",
            "AutoLoginUser",
            "/t",
            "REG_SZ",
            "/d",
            account,
            "/f",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let mut child = command
        .spawn()
        .map_err(|_| "Steam could not use the saved account for this game".to_string())?;
    let status =
        crate::runtimes::process::wait_bounded(&mut child, Duration::from_secs(15), cancel)
            .map_err(|_| {
                if cancel.load(Ordering::Relaxed) {
                    "Launch cancelled".to_string()
                } else {
                    "Steam could not use the saved account for this game".to_string()
                }
            })?;
    if !status.success() {
        return Err("Steam could not use the saved account for this game".into());
    }
    Ok(())
}

pub(crate) fn write_updater_lock(root: &Path) -> Result<(), String> {
    crate::runtimes::containers::steam::write_updater_config(
        root,
        "Steam could not skip its updater before play",
    )
}

fn bootstrap_busy(log: &str) -> bool {
    let Some(last) = log.lines().rev().find(|line| !line.trim().is_empty()) else {
        return false;
    };
    let last = last.to_ascii_lowercase();
    last.contains("verifying all executable checksums")
        || last.contains("verifying installation")
        || last.contains("checking for available updates")
        || last.contains("downloading manifest")
        || last.contains("updating steam")
}

fn read_log(root: &Path, name: &str) -> String {
    read_log_from(root, name, 0)
}

/// The log's last `LOG_LIMIT` bytes, starting no earlier than `offset`. A log
/// shorter than `offset` was rotated by Steam, so all of it is new.
pub(crate) fn read_log_from(root: &Path, name: &str, offset: u64) -> String {
    let path = root.join("logs").join(name);
    let Ok(metadata) = std::fs::metadata(&path) else {
        return String::new();
    };
    let Ok(mut file) = std::fs::File::open(&path) else {
        return String::new();
    };
    let offset = if offset > metadata.len() { 0 } else { offset };
    let start = offset.max(metadata.len().saturating_sub(LOG_LIMIT));
    if file.seek(SeekFrom::Start(start)).is_err() {
        return String::new();
    }
    let mut content = String::new();
    let _ = file.take(LOG_LIMIT).read_to_string(&mut content);
    content
}

fn process_commands() -> String {
    let Ok(output) = std::process::Command::new("ps")
        .args(["axeww", "-o", "command="])
        .output()
    else {
        return String::new();
    };
    if output.stdout.len() > 8 * 1024 * 1024 {
        return String::new();
    }
    String::from_utf8_lossy(&output.stdout).into_owned()
}

/// Whether Valve's client is running in this prefix right now.
pub(crate) fn client_running(prefix: &Path) -> bool {
    steam_running(&process_commands(), prefix)
}

fn steam_running(commands: &str, prefix: &Path) -> bool {
    let needle = prefix.to_string_lossy();
    !needle.is_empty()
        && commands.lines().any(|line| {
            line.contains(needle.as_ref()) && line.to_ascii_lowercase().contains("steam.exe")
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn duplicated_drive_libraries_collapse_to_the_main_library() {
        let mut text = String::from(
            "\"libraryfolders\"\n{\n\t\"contentstatsid\"\t\t\"1\"\n\t\"0\"\n\t{\n\t\t\"path\"\t\t\"C:\\\\Program Files (x86)\\\\Steam\"\n\t\t\"apps\"\n\t\t{\n\t\t\t\"883710\"\t\t\"1\"\n\t\t}\n\t}\n",
        );
        for index in 1..=33 {
            text.push_str(&format!(
                "\t\"{index}\"\n\t{{\n\t\t\"path\"\t\t\"S:\"\n\t}}\n"
            ));
        }
        text.push_str("}\n");
        let repaired = known_libraries(&text, &[]).expect("changed");
        assert_eq!(repaired.matches("\"path\"").count(), 1);
        assert!(repaired.contains("883710"));
        assert!(repaired.contains("contentstatsid"));
        assert!(!repaired.contains("\"S:\""));
        assert_eq!(known_libraries(&repaired, &[]), None, "already clean");
    }

    #[test]
    fn an_install_location_drive_stays_registered_once() {
        let mut text = String::from(
            "\"libraryfolders\"\n{\n\t\"0\"\n\t{\n\t\t\"path\"\t\t\"C:\\\\Program Files (x86)\\\\Steam\"\n\t}\n",
        );
        for (index, path) in ["S:\\\\", "S:", "T:\\\\"].iter().enumerate() {
            text.push_str(&format!(
                "\t\"{}\"\n\t{{\n\t\t\"path\"\t\t\"{path}\"\n\t}}\n",
                index + 1
            ));
        }
        text.push_str("}\n");
        let repaired = known_libraries(&text, &["S:\\".to_string()]).expect("changed");
        assert_eq!(repaired.matches("\"path\"").count(), 2, "{repaired}");
        assert!(!repaired.contains("T:"), "another drive library goes");
        assert_eq!(known_libraries(&repaired, &["S:\\".to_string()]), None);
    }

    #[test]
    fn a_kept_client_is_put_back_for_play() {
        let root = std::env::temp_dir().join(format!("orbit-cs-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join(KEPT_SUFFIX), b"MZ").unwrap();
        restore_steam_exe(&root);
        assert!(root.join("steam.exe").is_file());
        assert!(!root.join(KEPT_SUFFIX).exists());
        // An existing client is never replaced.
        fs::write(root.join(KEPT_SUFFIX), b"old").unwrap();
        restore_steam_exe(&root);
        assert_eq!(fs::read(root.join("steam.exe")).unwrap(), b"MZ");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn ready_only_with_this_containers_live_server_and_a_fresh_logon() {
        let prefix = Path::new("/c/games/steam-883710/prefix");
        let running = "/wine /c/games/steam-883710/prefix/drive_c/Program Files (x86)/Steam/steam.exe -silent";
        let other = "/wine /c/games/steam-550/prefix/drive_c/Program Files (x86)/Steam/steam.exe";
        let logged = "[2026-11-16 19:33:02] [Logged On, 4, 7] [U:1:280673132] RecvMsgClientLogOnResponse() : processing complete";
        let started = "[2026-11-17 09:59:53] System startup time: 27.85 seconds";
        let logs = |bootstrap, connection, console| ClientLogs {
            bootstrap,
            connection,
            console,
        };
        assert!(client_ready(
            running,
            prefix,
            true,
            &logs("", logged, started),
            ClientWait::Startup
        ));
        assert!(
            !client_ready(
                other,
                prefix,
                true,
                &logs("", logged, started),
                ClientWait::Startup
            ),
            "another container's Steam"
        );
        assert!(
            !client_ready(
                running,
                prefix,
                false,
                &logs("", logged, started),
                ClientWait::Startup
            ),
            "a client whose server is gone (a crashed session) is never ready"
        );
        assert!(!client_ready(
            running,
            prefix,
            true,
            &logs("Updating Steam...", logged, started),
            ClientWait::Startup
        ));
        assert!(!client_ready(
            running,
            prefix,
            true,
            &logs("", "[Logged Off, 0, 0] [U:1:0]", started),
            ClientWait::Startup
        ));
        assert!(
            !client_ready(
                running,
                prefix,
                true,
                &logs("", "", started),
                ClientWait::Startup
            ),
            "no fresh logon yet"
        );
    }

    #[test]
    fn a_logged_on_client_that_is_still_starting_up_is_not_ready() {
        // Regression: Play started the game at "Logged On" (09:57:30), seven
        // seconds before Steam finished starting. The game could not attach,
        // asked Steam to relaunch it (AppError_18), and exited 53.
        let prefix = Path::new("/c/games/steam-883710/prefix");
        let running = "/wine /c/games/steam-883710/prefix/drive_c/Program Files (x86)/Steam/steam.exe -silent";
        let logged = "[2026-11-17 09:57:30] [Logged On, 4, 7] [U:1:280673132] RecvMsgClientLogOnResponse() : processing complete";
        let starting = "[2026-11-17 09:57:30] Could not bind socket to 192.168.15.50:27036: 10048\n[2026-11-17 09:57:31] saving roaming config store to 'sharedconfig.vdf'";
        let logs = |console| ClientLogs {
            bootstrap: "",
            connection: logged,
            console,
        };
        assert!(!client_ready(
            running,
            prefix,
            true,
            &logs(starting),
            ClientWait::Startup
        ));
        let started =
            format!("{starting}\n[2026-11-17 09:57:37] System startup time: 36.21 seconds");
        assert!(client_ready(
            running,
            prefix,
            true,
            &logs(&started),
            ClientWait::Startup
        ));
    }

    #[test]
    fn a_download_goes_on_as_soon_as_the_client_is_logged_on() {
        // Steam starts a queued download at "Logged On"; waiting for the
        // rest of start-up kept the panel on "Signing in to Steam".
        let prefix = Path::new("/c/games/steam-883710/prefix");
        let running = "/wine /c/games/steam-883710/prefix/drive_c/Program Files (x86)/Steam/steam.exe -silent";
        let logged = "[2026-11-17 09:57:30] [Logged On, 4, 7] [U:1:280673132] RecvMsgClientLogOnResponse() : processing complete";
        let logs = |connection| ClientLogs {
            bootstrap: "",
            connection,
            console: "",
        };
        assert!(client_ready(
            running,
            prefix,
            true,
            &logs(logged),
            ClientWait::LoggedOn
        ));
        assert!(!client_ready(
            running,
            prefix,
            true,
            &logs(""),
            ClientWait::LoggedOn
        ));
        assert!(!client_ready(
            running,
            prefix,
            false,
            &logs(logged),
            ClientWait::LoggedOn
        ));
    }

    #[test]
    fn only_new_log_lines_count_after_a_fresh_start() {
        let root = std::env::temp_dir().join(format!("orbit-cs-log-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("logs")).unwrap();
        let log = root.join("logs/connection_log.txt");
        fs::write(&log, "[Logged On, 4, 7] [U:1:280673132] old session\n").unwrap();
        let since = log_len(&root, "connection_log.txt");
        assert!(!steam_account::connection_logged_on(&read_log_from(
            &root,
            "connection_log.txt",
            since
        )));
        fs::write(
            &log,
            format!(
                "{}[Logged On, 4, 7] [U:1:280673132] RecvMsgClientLogOnResponse() : processing complete\n",
                fs::read_to_string(&log).unwrap()
            ),
        )
        .unwrap();
        assert!(steam_account::connection_logged_on(&read_log_from(
            &root,
            "connection_log.txt",
            since
        )));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_rotated_log_is_read_from_its_start() {
        let root = std::env::temp_dir().join(format!("orbit-cs-rot-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("logs")).unwrap();
        let log = root.join("logs/console_log.txt");
        fs::write(&log, "x".repeat(4096)).unwrap();
        let since = log_len(&root, "console_log.txt");
        fs::write(&log, "System startup time: 30.00 seconds\n").unwrap();
        assert!(startup_finished(&read_log_from(
            &root,
            "console_log.txt",
            since
        )));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn the_server_socket_is_named_after_the_prefix_device_and_inode() {
        use std::os::unix::fs::MetadataExt;
        let root = std::env::temp_dir().join(format!("orbit-cs-sock-{}", uuid::Uuid::new_v4()));
        let prefix = root.join("prefix");
        fs::create_dir_all(&prefix).unwrap();
        let meta = fs::metadata(&prefix).unwrap();
        let socket = server_socket_in(&root, &prefix).unwrap();
        assert_eq!(
            socket,
            root.join(format!("server-{:x}-{:x}", meta.dev(), meta.ino()))
                .join("socket")
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn orphans_are_matched_by_this_exact_prefix_only() {
        let prefix = Path::new("/c/games/steam-883710/prefix");
        let listing = "  31086 C:\\Program Files (x86)\\Steam\\steam.exe steam://run/883710// WINEPREFIX=/c/games/steam-883710/prefix WINESERVER=/w/bin/wineserver\n  31087 C:\\windows\\system32\\services.exe WINEPREFIX=/c/games/steam-883710/prefix\n  40000 C:\\steam.exe WINEPREFIX=/c/games/steam-883710/prefix-old\n  40001 C:\\steam.exe WINEPREFIX=/c/games/steam-550/prefix\n  40002 /bin/zsh\n";
        assert_eq!(orphan_pids(listing, prefix), vec![31086, 31087]);
    }

    #[test]
    fn only_valves_client_in_this_prefix_counts_as_running() {
        // Regression: quitting Orbit ran `steam.exe -shutdown` with no client
        // up, which started one and left it behind.
        let prefix = Path::new("/Orbit/steam-windows/prefix");
        let helper = "C:\\Steam\\bin\\cef\\steamwebhelper.exe -lang=en WINEPREFIX=/Orbit/steam-windows/prefix";
        let other = "/Orbit/containers/games/steam-550/prefix/drive_c/Steam/steam.exe -silent";
        assert!(!steam_running(helper, prefix));
        assert!(!steam_running(other, prefix));
        let client = "/Orbit/steam-windows/prefix/drive_c/Program Files (x86)/Steam/steam.exe";
        assert!(steam_running(client, prefix));
    }

    #[test]
    fn a_saved_sign_in_goes_straight_to_valves_silent_client() {
        // Regression: Play tried the agent first on every launch. It cannot
        // open a steamclient pipe, so each Play lost about 68 seconds.
        assert_eq!(session_launch(true, false), SessionLaunch::Silent);
        assert_eq!(session_launch(true, true), SessionLaunch::Agent);
        assert_eq!(session_launch(false, false), SessionLaunch::SignInAgain);
        assert_eq!(session_launch(false, true), SessionLaunch::SignInAgain);
    }

    #[test]
    fn a_refused_saved_login_is_reported_instead_of_waited_on() {
        let refused = "[2026-11-16 21:44:08] [Logging On, 4, 7] [U:1:0] RecvMsgClientLogOnResponse() : [I:0:0] 'Invalid Password'\n[2026-11-16 21:44:08] [Logged Off, 0, 0] [U:1:0] Sending SteamServerConnectFailure_t Invalid Password Do not reconnect";
        assert!(logon_refused(refused));
        let denied = "[2026-11-24 18:48:13] [Logging On, 4, 7] [U:1:280673132] RecvMsgClientLogOnResponse() : [I:0:0] 'Access Denied'";
        assert!(logon_refused(denied));
        assert!(logon_refused_in(
            "",
            "[2026-11-24 18:48:13] LogonFailure Access Denied"
        ));
        assert!(!logon_refused_in(
            "",
            "[2026-11-24 18:49:20] LogonFailure No Connection"
        ));
        let ok = "[2026-11-16 19:33:02] [Logging On, 4, 7] [U:1:280673132] RecvMsgClientLogOnResponse() : [U:1:280673132] 'OK'";
        assert!(!logon_refused(ok));
        assert!(!logon_refused(
            "[Connecting, 0, 11] [U:1:0] Client thinks it can connect via: UDP - yes"
        ));
    }

    #[test]
    fn log_tracker_keeps_reading_refusals_after_steam_truncates_connection_log() {
        // Regression: Steam truncates `connection_log.txt` on launch and then grows
        // it past the previous file length; a raw byte offset skipped right past
        // the `Access Denied` lines written near the start of the new log.
        let root = std::env::temp_dir().join(format!("orbit-log-track-{}", uuid::Uuid::new_v4()));
        let logs = root.join("logs");
        fs::create_dir_all(&logs).unwrap();
        let conn = logs.join("connection_log.txt");
        fs::write(&conn, "x".repeat(7_000)).unwrap();
        let mut tracker = LogTracker::from_end(&root, "connection_log.txt");

        // Steam truncates on startup, then flushes past 7_000 bytes with refusal early on.
        let mut new_log = "prefix\n".repeat(400);
        new_log.push_str(
            "[2026-11-24 18:48:13] [Logging On, 4, 7] [U:1:280673132] RecvMsgClientLogOnResponse() : [I:0:0] 'Access Denied'\n",
        );
        fs::write(&conn, &new_log).unwrap();
        let first = tracker.read(&root, "connection_log.txt");
        assert!(logon_refused(&first));

        // Even if the log later outgrows 7_000 bytes, offset stays pinned at 0.
        let grown = format!("{new_log}{}", "ping\n".repeat(1_000));
        assert!(grown.len() > 7_000);
        fs::write(&conn, &grown).unwrap();
        assert!(logon_refused(&tracker.read(&root, "connection_log.txt")));

        prepare_fresh_logs(&root);
        assert!(!conn.exists());
        assert!(logs.join("connection_log.previous.txt").is_file());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn logon_refusal_invalidates_session_before_stopping_container() {
        let root = std::env::temp_dir().join(format!("orbit-refusal-{}", uuid::Uuid::new_v4()));
        let session_dir = root.join("session");
        let steam_prefix = root.join("steam-windows/prefix");
        let game_prefix = root.join("games/steam-1593500/prefix");
        let sync_prefix = root.join("steam-sync/prefix");

        super::super::steam_native::session::store_refresh(
            &session_dir,
            "orbit_user",
            "76561198000000000",
            "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhdWQiOlsiY2xpZW50Il0sInN1YiI6Ijc2NTYxMTk4MDAwMDAwMDAwIiwiZXhwIjoyMDAwMDAwMDAwfQ.sig",
        )
        .unwrap();
        for prefix in [&steam_prefix, &game_prefix, &sync_prefix] {
            fs::create_dir_all(prefix.join("drive_c/users/crossover/AppData/Local/Steam")).unwrap();
            fs::write(
                prefix.join("drive_c/users/crossover/AppData/Local/Steam/local.vdf"),
                "token-blob",
            )
            .unwrap();
            super::super::steam_native::session::apply_to_prefix(prefix, &session_dir).unwrap();
        }

        let mut cleared_before_stop = false;
        let err = handle_logon_refusal(
            &session_dir,
            &[&steam_prefix, &game_prefix, &sync_prefix],
            || {
                cleared_before_stop = !session_dir.join("native-session.json").exists()
                    && !steam_prefix
                        .join("drive_c/users/crossover/AppData/Local/Steam/local.vdf")
                        .exists()
                    && !sync_prefix
                        .join("drive_c/users/crossover/AppData/Local/Steam/local.vdf")
                        .exists();
            },
        )
        .unwrap_err();

        assert!(
            cleared_before_stop,
            "session and prefix tokens must be invalidated before stopping Wine so an interrupted stop cannot leave a rejected session Authorized"
        );
        assert_eq!(err, SIGN_IN_AGAIN);
        assert!(!super::super::steam_native::session::has_saved(
            &session_dir
        ));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn login_stage_detail_tracks_steam_startup_phases() {
        assert_eq!(
            login_stage_detail("", "", ClientWait::Startup),
            "Starting Steam for this game"
        );
        assert_eq!(
            login_stage_detail(
                "Connectivity test: result=Connected",
                "",
                ClientWait::Startup
            ),
            "Connecting to Steam"
        );
        assert_eq!(
            login_stage_detail(
                "",
                "[ None ] SetLoginState: WaitingForNetwork - OK",
                ClientWait::Startup
            ),
            "Connecting to Steam"
        );
        assert_eq!(
            login_stage_detail(
                "[Logging On, 4, 7] [U:1:280673132] Using JWT 123",
                "[ WaitingForNetwork ] Initiating LogOn",
                ClientWait::Startup
            ),
            "Signing in to Steam"
        );
        assert_eq!(
            login_stage_detail(
                "[Logged On, 4, 7] [U:1:280673132] RecvMsgClientLogOnResponse() : processing complete",
                "",
                ClientWait::Startup
            ),
            "Preparing Steam for launch"
        );
    }

    #[test]
    fn tray_already_hidden_reads_user_reg() {
        let root = std::env::temp_dir().join(format!("orbit-tray-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        assert!(!tray_already_hidden(&root));
        fs::write(
            root.join("user.reg"),
            "[Software\\\\Wine\\\\Explorer] 123\n\"ShowSystray\"=dword:00000001\n",
        )
        .unwrap();
        assert!(!tray_already_hidden(&root));
        fs::write(
            root.join("user.reg"),
            "[Software\\\\Wine\\\\Explorer] 123\n\"ShowSystray\"=dword:00000000\n",
        )
        .unwrap();
        assert!(tray_already_hidden(&root));
        let _ = fs::remove_dir_all(root);
    }
}
