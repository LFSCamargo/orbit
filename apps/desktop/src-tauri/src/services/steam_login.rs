//! Steam's own login window, hosted over Orbit's sign-in dialog.
//! The window contains both the account form and the QR code. CEF rasterizes
//! in-process: Wine's GDI renderer and SwiftShader leave this window black.

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::Duration;

use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::database::GameRepository;
use crate::services::steam_windows::{self, SteamWindowsStatus};

pub const LOGIN_WINDOW_WIDTH: i32 = 840;
pub const LOGIN_WINDOW_HEIGHT: i32 = 520;
const LOGIN_FLAGS: [&str; 6] = [
    "-cef-disable-gpu",
    "-cef-disable-gpu-compositing",
    "-cef-in-process-gpu",
    "-cef-use-gl=disabled",
    "-no-cef-sandbox",
    "-noverifyfiles",
];
/// No menu entries, and no controllers: the sign-in Steam would claim an
/// XInput USB pad and open Big Picture on its Guide button.
const LOGIN_DLLS: &str = "winemenubuilder.exe=d;winebus.sys=d";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamLoginPoll {
    pub done: bool,
    pub status: Option<SteamWindowsStatus>,
    pub library_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamLoginPlacement {
    pub placed: bool,
}

pub struct SteamLoginSession {
    child: Option<Child>,
    active: bool,
    restore_fullscreen: bool,
}

impl SteamLoginSession {
    pub fn new() -> Self {
        Self {
            child: None,
            active: false,
            restore_fullscreen: false,
        }
    }

    pub fn is_active(&self) -> bool {
        self.active
    }
}

fn inhibit_login_updater(steam_exe: &Path) -> Result<(), String> {
    let root = steam_exe
        .parent()
        .ok_or("Steam's sign-in window is not ready")?;
    crate::runtimes::containers::steam::write_updater_config(
        root,
        "Steam could not skip its updater before sign-in",
    )
}

pub fn login_argv(steam_exe: &Path) -> Vec<String> {
    let mut args = vec![steam_exe.to_string_lossy().into_owned()];
    args.extend(LOGIN_FLAGS.iter().map(|flag| (*flag).to_string()));
    args
}

pub fn login_command(wine: &Path, prefix: &Path, steam_exe: &Path) -> Result<Command, String> {
    if !steam_exe.is_file() {
        return Err("Steam's sign-in window is not ready".into());
    }
    super::steam_browser::prepare(steam_exe).map_err(|err| format!("{err:#}"))?;
    inhibit_login_updater(steam_exe)?;
    let mut command = steam_windows::steam_runtime_command(wine, prefix);
    command.args(login_argv(steam_exe));
    command.env("WINEDLLOVERRIDES", LOGIN_DLLS);
    if let Some(dir) = steam_exe.parent() {
        command.current_dir(dir);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    Ok(command)
}

pub fn spawn_login(
    slot: &Mutex<SteamLoginSession>,
    wine: &Path,
    prefix: &Path,
    steam_exe: &Path,
) -> Result<(), String> {
    {
        let session = slot.lock();
        if session.active {
            steam_windows::set_login_window_running(true);
            return Ok(());
        }
    }
    let mut command = login_command(wine, prefix, steam_exe)?;
    let mut session = slot.lock();
    if session.active {
        steam_windows::set_login_window_running(true);
        return Ok(());
    }
    session.active = true;
    match command.spawn() {
        Ok(child) => {
            session.child = Some(child);
            steam_windows::set_login_window_running(true);
            Ok(())
        }
        Err(_) => {
            session.active = false;
            Err("Steam's sign-in window could not be opened".into())
        }
    }
}

pub fn open(_app: &AppHandle, slot: &Mutex<SteamLoginSession>) -> Result<(), String> {
    steam_windows::begin_sign_in();
    slot.lock().active = false;
    // A client that is already logged on only needs its token stored. Opening
    // another Steam window would leave that Wine process running.
    if steam_windows::saved_client_waiting() {
        return Ok(());
    }
    let (wine, prefix, steam) = steam_windows::prepare_client_sign_in()?;
    if steam_windows::sign_in_cancelled() {
        return Ok(());
    }
    spawn_login(slot, &wine, &prefix, &steam)
}

pub fn place(
    app: &AppHandle,
    slot: &Mutex<SteamLoginSession>,
    css_x: i32,
    css_y: i32,
    width: i32,
    height: i32,
) -> Result<SteamLoginPlacement, String> {
    if !slot.lock().active {
        return Ok(SteamLoginPlacement { placed: false });
    }
    let (x, y) = login_screen_origin(app, css_x as f64, css_y as f64);
    let steam_exe = steam_windows::steam_exe();
    let steam_root = steam_exe.parent().ok_or("Steam is not installed")?;
    let original = super::steam_browser::original_helper(steam_root)
        .ok_or("Steam's sign-in window is not ready")?;
    let pids =
        super::steam_login_process::browser_pids(&original).map_err(|err| err.to_string())?;
    if pids.is_empty() {
        return Ok(SteamLoginPlacement { placed: false });
    }
    let script = place_script(x, y, width, height, &pids)?;
    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .stdin(Stdio::null())
        .output()
        .map_err(|_| "Steam's sign-in window could not be moved into Orbit".to_string())?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr);
        if detail.contains("-1719") || detail.contains("-25211") || detail.contains("-1743") {
            return Err("Allow Orbit in System Settings → Privacy & Security → Accessibility and Automation so it can position the Steam sign-in window".into());
        }
    }
    Ok(SteamLoginPlacement {
        placed: output.status.success(),
    })
}

