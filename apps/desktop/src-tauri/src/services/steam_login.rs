//! Steam's own login window, hosted over Orbit's sign-in dialog.
//! The window contains both the account form and the QR code. GPU drawing is
//! disabled because Steam's browser otherwise paints a black window under Wine.

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};

use parking_lot::Mutex;
use serde::Serialize;

use crate::database::GameRepository;
use crate::services::steam_windows::{self, SteamWindowsStatus};

pub const LOGIN_WINDOW_WIDTH: i32 = 840;
pub const LOGIN_WINDOW_HEIGHT: i32 = 520;
const DESKTOP: &str = "/desktop=SteamLogin,840x520";
const LOGIN_FLAGS: [&str; 3] = [
    "-cef-disable-gpu",
    "-cef-disable-gpu-compositing",
    "-no-cef-sandbox",
];

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

pub fn open(slot: &Mutex<Option<Child>>) -> Result<(), String> {
    let _ = slot;
    steam_windows::begin_sign_in();
    Ok(())
}

pub fn place(x: i32, y: i32, width: i32, height: i32) -> Result<SteamLoginPlacement, String> {
    let script = place_script(x, y, width, height)?;
    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .stdin(Stdio::null())
        .output()
        .map_err(|_| "Steam's sign-in window could not be moved into Orbit".to_string())?;
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

pub fn close(slot: &Mutex<Option<Child>>) -> Result<(), String> {
    steam_windows::set_login_window_running(false);
    let child_result = match slot.lock().take() {
        Some(child) => stop_child(child),
        None => Ok(()),
    };
    // Wine detaches steam.exe and the SteamLogin desktop from the process we
    // spawned. wineserver -k is what actually removes the window.
    let server_result = stop_prefix_server();
    child_result.and(server_result)
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
    let status = Command::new(&server)
        .arg("-k")
        .env("WINEPREFIX", steam_windows::steam_prefix())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|_| "Steam's sign-in window could not be closed".to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("Steam's sign-in window could not be closed".into())
    }
}

pub(crate) fn prefix_server(wine: &Path) -> Option<PathBuf> {
    let server = wine.parent()?.join("wineserver");
    server.is_file().then_some(server)
}

fn login_running(slot: &Mutex<Option<Child>>) -> bool {
    let mut guard = slot.lock();
    let Some(child) = guard.as_mut() else {
        return false;
    };
    match child.try_wait() {
        Ok(Some(_)) => {
            *guard = None;
            false
        }
        Ok(None) => true,
        Err(_) => true,
    }
}

pub fn place_script(x: i32, y: i32, width: i32, height: i32) -> Result<String, String> {
    if !(-4_000..=8_000).contains(&x) || !(-4_000..=8_000).contains(&y) {
        return Err("Steam window position is invalid".into());
    }
    if width != LOGIN_WINDOW_WIDTH || height != LOGIN_WINDOW_HEIGHT {
        return Err("Steam window size is invalid".into());
    }
    Ok(format!(
        r#"tell application "System Events"
set found to false
repeat with proc in processes
  try
    if exists (window "SteamLogin" of proc) then
      set position of window "SteamLogin" of proc to {{{x}, {y}}}
      set size of window "SteamLogin" of proc to {{{width}, {height}}}
      set found to true
      exit repeat
    end if
  end try
end repeat
if found is false then error "Steam login window is not open"
end tell"#
    ))
}

pub fn login_flags() -> &'static [&'static str] {
    &LOGIN_FLAGS
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn login_window_keeps_both_methods_and_disables_the_black_gpu_view() {
        let flags = login_flags();
        assert!(flags.contains(&"-cef-disable-gpu"));
        assert!(flags.contains(&"-cef-disable-gpu-compositing"));
        assert!(!flags.iter().any(|flag| flag.contains("silent")));
        assert!(!flags.iter().any(|flag| flag.contains("password")));
        assert!(!flags.iter().any(|flag| *flag == "-no-browser"));
        assert_eq!(DESKTOP, "/desktop=SteamLogin,840x520");
    }

    #[test]
    fn place_script_targets_the_named_steam_window() {
        let script = place_script(120, 80, LOGIN_WINDOW_WIDTH, LOGIN_WINDOW_HEIGHT).unwrap();
        assert!(script.contains("window \"SteamLogin\""));
        assert!(script.contains("{120, 80}"));
        assert!(script.contains("{840, 520}"));
        assert!(!script.contains("frontmost"));
        assert!(place_script(0, 0, 10, 10).is_err());
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
}
