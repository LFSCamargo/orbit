//! Start an owned title through the resident silent Steam client (`-applaunch`).
//! The silent `steam.exe` stays in the prefix; Orbit tracks the game process.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use anyhow::Result;

use super::steam_windows::{steam_exe, steam_runtime_command};
use crate::launching::terminate_pid;
use crate::runtimes::RuntimeProcess;

const GAME_START: Duration = Duration::from_secs(120);

pub fn applaunch_argv(steam_exe: &Path, app_id: &str) -> Vec<String> {
    vec![
        steam_exe.to_string_lossy().into_owned(),
        "-applaunch".into(),
        app_id.to_string(),
    ]
}

pub fn request_applaunch(wine: &Path, prefix: &Path, app_id: &str) -> Result<(), String> {
    let steam = steam_exe();
    let steam_root = steam
        .parent()
        .ok_or("Install a Windows compatibility runtime in Settings before playing this game")?;
    if !steam.is_file() {
        return Err(
            "Install a Windows compatibility runtime in Settings before playing this game".into(),
        );
    }
    let mut command = steam_runtime_command(wine, prefix);
    command.args(applaunch_argv(&steam, app_id));
    command.current_dir(steam_root);
    command
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    command.spawn().map_err(|_| {
        "Steam could not start this game. Wait until Steam is ready, then press Play."
    })?;
    Ok(())
}

pub fn wait_for_game(
    prefix: &Path,
    exe_name: &str,
    cancel: &AtomicBool,
) -> Result<SteamGameProcess, String> {
    let deadline = Instant::now() + GAME_START;
    while Instant::now() < deadline {
        if cancel.load(Ordering::Relaxed) {
            return Err("Launch cancelled".into());
        }
        let listing = process_listing();
        if let Some(pid) = game_pids(&listing, prefix, exe_name).into_iter().next() {
            return Ok(SteamGameProcess {
                prefix: prefix.to_path_buf(),
                exe_name: exe_name.to_string(),
                pid,
                finished: false,
            });
        }
        std::thread::sleep(Duration::from_millis(400));
    }
    Err("The game did not start. Wait until Steam is ready, then press Play.".into())
}

pub fn game_running(listing: &str, prefix: &Path, exe_name: &str) -> bool {
    !game_pids(listing, prefix, exe_name).is_empty()
}

pub fn game_pids(listing: &str, prefix: &Path, exe_name: &str) -> Vec<u32> {
    let needle = prefix.to_string_lossy();
    if needle.is_empty() || exe_name.is_empty() {
        return Vec::new();
    }
    let exe = exe_name.to_ascii_lowercase();
    let self_pid = std::process::id();
    listing
        .lines()
        .filter(|line| line.contains(needle.as_ref()))
        .filter(|line| !steam_helper(line))
        .filter(|line| line.to_ascii_lowercase().contains(&exe))
        .filter_map(|line| line.split_whitespace().next()?.parse::<u32>().ok())
        .filter(|pid| *pid > 1 && *pid != self_pid)
        .take(32)
        .collect()
}

pub struct SteamGameProcess {
    prefix: PathBuf,
    exe_name: String,
    pid: u32,
    finished: bool,
}

impl RuntimeProcess for SteamGameProcess {
    fn pid(&self) -> u32 {
        self.pid
    }

    fn poll(&mut self) -> Result<Option<i32>> {
        if self.finished {
            return Ok(Some(0));
        }
        let listing = process_listing();
        if let Some(pid) = game_pids(&listing, &self.prefix, &self.exe_name)
            .into_iter()
            .next()
        {
            self.pid = pid;
            return Ok(None);
        }
        self.finished = true;
        Ok(Some(0))
    }

    fn stop(&mut self) -> Result<()> {
        if self.finished {
            return Ok(());
        }
        let listing = process_listing();
        for pid in game_pids(&listing, &self.prefix, &self.exe_name) {
            let _ = terminate_pid(pid);
        }
        self.finished = true;
        Ok(())
    }
}

fn steam_helper(line: &str) -> bool {
    let line = line.to_ascii_lowercase();
    line.contains("steam.exe")
        || line.contains("steamwebhelper")
        || line.contains("steamservice")
        || line.contains("gameoverlay")
}

fn process_listing() -> String {
    let Ok(output) = std::process::Command::new("ps")
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn applaunch_asks_the_resident_client_for_the_app() {
        assert_eq!(
            applaunch_argv(Path::new("/Steam/steam.exe"), "601150"),
            vec![
                "/Steam/steam.exe".to_string(),
                "-applaunch".into(),
                "601150".into()
            ]
        );
    }

    #[test]
    fn game_process_ignores_silent_steam() {
        let prefix = Path::new("/tmp/orbit-steam-prefix");
        let listing = "\
    1 /sbin/launchd
  84643 WINEPREFIX=/tmp/orbit-steam-prefix steam.exe -silent -applaunch 601150
  92297 WINEPREFIX=/tmp/orbit-steam-prefix DevilMayCry5.exe
";
        assert!(game_running(listing, prefix, "DevilMayCry5.exe"));
        assert_eq!(game_pids(listing, prefix, "DevilMayCry5.exe"), vec![92297]);
        assert!(!game_running(listing, prefix, "re2.exe"));
        assert!(game_pids(listing, prefix, "steam.exe").is_empty());
    }
}
