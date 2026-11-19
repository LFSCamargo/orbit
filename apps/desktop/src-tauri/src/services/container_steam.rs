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
    super::steam_native::client_provision::provision_container(
        &crate::runtimes::root(),
        &host.prefix,
    )?;
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
        super::steam_native::agent_host::seed_saved_login(&host.wine, &host.prefix, &credentials)?;
        // Steam reads these at start and rewrites them on exit, so only now.
        if let Err(err) =
            super::steam_play_config::apply(&root, &credentials.steam_id, app_id, config)
        {
            eprintln!("Steam play options were not applied: {err}");
        }
    }
    start_silent_client(host, cancel, wait)
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

fn start_silent_client(
    host: &SteamHost,
    cancel: &AtomicBool,
    wait: ClientWait,
) -> Result<(), String> {
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
        enable_auto_login(host, &account)?;
    }
    repair_library_folders(&root);
    if ready(&host.prefix, &root, LogMarks::default(), wait) {
        return Ok(());
    }
    // Not ready means not usable: a client stuck on a refused login, or one
    // left without a server by a crashed session. No game runs yet, so stop
    // this container's leftovers and start one client with the current login.
    if steam_running(&process_commands(), &host.prefix) {
        if server_alive(&host.prefix) {
            shutdown(host);
        }
        super::steam_resident::stop_prefix(&host.prefix);
    }
    hide_tray(host);
    // Only log lines written from here on can prove this client logged on.
    let since = LogMarks {
        connection: log_len(&root, "connection_log.txt"),
        console: log_len(&root, "console_log.txt"),
    };
    {
        let _ = std::fs::remove_file(root.join("steam.pid"));
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
            return Err("Launch cancelled".into());
        }
        if ready(&host.prefix, &root, since, wait) {
            return Ok(());
        }
        if logon_refused(&read_log_from(
            &root,
            "connection_log.txt",
            since.connection,
        )) {
            // Steam would wait on a hidden sign-in window forever.
            shutdown(host);
            return Err(
                "Your saved Steam sign-in is no longer valid. Sign in again from Settings → Steam, then press Play"
                    .into(),
            );
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    if bootstrap_busy(&read_log(&root, "bootstrap_log.txt")) {
        Err("Steam is still updating for this game. Press Play again in a moment".into())
    } else {
        Err("Steam did not sign in for this game. Sign in again from Settings → Steam".into())
    }
}

/// Ask the container's Steam to exit, then stop everything left in the prefix.
pub fn shutdown(host: &SteamHost) {
    if super::steam_native::agent_host::installed(&host.prefix) {
        // The agent is not Valve's steam.exe; it watches for a stop file.
        super::steam_native::agent_host::request_stop(&host.prefix);
        stop_steam_runtime(&host.wine, &host.prefix);
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
}

/// Where this start's lines begin in Steam's logs.
#[derive(Clone, Copy, Default)]
struct LogMarks {
    connection: u64,
    console: u64,
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
fn logon_refused(connection: &str) -> bool {
    connection.lines().any(|line| {
        line.contains("RecvMsgClientLogOnResponse()")
            && [
                "'Invalid Password'",
                "'Expired'",
                "'Access Denied'",
                "'Revoked'",
                "'Account Logon Denied'",
            ]
            .iter()
            .any(|reason| line.contains(reason))
    }) || connection.contains("Do not reconnect")
}

fn log_len(root: &Path, name: &str) -> u64 {
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
fn repair_library_folders(root: &Path) {
    for file in ["steamapps/libraryfolders.vdf", "config/libraryfolders.vdf"] {
        let path = root.join(file);
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        if let Some(repaired) = only_main_library(&text) {
            let _ = std::fs::write(&path, repaired);
        }
    }
}

fn only_main_library(text: &str) -> Option<String> {
    let mut fields = steam_vdf::parse(text).ok()?;
    let (_, steam_vdf::Value::Object(libraries)) = fields.first_mut()? else {
        return None;
    };
    let before = libraries.len();
    libraries.retain(|(key, value)| match value {
        steam_vdf::Value::Object(entry) => entry.iter().any(|(name, path)| {
            name.eq_ignore_ascii_case("path")
                && matches!(path, steam_vdf::Value::Text(text) if is_main_library(text))
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

fn hide_tray(host: &SteamHost) {
    let mut command = steam_runtime_command(&host.wine, &host.prefix);
    command
        .arg("reg")
        .arg("add")
        .args(crate::runtimes::settings::hide_tray_icons())
        .arg("/f")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let cancel = AtomicBool::new(false);
    if let Ok(mut child) = command.spawn() {
        let _ =
            crate::runtimes::process::wait_bounded(&mut child, Duration::from_secs(20), &cancel);
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
fn enable_auto_login(host: &SteamHost, account: &str) -> Result<(), String> {
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
    let cancel = AtomicBool::new(false);
    let mut child = command
        .spawn()
        .map_err(|_| "Steam could not use the saved account for this game".to_string())?;
    let status =
        crate::runtimes::process::wait_bounded(&mut child, Duration::from_secs(15), &cancel)
            .map_err(|_| "Steam could not use the saved account for this game".to_string())?;
    if !status.success() {
        return Err("Steam could not use the saved account for this game".into());
    }
    Ok(())
}

fn write_updater_lock(root: &Path) -> Result<(), String> {
    let path = root.join("steam.cfg");
    if path
        .symlink_metadata()
        .is_ok_and(|meta| meta.file_type().is_symlink())
    {
        return Err("Steam configuration cannot be a symlink".into());
    }
    std::fs::write(
        &path,
        "BootStrapperInhibitAll = Enable\nBootStrapperForceSelfUpdate = False\n",
    )
    .map_err(|_| "Steam could not skip its updater before play".to_string())
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
fn read_log_from(root: &Path, name: &str, offset: u64) -> String {
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
        let repaired = only_main_library(&text).expect("changed");
        assert_eq!(repaired.matches("\"path\"").count(), 1);
        assert!(repaired.contains("883710"));
        assert!(repaired.contains("contentstatsid"));
        assert!(!repaired.contains("\"S:\""));
        assert_eq!(only_main_library(&repaired), None, "already clean");
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
        let ok = "[2026-11-16 19:33:02] [Logging On, 4, 7] [U:1:280673132] RecvMsgClientLogOnResponse() : [U:1:280673132] 'OK'";
        assert!(!logon_refused(ok));
        assert!(!logon_refused(
            "[Connecting, 0, 11] [U:1:0] Client thinks it can connect via: UDP - yes"
        ));
    }
}
