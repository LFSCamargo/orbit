//! Run Orbit's in-container Steam agent. The agent (`assets/orbit-steam-agent.exe`,
//! built by `helpers/steam-agent`) is written into the container as its
//! `steam.exe`, handed the saved login through a 0600 file, and started under
//! Wine. It wraps the token, hosts Valve's `steamclient64.dll` as the logged-on
//! IPC master, and signals readiness. This is the agent half of the presence
//! choice in `steam_native::agent`; the silent-client half stays in
//! `services::container_steam`. The token is never logged.
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use serde::Serialize;

use super::session::AgentCredentials;
use crate::runtimes::containers::steam::steam_root;
use crate::services::steam_windows::hidden_steam_command;

const AGENT: &[u8] = include_bytes!("../../../assets/orbit-steam-agent.exe");
/// The container's Steam folder as Wine maps it, for paths handed to the agent.
const STEAM_DIR_WIN: &str = r"C:\Program Files (x86)\Steam";
const CONTROL_REL: &str = ".orbit-agent";
const READY_TIMEOUT: Duration = Duration::from_secs(90);

/// The request Orbit writes for one launch. Mirrors the agent's `session::Request`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Request<'a> {
    account_name: &'a str,
    steam_id: &'a str,
    refresh_token: &'a str,
    steam_dir: &'a str,
    local_vdf: &'a str,
}

/// Every agent build carries this string; Valve's client never does.
const AGENT_MARKER: &[u8] = b"ORBIT_AGENT_SESSION";
const AGENT_SIZE_LIMIT: u64 = 4 * 1024 * 1024;

/// Whether this container's `steam.exe` is Orbit's agent, not Valve's client.
pub fn installed(prefix: &Path) -> bool {
    is_agent(&steam_root(prefix).join("steam.exe"))
}

/// Any build of Orbit's agent, so an older one is replaced rather than kept
/// as Valve's client.
fn is_agent(path: &Path) -> bool {
    let Ok(meta) = path.symlink_metadata() else {
        return false;
    };
    if !meta.is_file() || meta.len() > AGENT_SIZE_LIMIT {
        return false;
    }
    std::fs::read(path).is_ok_and(|bytes| {
        bytes
            .windows(AGENT_MARKER.len())
            .any(|window| window == AGENT_MARKER)
    })
}

