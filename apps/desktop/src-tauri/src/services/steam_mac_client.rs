//! The one way Orbit starts Steam for Mac: fully silent.
//!
//! `open -b com.valvesoftware.steam --args -silent` only hides Steam's window;
//! Steam still gets a Dock icon, a Cmd-Tab entry and a menu bar, because its
//! Info.plist makes it a regular app. Orbit instead starts the client
//! executable (`steam_osx`) itself with `-silent` and the hidden-client
//! library (`runtimes::hidden_client`), which turns it into an accessory app
//! and hides its menu bar icon. The `Steam.app` launcher cannot be used: it is
//! hardened, so it drops the library. `steam_osx` is not, so it loads it.
//!
//! Every Steam for Mac launch goes through this module: downloads and Play
//! use the silent client (`ensure_running`, `open_url`); the few handoffs
//! meant to show Steam (its library, a store install dialog) use
//! `open_visible`. A Steam the person opened themselves is left as it is.
//!
//! Orbit's hidden client runs only while something needs it: a macOS game
//! playing through `steam://rungameid` or a macOS download. Otherwise it is
//! quit (`release_if_unused`): a resident Steam for Mac claims USB
//! controllers such as 2.4 GHz XInput dongles, so Windows games in a container
//! would see no controller.
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

const BUNDLE_ID: &str = "com.valvesoftware.steam";
/// Steam's own client process on macOS.
pub const CLIENT_PROCESS: &str = "steam_osx";
const START_WAIT: Duration = Duration::from_secs(20);

static DOWNLOADING: AtomicBool = AtomicBool::new(false);
static PLAYING: AtomicBool = AtomicBool::new(false);

/// Marks a macOS download as running until the guard drops.
pub struct DownloadUse(());

impl DownloadUse {
    pub fn begin() -> Self {
        DOWNLOADING.store(true, Ordering::SeqCst);
        Self(())
    }
}

impl Drop for DownloadUse {
    fn drop(&mut self) {
        DOWNLOADING.store(false, Ordering::SeqCst);
    }
}

/// A macOS game launched through Steam for Mac is playing (true) or ended.
pub fn set_playing(playing: bool) {
    PLAYING.store(playing, Ordering::SeqCst);
}

fn in_use() -> bool {
    DOWNLOADING.load(Ordering::SeqCst) || PLAYING.load(Ordering::SeqCst)
}

/// Quit only Orbit's own hidden client, and only when no macOS game or
/// download needs it.
pub fn should_release(hidden_running: bool, in_use: bool) -> bool {
    hidden_running && !in_use
}

/// Quits Orbit's hidden Steam for Mac when nothing needs it. A Steam the
/// person opened is never closed. Blocks up to `START_WAIT` while Steam exits.
pub fn release_if_unused() {
    if !cfg!(target_os = "macos") || in_use() {
        return;
    }
    if should_release(running_hidden(), in_use()) {
        quit();
    }
}

/// Steam for Mac's data folder, where its default library lives.
pub fn steam_root() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join("Library/Application Support/Steam"))
}

/// The client executable inside Steam's data folder, once Steam has set itself up.
pub fn client_binary_in(root: &Path) -> PathBuf {
    root.join("Steam.AppBundle/Steam/Contents/MacOS")
        .join(CLIENT_PROCESS)
}

/// Whether Steam for Mac is installed.
pub fn installed() -> bool {
    let mut apps = vec![PathBuf::from("/Applications/Steam.app")];
    if let Some(home) = dirs::home_dir() {
        apps.push(home.join("Applications/Steam.app"));
    }
    apps.iter().any(|app| app.is_dir())
}

pub fn running() -> bool {
    Command::new("pgrep")
        .args(["-x", CLIENT_PROCESS])
        .output()
        .is_ok_and(|out| out.status.success())
}

/// `lsappinfo` says a Steam the person opened is a "Foreground" app; the one
/// Orbit starts is an accessory ("UIElement"). O(output).
pub fn is_hidden_instance(lsappinfo: &str) -> bool {
    lsappinfo
        .split_whitespace()
        .find_map(|field| field.strip_prefix("type=\""))
        .map(|kind| kind.trim_end_matches('"'))
        .is_some_and(|kind| kind != "Foreground")
}

/// True while the running Steam for Mac is the hidden one Orbit started.
pub fn running_hidden() -> bool {
    running()
        && Command::new("lsappinfo")
            .args(["info", "-app", BUNDLE_ID])
            .output()
            .is_ok_and(|out| is_hidden_instance(&String::from_utf8_lossy(&out.stdout)))
}

/// `steam_osx -silent` with the hidden-client library. The client is its own
/// process with no output kept.
pub fn hidden_command(binary: &Path) -> Command {
    let mut command = Command::new(binary);
    command
        .arg("-silent")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    if let Some(dir) = binary.parent() {
        command.current_dir(dir);
    }
    crate::runtimes::hidden_client::apply(&mut command);
    command
}

fn spawn_hidden(binary: &Path) -> Result<(), String> {
    let command = hidden_command(binary);
    // Its own session and responsible process, so Steam outlives Orbit like
    // any app and macOS does not attribute it to Orbit.
    #[cfg(target_os = "macos")]
    let mut command = crate::platform::macos::detached_spawn::wrap(&command)
        .map_err(|_| "Could not start Steam".to_string())?;
    #[cfg(not(target_os = "macos"))]
    let mut command = command;
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    command
        .spawn()
        .map(drop)
        .map_err(|_| "Could not start Steam".to_string())
}