pub fn poll(repo: &GameRepository) -> Result<SteamLoginPoll, String> {
    let (status, library_error) = steam_windows::capture_login(repo)?;
    Ok(SteamLoginPoll {
        done: status.is_some(),
        status,
        library_error,
    })
}

/// Hide the login window and stop the shared Steam process. Saved login files
/// stay in steam-windows so each game container can be seeded. Play does not
/// keep a resident steam.exe.
pub fn finish_sign_in(
    app: Option<&AppHandle>,
    slot: &Mutex<SteamLoginSession>,
) -> Result<(), String> {
    let captured = persist_window_login();
    let closed = close(app, slot, false);
    captured.and(closed)
}

/// Stop the sign-in window and keep the refresh token it wrote, so game
/// containers can log on without opening Steam again.
fn persist_window_login() -> Result<(), String> {
    let steam_exe = steam_windows::steam_exe();
    let Some(root) = steam_exe.parent() else {
        if let Some(wine) = steam_windows::steam_wine_binary() {
            steam_windows::request_steam_shutdown(&wine, &steam_windows::steam_prefix());
        }
        return Ok(());
    };
    let login = root.join("config/loginusers.vdf");
    if login.is_file() {
        crate::utils::steam_account::enable_saved_login(&login);
    }
    let session = steam_windows::session_dir(&crate::utils::paths::app_data_dir());
    super::steam_native::login::seed_from_client(
        &steam_windows::steam_prefix(),
        &super::steam_native::login::steamcmd_root(&session),
    )?;
    let Some(wine) = steam_windows::steam_wine_binary() else {
        return Ok(());
    };
    steam_windows::request_steam_shutdown(&wine, &steam_windows::steam_prefix());
    steam_windows::wait_for_saved_session(root, Duration::from_secs(20));
    steam_windows::capture_client_session().map(|_| ())
}

pub fn close(
    app: Option<&AppHandle>,
    slot: &Mutex<SteamLoginSession>,
    persist_session: bool,
) -> Result<(), String> {
    steam_windows::set_login_window_running(false);
    let (child, restore) = take_session(slot);
    if persist_session {
        if let Some(wine) = steam_windows::steam_wine_binary() {
            let prefix = steam_windows::steam_prefix();
            steam_windows::request_steam_shutdown(&wine, &prefix);
            if let Some(root) = steam_windows::steam_exe().parent() {
                steam_windows::wait_for_saved_session(root, Duration::from_secs(20));
            }
        }
    }
    let child_result = match child {
        Some(child) => stop_child(child),
        None => Ok(()),
    };
    let server_result = stop_prefix_server();
    steam_windows::stop_steam_prefix();
    let restore_result = if restore {
        app.map(restore_exclusive_fullscreen).unwrap_or(Ok(()))
    } else {
        Ok(())
    };
    child_result.and(server_result).and(restore_result)
}

pub fn login_applescript_origin(
    inner_physical_x: i32,
    inner_physical_y: i32,
    scale_factor: f64,
    css_left: f64,
    css_top: f64,
) -> (i32, i32) {
    let scale = if scale_factor <= 0.0 {
        1.0
    } else {
        scale_factor
    };
    let x = (inner_physical_x as f64 / scale + css_left).round() as i32;
    let y = (inner_physical_y as f64 / scale + css_top).round() as i32;
    (x, y)
}

