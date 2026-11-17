//! Hand the screen to the game once its window exists: hide Orbit (a
//! fullscreen window ignores minimise, so it kept the Space and the focus) and
//! activate the game's process.
//!
//! The game is the newest app (not activation-prohibited) started after the
//! session began whose Windows command line is not Steam or a Wine service.
//! Wine rewrites `argv[0]` to the Windows path, which `KERN_PROCARGS2` reports.
//!
//! macOS 14+ activation is cooperative: a request is honoured only when the
//! active app yields to it. So Orbit, still active, yields to the game,
//! activates it, and only then hides; hiding first left no one able to yield
//! and macOS fell back to whatever app was next on the desktop.

use std::time::{Duration, Instant, SystemTime};

use crate::runtimes::windows_process::is_game_process;
use objc2::rc::Retained;
use objc2::runtime::NSObjectProtocol;
use objc2::sel;
use objc2_app_kit::{
    NSApplication, NSApplicationActivationOptions, NSApplicationActivationPolicy,
    NSRunningApplication, NSWorkspace,
};
use objc2_foundation::MainThreadMarker;
use tauri::AppHandle;

/// Orbit-route games are spawned just before the session start is recorded.
const LAUNCH_SLACK_SECONDS: f64 = 10.0;

/// Wait (up to `timeout`) for the game's app, then hand it the screen on the
/// main thread. Orbit stays in front until the game exists; `still_active`
/// ends the wait when the session is over.
pub fn focus_game_when_ready(
    app: AppHandle,
    started: SystemTime,
    timeout: Duration,
    still_active: impl Fn() -> bool + Send + 'static,
) {
    std::thread::spawn(move || {
        let deadline = Instant::now() + timeout;
        while Instant::now() < deadline && still_active() {
            if let Some(pid) = find_game(started).map(|game| game.processIdentifier()) {
                let _ = app.run_on_main_thread(move || {
                    if let Some(mtm) = MainThreadMarker::new() {
                        let game =
                            NSRunningApplication::runningApplicationWithProcessIdentifier(pid);
                        hand_off_to(mtm, game.as_deref());
                    }
                });
                return;
            }
            std::thread::sleep(Duration::from_millis(500));
        }
    });
}

/// Return to the session's game ("Resume"): give it the screen and hide Orbit
/// even when the game cannot be found. Returns whether it was found.
pub fn hand_off(mtm: MainThreadMarker, started: SystemTime) -> bool {
    let game = find_game(started);
    hand_off_to(mtm, game.as_deref());
    game.is_some()
}

/// Yield to the game, activate it, then hide Orbit as an app (hiding only the
/// window of a fullscreen app leaves its Space behind as a black screen).
fn hand_off_to(mtm: MainThreadMarker, game: Option<&NSRunningApplication>) {
    let orbit = NSApplication::sharedApplication(mtm);
    if let Some(game) = game {
        // `yieldActivationToApplication:` exists from macOS 14 (Orbit runs on 12+).
        if orbit.respondsToSelector(sel!(yieldActivationToApplication:)) {
            orbit.yieldActivationToApplication(game);
        }
        game.activateWithOptions(NSApplicationActivationOptions::ActivateAllWindows);
    }
    orbit.hide(None);
}

fn find_game(started: SystemTime) -> Option<Retained<NSRunningApplication>> {
    let since = started
        .duration_since(SystemTime::UNIX_EPOCH)
        .ok()?
        .as_secs_f64();
    let own = std::process::id() as i32;
    NSWorkspace::sharedWorkspace()
        .runningApplications()
        .iter()
        // The bundled game starts as an accessory (LSUIElement) until Wine
        // shows its window.
        .filter(|app| app.activationPolicy() != NSApplicationActivationPolicy::Prohibited)
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
pub(crate) fn argv0(pid: i32) -> Option<String> {
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
