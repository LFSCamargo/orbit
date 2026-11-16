//! Hand the screen to the game once its window exists: hide Orbit (a
//! fullscreen window ignores minimise, so it kept the Space and the focus) and
//! activate the game's process.
//!
//! The game is the newest regular (Dock) app started after the session began
//! whose Windows command line is not Steam or a Wine service. Wine rewrites
//! `argv[0]` to the Windows path, which `KERN_PROCARGS2` reports.

use std::time::{Duration, Instant, SystemTime};

use objc2_app_kit::{
    NSApplicationActivationOptions, NSApplicationActivationPolicy, NSRunningApplication,
    NSWorkspace,
};

/// Orbit-route games are spawned just before the session start is recorded.
const LAUNCH_SLACK_SECONDS: f64 = 10.0;

const HELPERS: [&str; 17] = [
    "steam.exe",
    "steamwebhelper.exe",
    "steamwebhelper-orbit-original.exe",
    "steamservice.exe",
    "steamerrorreporter.exe",
    "steam-session-helper.exe",
    "crs-handler.exe",
    "explorer.exe",
    "services.exe",
    "winedevice.exe",
    "plugplay.exe",
    "svchost.exe",
    "rpcss.exe",
    "lsass.exe",
    "tabtip.exe",
    "conhost.exe",
    "start.exe",
];

/// The `.exe` name of a Windows command line, lowercased.
pub fn exe_name(argv0: &str) -> Option<String> {
    let name = argv0
        .rsplit(['\\', '/'])
        .next()?
        .trim()
        .to_ascii_lowercase();
    name.ends_with(".exe").then_some(name)
}

/// A Windows process that is not Steam or a Wine service.
pub fn is_game_process(argv0: &str) -> bool {
    exe_name(argv0).is_some_and(|name| !HELPERS.contains(&name.as_str()))
}

/// Poll for the game window for up to `timeout`, then hide Orbit and bring
/// the game forward. Runs on its own thread; `still_active` ends it early when
/// the session is over.
pub fn focus_game_when_ready(
    started: SystemTime,
    timeout: Duration,
    still_active: impl Fn() -> bool + Send + 'static,
) {
    std::thread::spawn(move || {
        let deadline = Instant::now() + timeout;
        while Instant::now() < deadline && still_active() {
            if hand_off(started) {
                return;
            }
            std::thread::sleep(Duration::from_millis(500));
        }
    });
}

/// Give the screen to the session's game. Orbit hides as an app, not as a
/// window: hiding only the window of a fullscreen app leaves its Space behind
/// as a black screen in front of the game, and macOS only grants Game Mode to
/// the frontmost fullscreen game. Returns whether the game was found.
pub fn hand_off(started: SystemTime) -> bool {
    let game = find_game(started);
    NSRunningApplication::currentApplication().hide();
    if let Some(game) = &game {
        game.activateWithOptions(NSApplicationActivationOptions::ActivateAllWindows);
    }
    game.is_some()
}

fn find_game(started: SystemTime) -> Option<objc2::rc::Retained<NSRunningApplication>> {
    let since = started
        .duration_since(SystemTime::UNIX_EPOCH)
        .ok()?
        .as_secs_f64();
    let own = std::process::id() as i32;
    NSWorkspace::sharedWorkspace()
        .runningApplications()
        .iter()
        .filter(|app| app.activationPolicy() == NSApplicationActivationPolicy::Regular)
        .filter(|app| app.processIdentifier() != own)
        .filter_map(|app| {
            let launched = app.launchDate()?.timeIntervalSince1970();
            (launched >= since - LAUNCH_SLACK_SECONDS).then_some((launched, app))
        })
        .filter(|(_, app)| argv0(app.processIdentifier()).is_some_and(|arg| is_game_process(&arg)))
        .max_by(|(a, _), (b, _)| a.total_cmp(b))
        .map(|(_, app)| app)
}

/// `argv[0]` of a same-user process, as `ps` shows it.
fn argv0(pid: i32) -> Option<String> {
    let mut mib = [libc::CTL_KERN, libc::KERN_PROCARGS2, pid];
    let mut size: libc::size_t = 0;
    // SAFETY: size query, then a read into a buffer of exactly that size.
    unsafe {
        if libc::sysctl(
            mib.as_mut_ptr(),
            3,
            std::ptr::null_mut(),
            &mut size,
            std::ptr::null_mut(),
            0,
        ) != 0
        {
            return None;
        }
        let mut buffer = vec![0u8; size.min(1 << 20)];
        size = buffer.len();
        if libc::sysctl(
            mib.as_mut_ptr(),
            3,
            buffer.as_mut_ptr().cast(),
            &mut size,
            std::ptr::null_mut(),
            0,
        ) != 0
        {
            return None;
        }
        buffer.truncate(size);
        parse_procargs(&buffer)
    }
}

/// `KERN_PROCARGS2`: argc (i32), exec path, NUL padding, then argv[0].
pub fn parse_procargs(buffer: &[u8]) -> Option<String> {
    let rest = buffer.get(4..)?;
    let path_end = rest.iter().position(|byte| *byte == 0)?;
    let rest = &rest[path_end..];
    let start = rest.iter().position(|byte| *byte != 0)?;
    let rest = &rest[start..];
    let end = rest
        .iter()
        .position(|byte| *byte == 0)
        .unwrap_or(rest.len());
    Some(String::from_utf8_lossy(&rest[..end]).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn steam_and_wine_services_are_not_the_game() {
        assert!(is_game_process(
            "C:\\Program Files (x86)\\Steam\\steamapps\\common\\GodOfWar\\GoW.exe"
        ));
        for helper in [
            "C:\\Program Files (x86)\\Steam\\steam.exe",
            "C:\\Program Files (x86)\\Steam\\bin\\cef\\cef.win64\\steamwebhelper.exe",
            "C:\\windows\\system32\\explorer.exe",
            "C:\\windows\\system32\\winedevice.exe",
            "./exec\\crs-handler.exe",
            "C:\\WINDOWS\\SYSTEM32\\SERVICES.EXE",
        ] {
            assert!(!is_game_process(helper), "{helper}");
        }
        // Unix processes (wineserver, Orbit) are never picked.
        assert!(!is_game_process("/opt/wine/bin/wineserver"));
        assert_eq!(exe_name("C:\\a\\B.EXE").as_deref(), Some("b.exe"));
    }

    #[test]
    fn procargs_yield_the_rewritten_windows_argv0() {
        let mut buffer = 2i32.to_ne_bytes().to_vec();
        buffer.extend_from_slice(b"/wine/lib/wine/x86_64-unix/wine\0\0\0\0");
        buffer.extend_from_slice(b"C:\\Games\\GoW.exe\0-dx12\0");
        assert_eq!(
            parse_procargs(&buffer).as_deref(),
            Some("C:\\Games\\GoW.exe")
        );
        assert!(parse_procargs(b"ab").is_none());
    }

    #[test]
    fn reads_argv0_of_a_live_process() {
        let mut child = std::process::Command::new("/bin/sleep")
            .arg("2")
            .spawn()
            .unwrap();
        let name = argv0(child.id() as i32);
        let _ = child.kill();
        let _ = child.wait();
        assert_eq!(name.as_deref(), Some("/bin/sleep"));
    }
}