pub fn needs_windowed_overlay(exclusive_fullscreen: bool) -> bool {
    exclusive_fullscreen
}

pub fn is_login_process_name(name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    name.contains("wine") || name.contains("steam") || name.contains("preloader") || name == "exec"
}

pub fn is_login_window_name(name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    name.is_empty()
        || name.contains("steam")
        || name.contains("wine")
        || name.contains("steamlogin")
}

pub fn place_script(
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    pids: &[u32],
) -> Result<String, String> {
    if !(-4_000..=8_000).contains(&x) || !(-4_000..=8_000).contains(&y) {
        return Err("Steam window position is invalid".into());
    }
    if !(640..=LOGIN_WINDOW_WIDTH).contains(&width)
        || !(360..=LOGIN_WINDOW_HEIGHT).contains(&height)
        || pids.is_empty()
        || pids.len() > 8
        || pids.contains(&0)
    {
        return Err("Steam window frame or process is invalid".into());
    }
    let ids = pids
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(", ");
    let orbit_pid = std::process::id();
    Ok(format!(
        r#"tell application "System Events"
set placed to false
set orbitActive to false
try
  set orbitActive to frontmost of first process whose unix id is {orbit_pid}
end try
repeat with browserId in {{{ids}}}
  try
    set proc to first process whose unix id is (browserId as integer)
    if orbitActive or frontmost of proc then
      set visible of proc to true
      repeat with w in windows of proc
        set wname to name of w as text
        if wname contains "Steam" or wname contains "steam" or wname is "" then
          set position of w to {{{x}, {y}}}
          set size of w to {{{width}, {height}}}
          if orbitActive then
            try
              perform action "AXRaise" of w
            end try
          end if
          set placed to true
          exit repeat
        end if
      end repeat
    else
      set visible of proc to false
      set placed to true
    end if
  on error messageText number errorNumber
    if errorNumber is -1719 or errorNumber is -25211 or errorNumber is -1743 then error messageText number errorNumber
  end try
  if placed then exit repeat
end repeat
if placed is false then error "Steam login window is not open"
end tell"#
    ))
}

pub fn login_flags() -> &'static [&'static str] {
    &LOGIN_FLAGS
}

fn login_screen_origin(app: &AppHandle, css_left: f64, css_top: f64) -> (i32, i32) {
    let Some(window) = app.get_webview_window("main") else {
        return (css_left.round() as i32, css_top.round() as i32);
    };
    let Ok(pos) = window.inner_position() else {
        return (css_left.round() as i32, css_top.round() as i32);
    };
    let scale = window.scale_factor().unwrap_or(1.0);
    login_applescript_origin(pos.x, pos.y, scale, css_left, css_top)
}

fn leave_exclusive_fullscreen(app: &AppHandle) -> Result<bool, String> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(false);
    };
    if !window.is_fullscreen().map_err(|err| err.to_string())? {
        return Ok(false);
    }
    window
        .set_fullscreen(false)
        .map_err(|err| err.to_string())?;
    Ok(true)
}

fn restore_exclusive_fullscreen(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_fullscreen(true).map_err(|err| {
            format!("Steam closed, but Orbit could not restore fullscreen: {err}")
        })?;
    }
    Ok(())
}

fn take_session(slot: &Mutex<SteamLoginSession>) -> (Option<Child>, bool) {
    let mut session = slot.lock();
    session.active = false;
    (
        session.child.take(),
        std::mem::take(&mut session.restore_fullscreen),
    )
}

fn stop_child(mut child: Child) -> Result<(), String> {
    if matches!(child.try_wait(), Ok(Some(_))) {
        return Ok(());
    }
    let id = child.id();
    let group_ok = Command::new("kill")
        .args(["-TERM", &format!("-{id}")])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false);
    match child.kill() {
        Ok(()) => child.wait().map(|_| ()).or_else(|_| {
            if group_ok {
                Ok(())
            } else {
                Err("Steam's sign-in window could not be closed".into())
            }
        }),
        Err(_) if group_ok => Ok(()),
        Err(_) => Err("Steam's sign-in window could not be closed".into()),
    }
}

