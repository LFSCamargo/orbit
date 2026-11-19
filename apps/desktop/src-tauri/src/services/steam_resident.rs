//! At most one Orbit Steam client runs at a time. A game's container keeps its
//! Steam logged on after the game exits, so the next launch skips Steam's
//! startup; starting another container's Steam, quitting Orbit, or starting
//! after a crash stops the others. Wine rewrites a process's arguments, so its
//! `WINEPREFIX` is not visible; a Windows process (`.exe`) is matched by its
//! working directory inside the prefix, and a wineserver by its `WINEPREFIX`.
//! That works whichever Wine build started them (builds cannot talk to each
//! other's wineserver). The Mac Steam app, shells sitting in a prefix folder,
//! and anything outside Orbit's prefixes are never touched.
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, Instant};

const GRACE: Duration = Duration::from_secs(4);

/// Stop every Orbit Steam prefix except `keep`. The Settings sign-in client is
/// left alone while its window is open.
pub fn stop_all_except(keep: Option<&Path>) {
    let mut prefixes = container_prefixes();
    if !super::steam_windows::login_in_progress() {
        prefixes.push(super::steam_windows::steam_prefix());
    }
    stop(&prefixes, keep);
}

/// Stop everything still running in one prefix (a client left without its
/// wineserver, for one).
pub fn stop_prefix(prefix: &Path) {
    stop(&[prefix.to_path_buf()], None);
}

fn stop(prefixes: &[PathBuf], keep: Option<&Path>) {
    let find = || pids_to_stop(&Snapshot::take(), prefixes, keep);
    let pids = find();
    if pids.is_empty() {
        return;
    }
    signal(&pids, "-TERM");
    let deadline = Instant::now() + GRACE;
    while Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(250));
        if find().is_empty() {
            return;
        }
    }
    // Found again so a pid reused since TERM is never hit.
    signal(&find(), "-KILL");
}

/// Processes and the facts that tie them to a prefix.
#[derive(Default)]
struct Snapshot {
    /// `pid command` lines without environment.
    commands: String,
    /// `pid command ENV…` lines; only native processes such as wineserver
    /// show their environment.
    environment: String,
    /// pid → working directory.
    cwd: std::collections::HashMap<u32, PathBuf>,
}

impl Snapshot {
    fn take() -> Self {
        Self {
            commands: ps(&["axww", "-o", "pid=,command="]),
            environment: ps(&["axeww", "-o", "pid=,command="]),
            cwd: working_directories(),
        }
    }
}

/// Processes of the given prefixes, except those of `keep`.
fn pids_to_stop(snapshot: &Snapshot, prefixes: &[PathBuf], keep: Option<&Path>) -> Vec<u32> {
    let own = std::process::id();
    let targets: Vec<&PathBuf> = prefixes
        .iter()
        .filter(|prefix| keep != Some(prefix.as_path()))
        .collect();
    let mut pids: Vec<u32> =
        snapshot
            .commands
            .lines()
            .filter_map(|line| {
                let (pid, command) = line.trim_start().split_once(char::is_whitespace)?;
                let pid: u32 = pid.parse().ok()?;
                let windows = command.to_ascii_lowercase().contains(".exe");
                let cwd = snapshot.cwd.get(&pid)?;
                (windows && pid != own && targets.iter().any(|prefix| cwd.starts_with(prefix)))
                    .then_some(pid)
            })
            .chain(targets.iter().flat_map(|prefix| {
                super::container_steam::orphan_pids(&snapshot.environment, prefix)
            }))
            .collect();
    pids.sort_unstable();
    pids.dedup();
    pids
}

fn container_prefixes() -> Vec<PathBuf> {
    let games = crate::runtimes::containers::root_in(&crate::runtimes::root()).join("games");
    let Ok(entries) = std::fs::read_dir(games) else {
        return Vec::new();
    };
    entries
        .flatten()
        .take(256)
        .map(|entry| entry.path().join("prefix"))
        .filter(|prefix| prefix.is_dir())
        .collect()
}

fn ps(args: &[&str]) -> String {
    std::process::Command::new("ps")
        .args(args)
        .output()
        .ok()
        .filter(|output| output.stdout.len() <= 16 * 1024 * 1024)
        .map(|output| String::from_utf8_lossy(&output.stdout).into_owned())
        .unwrap_or_default()
}

/// Every process's working directory, from one `lsof` pass.
fn working_directories() -> std::collections::HashMap<u32, PathBuf> {
    let Ok(output) = std::process::Command::new("/usr/sbin/lsof")
        .args([
            "-a",
            "-d",
            "cwd",
            "-F",
            "pn",
            "-u",
            &current_uid().to_string(),
        ])
        .stderr(Stdio::null())
        .output()
    else {
        return Default::default();
    };
    parse_cwds(&String::from_utf8_lossy(&output.stdout))
}

