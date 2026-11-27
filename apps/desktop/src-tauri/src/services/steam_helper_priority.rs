//! Keep a container's Steam browser out of the game's way while it plays.
//!
//! Valve's Windows client runs `steamwebhelper.exe` (Chromium) beside the
//! game, under Wine and Rosetta. It wakes on saves, achievements and cloud
//! sync, and its bursts took CPU from the game. While a session runs, only the
//! helpers move to macOS background priority (efficiency cores, throttled I/O).
//! `steam.exe` is the game's Steamworks peer: the game calls it through
//! `steam_api64.dll` every frame (callbacks, Steam Input, overlay), so it and
//! the wineserver keep their priority and the game never waits on a throttled
//! process. Session cleanup returns the helpers to normal.
use std::path::Path;

/// The browser helpers of exactly this prefix in a `ps axeww -o pid=,command=`
/// listing (the environment carries `WINEPREFIX=`). O(lines).
fn helper_pids(listing: &str, prefix: &Path, argv0: impl Fn(i32) -> Option<String>) -> Vec<u32> {
    super::container_steam::orphan_pids(listing, prefix)
        .into_iter()
        .filter(|&pid| {
            let name = i32::try_from(pid)
                .ok()
                .and_then(&argv0)
                .and_then(|arg| crate::runtimes::windows_process::exe_name(&arg));
            matches!(
                name.as_deref(),
                Some("steamwebhelper.exe" | "steamwebhelper-orbit-original.exe")
            )
        })
        .collect()
}

/// Background priority on (during play) or off (after it) for this prefix's
/// browser helpers. Best effort: a process that exited or is not ours is skipped.
pub fn set_background(prefix: &Path, background: bool) {
    let Some(listing) = process_listing() else {
        return;
    };
    for pid in helper_pids(&listing, prefix, crate::platform::macos::game_focus::argv0) {
        set_process_background(pid, background);
    }
}

fn set_process_background(pid: libc::id_t, background: bool) {
    if pid == 0 {
        return;
    }
    let value = if background { libc::PRIO_DARWIN_BG } else { 0 };
    // SAFETY: only changes the scheduling class of a process this user owns;
    // the kernel refuses any other.
    unsafe {
        libc::setpriority(libc::PRIO_DARWIN_PROCESS, pid, value);
    }
}

fn process_listing() -> Option<String> {
    let output = std::process::Command::new("ps")
        .args(["axeww", "-o", "pid=,command="])
        .output()
        .ok()?;
    if output.stdout.len() > 8 * 1024 * 1024 {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Whether this monitor tick sweeps for helpers: soon after the game starts,
/// again once Steam has settled, then every minute for a restarted helper.
/// Each sweep runs one `ps`, so they stay rare.
pub fn sweep_due(tick: u64) -> bool {
    tick == 1 || tick == 5 || (tick > 0 && tick.is_multiple_of(30))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_this_containers_browser_helpers_are_moved() {
        let prefix = Path::new("/c/games/steam-1593500/prefix");
        let listing = concat!(
            "  101 C:\\Program Files (x86)\\Steam\\steam.exe -silent WINEPREFIX=/c/games/steam-1593500/prefix\n",
            "  102 C:\\Program Files (x86)\\Steam\\bin\\cef\\cef.win7x64\\steamwebhelper.exe -lang=en WINEPREFIX=/c/games/steam-1593500/prefix\n",
            "  103 C:\\Games\\GoW.exe WINEPREFIX=/c/games/steam-1593500/prefix\n",
            "  104 /w/bin/wineserver WINEPREFIX=/c/games/steam-1593500/prefix\n",
            "  105 C:\\Steam\\bin\\cef\\cef.win7x64\\steamwebhelper.exe WINEPREFIX=/c/games/steam-550/prefix\n",
            "  106 C:\\Steam\\bin\\cef\\cef.win7x64\\SteamWebHelper-orbit-original.exe WINEPREFIX=/c/games/steam-1593500/prefix\n",
        );
        // A game mentioning the helper in its arguments keeps its priority.
        let listing = format!(
            "{listing}  107 C:\\Games\\GoWR.exe --helper=steamwebhelper.exe WINEPREFIX={}\n",
            prefix.display()
        );
        let selected = helper_pids(&listing, prefix, |pid| {
            Some(
                match pid {
                    101 => r"C:\Steam\steam.exe",
                    102 => r"C:\Program Files (x86)\Steam\steamwebhelper.exe",
                    106 => r"C:\Steam\SteamWebHelper-orbit-original.exe",
                    _ => r"C:\Games\GoWR.exe",
                }
                .to_owned(),
            )
        });
        // Regression: steam.exe at background priority stalled the game's
        // Steamworks calls, and controller input lagged during play.
        assert_eq!(selected, vec![102, 106], "steam.exe keeps its priority");
    }

    #[test]
    fn sweeps_stay_rare() {
        let due: Vec<u64> = (0..=90).filter(|tick| sweep_due(*tick)).collect();
        assert_eq!(due, vec![1, 5, 30, 60, 90]);
    }

    #[test]
    fn a_helper_moves_to_background_priority_and_back() {
        // `getpriority` does not report another process's class; the
        // scheduler priority `ps` shows does (4 is the background band).
        let mut child = std::process::Command::new("/bin/sleep")
            .arg("5")
            .spawn()
            .unwrap();
        let pid = child.id();
        let priority = || {
            let output = std::process::Command::new("ps")
                .args(["-o", "pri=", "-p", &pid.to_string()])
                .output()
                .unwrap();
            String::from_utf8_lossy(&output.stdout)
                .trim()
                .parse::<i32>()
                .unwrap()
        };
        let normal = priority();
        set_process_background(pid, true);
        assert!(priority() < normal, "the kernel took the background class");
        set_process_background(pid, false);
        assert_eq!(priority(), normal);
        let _ = child.kill();
        let _ = child.wait();
    }

    #[test]
    fn a_missing_or_foreign_pid_is_ignored() {
        set_process_background(0, true);
        set_process_background(u32::MAX, true);
        set_process_background(1, true);
    }
}