/// Install the agent as the container's `steam.exe`. Valve's client DLLs must
/// already sit beside it (provisioned separately). A linked official `steam.exe`
/// is kept as `steam.exe.valve` so a failed agent logon can fall back to it.
pub fn install(prefix: &Path) -> Result<(), String> {
    let steam = steam_root(prefix).join("steam.exe");
    if let Some(parent) = steam.parent() {
        std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    preserve_valve_exe(&steam)?;
    if steam
        .symlink_metadata()
        .is_ok_and(|meta| meta.file_type().is_symlink())
    {
        std::fs::remove_file(&steam).map_err(|err| err.to_string())?;
    }
    // Replace only when the bytes differ, so a running agent is not disturbed.
    if std::fs::read(&steam).is_ok_and(|current| current == AGENT) {
        return Ok(());
    }
    std::fs::write(&steam, AGENT).map_err(|err| err.to_string())
}

/// Put Valve's `steam.exe` back after the agent could not sign in.
pub fn restore_valve_client(prefix: &Path) -> bool {
    let steam = steam_root(prefix).join("steam.exe");
    let stash = steam.with_file_name("steam.exe.valve");
    if !stash.exists() {
        return false;
    }
    if steam.symlink_metadata().is_ok() {
        let _ = std::fs::remove_file(&steam);
    }
    if stash
        .symlink_metadata()
        .is_ok_and(|meta| meta.file_type().is_symlink())
    {
        let Ok(target) = std::fs::read_link(&stash) else {
            return false;
        };
        return std::os::unix::fs::symlink(target, &steam).is_ok();
    }
    std::fs::copy(&stash, &steam).is_ok()
}

fn preserve_valve_exe(steam: &Path) -> Result<(), String> {
    let stash = steam.with_file_name("steam.exe.valve");
    if stash.exists() {
        return Ok(());
    }
    let Ok(meta) = steam.symlink_metadata() else {
        return Ok(());
    };
    if meta.file_type().is_symlink() {
        let target = std::fs::read_link(steam).map_err(|err| err.to_string())?;
        return std::os::unix::fs::symlink(target, &stash).map_err(|err| err.to_string());
    }
    if meta.is_file() && !is_agent(steam) {
        std::fs::copy(steam, &stash)
            .map(|_| ())
            .map_err(|err| err.to_string())?;
    }
    Ok(())
}

/// `drive_c/users/<user>/AppData/Local/Steam/local.vdf` for the container's one
/// real user (never `Public`), as both a disk path and a Wine `C:` path.
/// Largest `user.reg` read to find the profile Wine runs as.
const USER_REG_LIMIT: u64 = 8 * 1024 * 1024;

/// The Windows user Wine runs Steam as, from `APPDATA` in the prefix's
/// `user.reg`. Orbit Wine runs as `crossover` while the clone also carries a
/// profile named after the Mac user; Steam only reads the active one.
pub(crate) fn profile_user(prefix: &Path) -> Option<String> {
    let path = prefix.join("user.reg");
    if std::fs::metadata(&path).ok()?.len() > USER_REG_LIMIT {
        return None;
    }
    let text = std::fs::read_to_string(&path).ok()?;
    text.lines().find_map(|line| {
        let rest = line.strip_prefix(r#""APPDATA"="C:\\users\\"#)?;
        let name = rest.split(r"\\").next()?;
        let usable = !name.is_empty()
            && name.len() <= 64
            && name != "Public"
            && !name.contains(['/', '"'])
            && !name.starts_with('.')
            && prefix.join("drive_c/users").join(name).is_dir();
        usable.then(|| name.to_string())
    })
}

/// The active profile's `local.vdf`, on disk and as Wine sees it. Without a
/// readable `user.reg`, the first real profile in name order.
fn local_vdf_paths(prefix: &Path) -> Result<(PathBuf, String), String> {
    let name = match profile_user(prefix) {
        Some(name) => name,
        None => {
            let users = prefix.join("drive_c/users");
            let entries =
                std::fs::read_dir(&users).map_err(|_| "Container has no users".to_string())?;
            let mut names: Vec<String> = entries
                .take(16)
                .flatten()
                .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
                .filter_map(|entry| entry.file_name().to_str().map(str::to_string))
                .filter(|name| name != "Public")
                .collect();
            names.sort();
            names
                .into_iter()
                .next()
                .ok_or("Container has no Steam user profile")?
        }
    };
    let disk = prefix
        .join("drive_c/users")
        .join(&name)
        .join("AppData/Local/Steam/local.vdf");
    let win = format!(r"C:\users\{name}\AppData\Local\Steam\local.vdf");
    Ok((disk, win))
}

/// Start the agent and wait until it reports Logged On. The game is launched by
/// the caller afterwards; the agent stays the IPC master until the prefix's
/// Steam processes are stopped.
pub fn ensure_running(
    wine: &Path,
    prefix: &Path,
    credentials: &AgentCredentials,
    cancel: &AtomicBool,
) -> Result<(), String> {
    install(prefix)?;
    let (local_disk, local_win) = local_vdf_paths(prefix)?;
    if let Some(parent) = local_disk.parent() {
        std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let control = steam_root(prefix).join(CONTROL_REL);
    std::fs::create_dir_all(&control).map_err(|err| err.to_string())?;
    let ready = control.join("ready");
    let stop = control.join("stop");
    let _ = std::fs::remove_file(&ready);
    let _ = std::fs::remove_file(&stop);

    let request = serde_json::to_vec(&Request {
        account_name: &credentials.account_name,
        steam_id: &credentials.steam_id,
        refresh_token: &credentials.refresh_token,
        steam_dir: STEAM_DIR_WIN,
        local_vdf: &local_win,
    })
    .map_err(|_| "Agent request could not be built".to_string())?;
    let session_file = write_private(&control.join("session.json"), &request)?;

    let control_win = format!(r"{STEAM_DIR_WIN}\{CONTROL_REL}");
    let mut command = hidden_steam_command(wine, prefix);
    command
        .arg(format!(r"{STEAM_DIR_WIN}\steam.exe"))
        .env(
            "ORBIT_AGENT_SESSION",
            format!(r"{control_win}\session.json"),
        )
        .env("ORBIT_AGENT_READY", format!(r"{control_win}\ready"))
        .env("ORBIT_AGENT_STOP", format!(r"{control_win}\stop"))
        .current_dir(steam_root(prefix))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let mut child = command
        .spawn()
        .map_err(|_| "Windows Steam agent could not be started for this game".to_string())?;

    let deadline = Instant::now() + READY_TIMEOUT;
    loop {
        if cancel.load(Ordering::Relaxed) {
            stop_child(&mut child);
            let _ = std::fs::remove_file(&session_file);
            return Err("Launch cancelled".into());
        }
        if ready.is_file() {
            // The request held the token in the clear; it is gone once read, but
            // remove it here too in case the agent could not. The process stays
            // the IPC master until Play stops the container.
            let _ = std::fs::remove_file(&session_file);
            detach(child);
            return Ok(());
        }
        match child.try_wait() {
            Ok(Some(_)) => {
                let _ = std::fs::remove_file(&session_file);
                return Err(AGENT_SIGN_IN.into());
            }
            Ok(None) => {}
            Err(_) => {
                stop_child(&mut child);
                let _ = std::fs::remove_file(&session_file);
                return Err(AGENT_SIGN_IN.into());
            }
        }
        if Instant::now() >= deadline {
            stop_child(&mut child);
            let _ = std::fs::remove_file(&session_file);
            return Err(AGENT_SIGN_IN.into());
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

const HELPER_TIMEOUT: Duration = Duration::from_secs(30);
const HELPER_EXE: &str = "orbit-steam-agent.exe";

/// The agent written beside Valve's client (never over it) for one-shot runs.
fn helper_exe(prefix: &Path) -> Option<PathBuf> {
    let control = steam_root(prefix).join(CONTROL_REL);
    std::fs::create_dir_all(&control).ok()?;
    let exe = control.join(HELPER_EXE);
    if exe
        .symlink_metadata()
        .is_ok_and(|meta| meta.file_type().is_symlink())
    {
        return None;
    }
    if !std::fs::read(&exe).is_ok_and(|current| current == AGENT) {
        std::fs::write(&exe, AGENT).ok()?;
    }
    Some(exe)
}

fn run_helper(mut command: std::process::Command, cancel: &AtomicBool) -> Result<bool, String> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let mut child = command.spawn().map_err(|_| SEED_FAILED.to_string())?;
    match crate::runtimes::process::wait_bounded(&mut child, HELPER_TIMEOUT, cancel) {
        Ok(status) => Ok(status.success()),
        Err(_) if cancel.load(Ordering::Relaxed) => Err("Launch cancelled".into()),
        Err(_) => Ok(false),
    }
}

/// Write the saved login into this container with the container's own Wine.
/// Steam's ConnectCache is DPAPI-wrapped, and a blob wrapped by another Wine
/// build does not unwrap here, so a copied `local.vdf` is not enough.
pub fn seed_saved_login(
    wine: &Path,
    prefix: &Path,
    credentials: &AgentCredentials,
) -> Result<(), String> {
    seed_saved_login_with_cancel(wine, prefix, credentials, &AtomicBool::new(false))
}

/// Variant of `seed_saved_login` that aborts immediately when `cancel` is set.
pub fn seed_saved_login_with_cancel(
    wine: &Path,
    prefix: &Path,
    credentials: &AgentCredentials,
    cancel: &AtomicBool,
) -> Result<(), String> {
    if cancel.load(Ordering::Relaxed) {
        return Err("Launch cancelled".into());
    }
    let (local_disk, local_win) = local_vdf_paths(prefix)?;
    if let Some(parent) = local_disk.parent() {
        std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let exe = helper_exe(prefix).ok_or(SEED_FAILED)?;
    let control = steam_root(prefix).join(CONTROL_REL);
    let request = serde_json::to_vec(&Request {
        account_name: &credentials.account_name,
        steam_id: &credentials.steam_id,
        refresh_token: &credentials.refresh_token,
        steam_dir: STEAM_DIR_WIN,
        local_vdf: &local_win,
    })
    .map_err(|_| SEED_FAILED.to_string())?;
    let session = write_private(&control.join("session.json"), &request)?;
    let mut command = hidden_steam_command(wine, prefix);
    command
        .arg(&exe)
        .env(
            "ORBIT_AGENT_SESSION",
            format!(r"{STEAM_DIR_WIN}\{CONTROL_REL}\session.json"),
        )
        .env("ORBIT_AGENT_SEED_ONLY", "1")
        .current_dir(&control);
    let result = run_helper(command, cancel);
    if let Err(err) = std::fs::remove_file(&session) {
        if err.kind() != std::io::ErrorKind::NotFound {
            eprintln!("Temporary Steam agent request could not be removed: {err}");
        }
    }
    match result {
        Ok(true) => Ok(()),
        Ok(false) => Err(SEED_FAILED.into()),
        Err(err) => Err(err),
    }
}

const SEED_FAILED: &str =
    "Steam's saved sign-in could not be prepared for this game. Sign in again from Settings → Steam";

/// Read back the token Valve's sign-in window saved in this prefix's
/// `ConnectCache`. DPAPI only unwraps inside Wine, so the agent runs once in
/// unwrap mode beside Valve's client, which it never replaces. The token file
/// is created 0600 and removed after reading. Returns `None` on any failure.
pub fn unwrap_saved_token(wine: &Path, prefix: &Path, account: &str) -> Option<String> {
    if !crate::utils::steam_account::valid_account_name(account) {
        return None;
    }
    let (local_disk, local_win) = local_vdf_paths(prefix).ok()?;
    if !local_disk.is_file() {
        return None;
    }
    let exe = helper_exe(prefix)?;
    let control = steam_root(prefix).join(CONTROL_REL);
    let out = control.join("token");
    let _ = std::fs::remove_file(&out);
    write_private(&out, b"").ok()?;
    let mut command = hidden_steam_command(wine, prefix);
    command
        .arg(&exe)
        .env("ORBIT_AGENT_UNWRAP", &local_win)
        .env("ORBIT_AGENT_ACCOUNT", account)
        .env(
            "ORBIT_AGENT_OUT",
            format!(r"{STEAM_DIR_WIN}\{CONTROL_REL}\token"),
        )
        .current_dir(&control);
    let cancel = AtomicBool::new(false);
    let unwrapped = run_helper(command, &cancel).unwrap_or(false);
    let token = std::fs::read(&out).ok();
    if let Err(err) = std::fs::remove_file(&out) {
        if err.kind() != std::io::ErrorKind::NotFound {
            eprintln!("Temporary Steam unwrap token file could not be removed: {err}");
        }
    }
    if !unwrapped {
        return None;
    }
    let token = String::from_utf8(token?).ok()?;
    let token = token.trim();
    (!token.is_empty()).then(|| token.to_string())
}

const AGENT_SIGN_IN: &str =
    "The Steam agent did not sign in for this game. Sign in again from Settings → Steam";

fn stop_child(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

/// Reap the agent when it exits without blocking Play. Killing it here would
/// drop the Steam session the game still needs.
fn detach(mut child: Child) {
    std::thread::spawn(move || {
        let _ = child.wait();
    });
}

/// Ask a running agent to log off and exit by dropping its stop file.
pub fn request_stop(prefix: &Path) {
    let _ = std::fs::write(steam_root(prefix).join(CONTROL_REL).join("stop"), b"1");
}

fn write_private(path: &Path, bytes: &[u8]) -> Result<PathBuf, String> {
    if path
        .symlink_metadata()
        .is_ok_and(|meta| meta.file_type().is_symlink())
    {
        return Err("Agent control file cannot be a symlink".into());
    }
    let mut file = std::fs::File::create(path).map_err(|err| err.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = file.set_permissions(std::fs::Permissions::from_mode(0o600));
    }
    file.write_all(bytes).map_err(|err| err.to_string())?;
    Ok(path.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn installs_the_agent_as_steam_exe_and_is_idempotent() {
        let root = std::env::temp_dir().join(format!("orbit-agent-host-{}", uuid::Uuid::new_v4()));
        install(&root).unwrap();
        let steam = steam_root(&root).join("steam.exe");
        assert_eq!(fs::read(&steam).unwrap(), AGENT);
        // A second install is a no-op (bytes already match).
        let before = fs::metadata(&steam).unwrap().modified().unwrap();
        install(&root).unwrap();
        assert_eq!(fs::metadata(&steam).unwrap().modified().unwrap(), before);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn locates_the_single_real_user_profile() {
        let root = std::env::temp_dir().join(format!("orbit-agent-user-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("drive_c/users/Public")).unwrap();
        fs::create_dir_all(root.join("drive_c/users/player")).unwrap();
        let (disk, win) = local_vdf_paths(&root).unwrap();
        assert!(disk.ends_with("player/AppData/Local/Steam/local.vdf"));
        assert_eq!(win, r"C:\users\player\AppData\Local\Steam\local.vdf");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn seeds_the_profile_wine_runs_steam_as() {
        // Regression: a clone holds `crossover` (Orbit Wine's user) and the
        // Mac user's profile. The token went to whichever the folder listing
        // gave first; Steam, running as `crossover`, waited for credentials
        // and "Steam did not sign in for this game" followed.
        let root = std::env::temp_dir().join(format!("orbit-agent-user-{}", uuid::Uuid::new_v4()));
        for name in ["Public", "crossover", "aaa-mac-user"] {
            fs::create_dir_all(root.join("drive_c/users").join(name)).unwrap();
        }
        fs::write(
            root.join("user.reg"),
            "[Volatile Environment] 1794889129\n\"APPDATA\"=\"C:\\\\users\\\\crossover\\\\AppData\\\\Roaming\"\n",
        )
        .unwrap();
        assert_eq!(profile_user(&root).as_deref(), Some("crossover"));
        let (disk, win) = local_vdf_paths(&root).unwrap();
        assert!(disk.ends_with("crossover/AppData/Local/Steam/local.vdf"));
        assert_eq!(win, r"C:\users\crossover\AppData\Local\Steam\local.vdf");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn an_unusable_profile_in_user_reg_is_ignored() {
        let root = std::env::temp_dir().join(format!("orbit-agent-user-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("drive_c/users/player")).unwrap();
        fs::write(
            root.join("user.reg"),
            "\"APPDATA\"=\"C:\\\\users\\\\..\\\\AppData\\\\Roaming\"\n",
        )
        .unwrap();
        assert_eq!(profile_user(&root), None);
        assert!(local_vdf_paths(&root)
            .unwrap()
            .0
            .ends_with("player/AppData/Local/Steam/local.vdf"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn install_keeps_a_linked_valve_client_for_fallback() {
        let root = std::env::temp_dir().join(format!("orbit-agent-link-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let valve = root.join("valve-steam.exe");
        fs::write(&valve, b"MZVALVE").unwrap();
        let steam_dir = steam_root(&root);
        fs::create_dir_all(&steam_dir).unwrap();
        std::os::unix::fs::symlink(&valve, steam_dir.join("steam.exe")).unwrap();
        install(&root).unwrap();
        assert!(installed(&root));
        assert_eq!(fs::read(steam_dir.join("steam.exe")).unwrap(), AGENT);
        assert!(restore_valve_client(&root));
        assert!(!installed(&root));
        assert_eq!(fs::read(steam_dir.join("steam.exe")).unwrap(), b"MZVALVE");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn an_older_agent_build_is_replaced_and_never_kept_as_valves_client() {
        let root = std::env::temp_dir().join(format!("orbit-agent-old-{}", uuid::Uuid::new_v4()));
        let steam_dir = steam_root(&root);
        fs::create_dir_all(&steam_dir).unwrap();
        fs::write(
            steam_dir.join("steam.exe"),
            b"MZ old ORBIT_AGENT_SESSION build",
        )
        .unwrap();
        assert!(installed(&root));
        install(&root).unwrap();
        assert_eq!(fs::read(steam_dir.join("steam.exe")).unwrap(), AGENT);
        assert!(!steam_dir.join("steam.exe.valve").exists());
        assert!(!restore_valve_client(&root));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn stop_request_drops_the_stop_file() {
        let root = std::env::temp_dir().join(format!("orbit-agent-stop-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(steam_root(&root).join(CONTROL_REL)).unwrap();
        request_stop(&root);
        assert!(steam_root(&root).join(CONTROL_REL).join("stop").is_file());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn seed_saved_login_returns_cancelled_without_spawning_wine() {
        let root =
            std::env::temp_dir().join(format!("orbit-agent-cancel-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("drive_c/users/crossover")).unwrap();
        let cancel = AtomicBool::new(true);
        let creds = AgentCredentials {
            account_name: "orbit_user".into(),
            steam_id: "76561198000000000".into(),
            refresh_token: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.payload.signature".into(),
        };
        let err =
            seed_saved_login_with_cancel(Path::new("/nonexistent/wine"), &root, &creds, &cancel)
                .unwrap_err();
        assert_eq!(err, "Launch cancelled");
        assert!(!root
            .join("drive_c/users/crossover/AppData/Local/Steam/local.vdf")
            .exists());
        let _ = fs::remove_dir_all(root);
    }
}