fn current_uid() -> u32 {
    // SAFETY: getuid has no preconditions.
    unsafe { libc::getuid() }
}

/// `lsof -F pn` output: `p<pid>` lines, each followed by `n<path>` for its cwd.
fn parse_cwds(text: &str) -> std::collections::HashMap<u32, PathBuf> {
    let mut cwds = std::collections::HashMap::new();
    let mut pid = None;
    for line in text.lines().take(200_000) {
        if let Some(value) = line.strip_prefix('p') {
            pid = value.parse::<u32>().ok();
        } else if let (Some(path), Some(current)) = (line.strip_prefix('n'), pid) {
            cwds.insert(current, PathBuf::from(path));
        }
    }
    cwds
}

fn signal(pids: &[u32], name: &str) {
    for pid in pids {
        let _ = std::process::Command::new("kill")
            .args([name, &pid.to_string()])
            .stderr(Stdio::null())
            .status();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_one_orbit_steam_survives() {
        // Regression: after Orbit quit, a container's steam.exe stayed up. Wine
        // hides a process's environment, so WINEPREFIX alone never matched it.
        let re2 = PathBuf::from("/Orbit/containers/games/steam-883710/prefix");
        let gow = PathBuf::from("/Orbit/containers/games/steam-1593500/prefix");
        let sign_in = PathBuf::from("/Orbit/steam-windows/prefix");
        let snapshot = Snapshot {
            commands: "\
 101 /Orbit/containers/games/steam-883710/prefix/drive_c/Steam/steam.exe -silent
 102 C:\\Steam\\bin\\cef\\cef.win64\\steamwebhelper.exe -lang=en_US
 103 C:\\windows\\system32\\services.exe
 201 C:\\Steam\\steam.exe -silent
 301 C:\\Steam\\steam.exe
 401 /bin/zsh
 501 /Applications/Steam.app/Contents/MacOS/steam_osx
 601 /Orbit Wine.app/Contents/MacOS/wineserver
"
            .into(),
            environment: " 601 /Orbit Wine.app/Contents/MacOS/wineserver WINEPREFIX=/Orbit/containers/games/steam-883710/prefix HOME=/u\n".into(),
            cwd: [
                (101, "/Orbit/containers/games/steam-883710/prefix/drive_c/Steam"),
                (102, "/Orbit/containers/games/steam-883710/prefix/drive_c/Steam/bin/cef"),
                (103, "/Orbit/containers/games/steam-883710/prefix/drive_c/windows/system32"),
                (201, "/Orbit/containers/games/steam-1593500/prefix/drive_c/Steam"),
                (301, "/Orbit/steam-windows/prefix/drive_c/Steam"),
                // A shell in a prefix folder is not Wine's.
                (401, "/Orbit/containers/games/steam-883710/prefix/drive_c"),
                (501, "/Applications/Steam.app"),
                (601, "/tmp/.wine-501/server-1-2"),
            ]
            .into_iter()
            .map(|(pid, path)| (pid, PathBuf::from(path)))
            .collect(),
        };
        let prefixes = vec![re2.clone(), gow.clone(), sign_in.clone()];
        assert_eq!(
            pids_to_stop(&snapshot, &prefixes, Some(&gow)),
            vec![101, 102, 103, 301, 601]
        );
        assert_eq!(
            pids_to_stop(&snapshot, &prefixes, Some(&re2)),
            vec![201, 301]
        );
        assert_eq!(
            pids_to_stop(&snapshot, &[re2, gow], None),
            vec![101, 102, 103, 201, 601],
            "the sign-in client is not listed while its window is open"
        );
        // A sibling prefix sharing a name stem is a different prefix.
        let stem = Snapshot {
            commands: " 701 C:\\Steam\\steam.exe\n".into(),
            environment: String::new(),
            cwd: [(
                701,
                PathBuf::from("/Orbit/containers/games/steam-883710/prefix-old/drive_c"),
            )]
            .into_iter()
            .collect(),
        };
        assert!(pids_to_stop(&stem, &prefixes, None).is_empty());
    }

    #[test]
    fn reads_working_directories_from_lsof() {
        let cwds = parse_cwds("p101\nfcwd\nn/Orbit/prefix/drive_c/Steam\np202\nfcwd\nn/\n");
        assert_eq!(
            cwds.get(&101),
            Some(&PathBuf::from("/Orbit/prefix/drive_c/Steam"))
        );
        assert_eq!(cwds.get(&202), Some(&PathBuf::from("/")));
    }
}