/// Starts Steam for Mac silently unless it already runs. Returns true when
/// Orbit started it. Before Steam's first run there is no `steam_osx` yet, so
/// Steam is opened the usual way to set itself up (it shows its window then).
pub fn ensure_running() -> Result<bool, String> {
    if !cfg!(target_os = "macos") {
        return Err("Steam for Mac is available on macOS".into());
    }
    if running() {
        return Ok(false);
    }
    let binary = steam_root()
        .map(|root| client_binary_in(&root))
        .filter(|binary| binary.is_file());
    match binary {
        Some(binary) => spawn_hidden(&binary)?,
        None => open(&["-g", "-b", BUNDLE_ID, "--args", "-silent"])?,
    }
    let started = Instant::now();
    while !running() && started.elapsed() < START_WAIT {
        std::thread::sleep(Duration::from_millis(250));
    }
    Ok(true)
}

/// Hands a `steam://` link to Steam for Mac, starting it silently first, and
/// keeps Orbit in front (`open -g`).
pub fn open_url(url: &str) -> Result<(), String> {
    if !url.starts_with("steam://") {
        return Err("Only steam:// links go to Steam".into());
    }
    ensure_running()?;
    open(&["-g", url])
}

/// Shows Steam for Mac to the person (its library, a store install dialog).
/// Orbit's hidden client cannot show a window, so it is restarted the normal
/// way first; a Steam the person opened just receives the link.
pub fn open_visible(url: &str) -> Result<(), String> {
    if !url.starts_with("steam://") {
        return Err("Only steam:// links go to Steam".into());
    }
    if !cfg!(target_os = "macos") {
        return Err("Steam for Mac is available on macOS".into());
    }
    if running_hidden() {
        quit();
    }
    open(&["-b", BUNDLE_ID, url])
}

/// Quits Steam for Mac and waits for it to exit. Only for a client Orbit
/// started. `steam_osx -shutdown` is Steam's own way to stop the running
/// client (it ignores a plain SIGTERM); AppleScript is the fallback.
pub fn quit() {
    let binary = steam_root()
        .map(|root| client_binary_in(&root))
        .filter(|binary| binary.is_file());
    let asked = binary.is_some_and(|binary| {
        Command::new(binary)
            .arg("-shutdown")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .is_ok()
    });
    if !asked {
        let _ = Command::new("osascript")
            .args([
                "-e",
                &format!("tell application id \"{BUNDLE_ID}\" to quit"),
            ])
            .status();
    }
    let started = Instant::now();
    while running() && started.elapsed() < START_WAIT {
        std::thread::sleep(Duration::from_millis(250));
    }
}

fn open(args: &[&str]) -> Result<(), String> {
    let status = Command::new("open")
        .args(args)
        .status()
        .map_err(|_| "Could not open Steam".to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("Could not open Steam. Make sure Steam for Mac is installed.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_client_runs_from_steams_own_bundle() {
        let root = Path::new("/Users/me/Library/Application Support/Steam");
        assert_eq!(
            client_binary_in(root),
            root.join("Steam.AppBundle/Steam/Contents/MacOS/steam_osx")
        );
    }

    #[test]
    fn every_launch_is_silent_and_loads_the_hidden_client_library() {
        let command = hidden_command(Path::new("/Steam/Contents/MacOS/steam_osx"));
        let args: Vec<_> = command.get_args().collect();
        assert_eq!(args, ["-silent"]);
        assert_eq!(
            command.get_current_dir(),
            Some(Path::new("/Steam/Contents/MacOS"))
        );
        #[cfg(target_os = "macos")]
        assert!(command
            .get_envs()
            .any(|(key, value)| key == "DYLD_INSERT_LIBRARIES" && value.is_some()));
    }

    #[test]
    fn tells_orbits_hidden_client_from_a_steam_the_person_opened() {
        let theirs = r#" 19) "Steam" ASN:0x0-0x2b02b:
    pid = 2424 type="Foreground" flavor=3 Version="6.1""#;
        let orbits = r#" 19) "Steam" ASN:0x0-0x2b02b:
    pid = 2424 type="UIElement" flavor=3 Version="6.1""#;
        assert!(!is_hidden_instance(theirs));
        assert!(is_hidden_instance(orbits));
        assert!(!is_hidden_instance(""));
    }

    #[test]
    fn only_orbits_idle_hidden_client_is_released() {
        // Regression: Orbit's hidden Steam for Mac stayed running after a
        // download and held a 2.4 GHz controller, so Windows games saw none.
        assert!(should_release(true, false));
        assert!(
            !should_release(true, true),
            "a macOS game or download needs it"
        );
        assert!(
            !should_release(false, false),
            "a Steam the person opened stays"
        );
    }

    #[test]
    fn a_download_needs_steam_only_while_it_runs() {
        assert!(!DOWNLOADING.load(Ordering::SeqCst));
        {
            let _download = DownloadUse::begin();
            assert!(DOWNLOADING.load(Ordering::SeqCst));
        }
        assert!(!DOWNLOADING.load(Ordering::SeqCst));
    }

    #[test]
    fn only_steam_links_are_handed_to_steam() {
        assert!(open_url("https://example.com").is_err());
        assert!(open_url("file:///etc/passwd").is_err());
    }
}