fn stop_prefix_server() -> Result<(), String> {
    let Some(wine) = steam_windows::steam_wine_binary() else {
        return Ok(());
    };
    let Some(server) = prefix_server(&wine) else {
        return Ok(());
    };
    stop_prefix_with_server(
        &server,
        &steam_windows::steam_prefix(),
        std::time::Duration::from_secs(3),
    )
}

/// `-k` returns 1 when no server exists. `-w` certifies the prefix has stopped,
/// including that already-stopped case, without treating it as a launch failure.
fn stop_prefix_with_server(
    server: &Path,
    prefix: &Path,
    timeout: std::time::Duration,
) -> Result<(), String> {
    use crate::runtimes::process::wait_bounded;
    let cancel = std::sync::atomic::AtomicBool::new(false);
    let mut kill = steam_windows::steam_runtime_command(server, prefix)
        .arg("-k")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "Steam's Windows environment could not be stopped".to_string())?;
    // The exit status alone cannot distinguish an absent server from a failure.
    wait_bounded(&mut kill, timeout, &cancel)
        .map_err(|_| "Steam shutdown timed out. You can close this dialog and retry".to_string())?;
    let mut waiter = steam_windows::steam_runtime_command(server, prefix)
        .arg("-w")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "Steam shutdown could not be verified".to_string())?;
    let stopped = wait_bounded(&mut waiter, timeout, &cancel)
        .map_err(|_| "Steam shutdown timed out. You can close this dialog and retry".to_string())?;
    if !stopped.success() {
        return Err("Steam's Windows environment did not confirm shutdown".into());
    }
    Ok(())
}

pub(crate) fn prefix_server(wine: &Path) -> Option<PathBuf> {
    let server = wine.parent()?.join("wineserver");
    server.is_file().then_some(server)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn occupied_session() -> Mutex<SteamLoginSession> {
        Mutex::new(SteamLoginSession {
            child: None,
            active: true,
            restore_fullscreen: false,
        })
    }

    #[test]
    #[cfg(unix)]
    fn an_already_stopped_wine_server_does_not_block_sign_in_or_cancel() {
        use std::os::unix::fs::PermissionsExt;
        let root = std::env::temp_dir().join(format!("orbit-steam-stop-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let server = root.join("wineserver");
        std::fs::write(
            &server,
            "#!/bin/sh\ncase \"$1\" in -k) exit 1;; -w) exit 0;; esac\n",
        )
        .unwrap();
        std::fs::set_permissions(&server, std::fs::Permissions::from_mode(0o700)).unwrap();
        assert!(stop_prefix_with_server(&server, &root, Duration::from_secs(1)).is_ok());
        std::fs::write(
            &server,
            "#!/bin/sh\ncase \"$1\" in -k) exit 0;; -w) exit 5;; esac\n",
        )
        .unwrap();
        assert!(stop_prefix_with_server(&server, &root, Duration::from_secs(1)).is_err());
        std::fs::write(
            &server,
            "#!/bin/sh\ncase \"$1\" in -k) exit 0;; -w) exec /bin/sleep 30;; esac\n",
        )
        .unwrap();
        let started = std::time::Instant::now();
        assert!(stop_prefix_with_server(&server, &root, Duration::from_millis(40)).is_err());
        assert!(started.elapsed() < Duration::from_secs(1));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    #[ignore = "requires ORBIT_TEST_WINE for a real Wine server, without opening a UI"]
    fn real_wine_shutdown_handles_running_and_absent_servers() {
        let wine = PathBuf::from(std::env::var("ORBIT_TEST_WINE").unwrap());
        let server = wine.parent().unwrap().join("wineserver");
        let root = std::env::temp_dir().join(format!("orbit-real-server-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        stop_prefix_with_server(&server, &root, Duration::from_secs(3)).unwrap();
        let status = steam_windows::steam_runtime_command(&server, &root)
            .arg("-p10")
            .status()
            .unwrap();
        assert!(status.success());
        stop_prefix_with_server(&server, &root, Duration::from_secs(3)).unwrap();
        stop_prefix_with_server(&server, &root, Duration::from_secs(3)).unwrap();
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn login_window_keeps_both_methods_and_avoids_the_black_swiftshader_view() {
        let flags = login_flags();
        assert!(flags.contains(&"-cef-disable-gpu"));
        assert!(flags.contains(&"-cef-disable-gpu-compositing"));
        assert!(flags.contains(&"-cef-in-process-gpu"));
        assert!(flags.contains(&"-cef-use-gl=disabled"));
        assert!(!flags.iter().any(|flag| *flag == "-disable-gpu"));
        assert!(!flags.iter().any(|flag| flag.contains("silent")));
        assert!(!flags.iter().any(|flag| flag.contains("password")));
        assert!(!flags.iter().any(|flag| *flag == "-no-browser"));
    }

    #[test]
    fn login_argv_opens_steam_own_qr_without_a_second_desktop() {
        let steam = std::env::temp_dir().join("steam.exe");
        let args = login_argv(&steam);
        assert_eq!(args[0], steam.to_string_lossy());
        assert!(!args.iter().any(|arg| arg == "explorer"));
        assert!(!args.iter().any(|arg| arg.contains("/desktop=")));
        assert!(args.iter().any(|arg| arg == "-cef-disable-gpu"));
        assert!(args.iter().any(|arg| arg == "-cef-disable-gpu-compositing"));
        assert!(args.iter().any(|arg| arg == "-cef-in-process-gpu"));
        assert!(args.iter().any(|arg| arg == "-cef-use-gl=disabled"));
        assert!(args.iter().any(|arg| arg == "-no-cef-sandbox"));
        assert!(!args.iter().any(|arg| arg.contains("silent")));
        assert!(!args.iter().any(|arg| arg.contains("password")));
        assert!(!args.iter().any(|arg| arg.contains("BeginAuthSession")));
    }

    #[test]
    fn login_command_does_not_force_the_gdi_black_window() {
        let root = std::env::temp_dir().join(format!("orbit-steam-login-{}", uuid::Uuid::new_v4()));
        let wine = root.join("bin/wine");
        let prefix = root.join("prefix");
        let steam = prefix.join("drive_c/Program Files (x86)/Steam/steam.exe");
        std::fs::create_dir_all(steam.parent().unwrap()).unwrap();
        std::fs::write(&steam, b"steam").unwrap();
        let cef = steam.parent().unwrap().join("bin/cef/cef.win64");
        std::fs::create_dir_all(&cef).unwrap();
        std::fs::write(cef.join("steamwebhelper.exe"), b"MZvendor").unwrap();
        let command = login_command(&wine, &prefix, &steam).unwrap();
        let args: Vec<String> = command
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();
        assert_eq!(command.get_program(), wine.as_os_str());
        assert_eq!(command.get_current_dir(), Some(steam.parent().unwrap()));
        assert_eq!(args[0], steam.to_string_lossy());
        assert!(!args.iter().any(|arg| arg == "explorer"));
        assert!(args.iter().any(|arg| arg == "-cef-use-gl=disabled"));
        assert!(args.iter().any(|arg| arg == "-cef-in-process-gpu"));
        let prefix_env = command
            .get_envs()
            .find(|(key, _)| *key == "WINEPREFIX")
            .and_then(|(_, value)| value.map(|value| value.to_os_string()));
        assert_eq!(prefix_env.as_deref(), Some(prefix.as_os_str()));
        let cfg = std::fs::read_to_string(steam.parent().unwrap().join("steam.cfg")).unwrap();
        assert!(cfg.contains("BootStrapperInhibitAll = Enable"));
        assert!(command
            .get_envs()
            .all(|(key, _)| key != "WINE_D3D_CONFIG" && key != "LIBGL_ALWAYS_SOFTWARE"));
        let dlls = command
            .get_envs()
            .find(|(key, _)| *key == "WINEDLLOVERRIDES")
            .and_then(|(_, value)| value.map(|value| value.to_string_lossy().into_owned()));
        assert_eq!(dlls.as_deref(), Some(LOGIN_DLLS));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn spawn_login_reuses_a_running_child() {
        let slot = Mutex::new(SteamLoginSession {
            child: Some(
                Command::new("sleep")
                    .arg("30")
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                    .unwrap(),
            ),
            active: true,
            restore_fullscreen: false,
        });
        spawn_login(
            &slot,
            Path::new("/missing-wine"),
            Path::new("/missing-prefix"),
            Path::new("/missing-steam.exe"),
        )
        .unwrap();
        assert!(slot.lock().child.is_some());
        let _ = close(None, &slot, false);
    }

    #[test]
    fn finish_sign_in_stops_the_shared_steam_process() {
        let child = Command::new("sleep")
            .arg("30")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        let pid = child.id();
        let slot = Mutex::new(SteamLoginSession {
            child: Some(child),
            active: true,
            restore_fullscreen: false,
        });
        finish_sign_in(None, &slot).unwrap();
        assert!(slot.lock().child.is_none());
        assert!(!slot.lock().active);
        let alive = Command::new("kill")
            .args(["-0", &pid.to_string()])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false);
        let _ = Command::new("kill")
            .arg(&pid.to_string())
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        assert!(!alive);
    }

    #[test]
    fn spawn_login_does_not_start_a_second_wine_after_detach() {
        spawn_login(
            &occupied_session(),
            Path::new("/missing-wine"),
            Path::new("/missing-prefix"),
            Path::new("/missing-steam.exe"),
        )
        .unwrap();
    }

    #[test]
    fn spawn_login_requires_installed_steam() {
        let slot = Mutex::new(SteamLoginSession::new());
        let error = spawn_login(
            &slot,
            Path::new("/missing-wine"),
            Path::new("/missing-prefix"),
            Path::new("/missing-steam.exe"),
        )
        .unwrap_err();
        assert!(error.contains("not ready"));
        assert!(!slot.lock().active);
        assert!(slot.lock().child.is_none());
    }

    #[test]
    fn placement_targets_only_the_owned_browser_processes() {
        let script = place_script(
            120,
            80,
            LOGIN_WINDOW_WIDTH,
            LOGIN_WINDOW_HEIGHT,
            &[1234, 5678],
        )
        .unwrap();
        assert!(script.contains("{1234, 5678}"));
        assert!(script.contains("unix id"));
        assert!(!script.contains("pname contains"));
        assert!(script.contains("AXRaise"));
        assert!(script.contains("{120, 80}"));
        assert!(script.contains("{840, 520}"));
        assert!(place_script(0, 0, 10, 10, &[1234]).is_err());
        assert!(place_script(0, 0, LOGIN_WINDOW_WIDTH, LOGIN_WINDOW_HEIGHT, &[0]).is_err());
    }

    #[test]
    fn login_names_match_wine_exec_and_steam() {
        assert!(is_login_process_name("exec"));
        assert!(is_login_process_name("wine64-preloader"));
        assert!(is_login_process_name("Wine"));
        assert!(is_login_window_name("SteamLogin"));
        assert!(is_login_window_name("Steam"));
        assert!(is_login_window_name("Wine Desktop"));
        assert!(is_login_window_name(""));
        assert!(!is_login_process_name("Safari"));
        assert!(!is_login_window_name("Settings"));
    }

    #[test]
    fn overlay_hosting_leaves_exclusive_fullscreen() {
        assert!(needs_windowed_overlay(true));
        assert!(!needs_windowed_overlay(false));
    }

    #[test]
    fn login_screen_origin_uses_webview_points() {
        assert_eq!(login_applescript_origin(0, 0, 2.0, 40.4, 80.6), (40, 81));
        assert_eq!(
            login_applescript_origin(100, 200, 2.0, 40.0, 80.0),
            (90, 180)
        );
        assert_eq!(login_applescript_origin(12, 24, 0.0, 40.0, 80.0), (52, 104));
    }

    #[test]
    fn prefix_shutdown_targets_only_the_wineserver_beside_steam_wine() {
        let root =
            std::env::temp_dir().join(format!("orbit-steam-server-{}", uuid::Uuid::new_v4()));
        let bin = root.join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(bin.join("wine"), b"wine").unwrap();
        std::fs::write(bin.join("wineserver"), b"server").unwrap();
        let server = prefix_server(&bin.join("wine")).unwrap();
        assert_eq!(server, bin.join("wineserver"));
        assert!(prefix_server(&root.join("missing-wine")).is_none());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn occupied_session_survives_an_exited_launcher() {
        let mut child = Command::new("true")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        let _ = child.wait();
        let slot = Mutex::new(SteamLoginSession {
            child: Some(child),
            active: true,
            restore_fullscreen: false,
        });
        spawn_login(
            &slot,
            Path::new("/missing-wine"),
            Path::new("/missing-prefix"),
            Path::new("/missing-steam.exe"),
        )
        .unwrap();
        std::thread::sleep(Duration::from_millis(1));
        assert!(slot.lock().active);
        let _ = close(None, &slot, false);
    }
}
