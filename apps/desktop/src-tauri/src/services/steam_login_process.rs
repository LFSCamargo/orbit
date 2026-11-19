//! Identify only the managed Steam browser's native process for modal placement.
use crate::runtimes::process::wait_bounded;
use anyhow::{bail, Context, Result};
use std::{
    io::Read,
    path::Path,
    process::{Command, Stdio},
    sync::atomic::AtomicBool,
    time::Duration,
};

pub fn browser_pids(original: &Path) -> Result<Vec<u32>> {
    let mut child = Command::new("/bin/ps")
        .args(["-axo", "pid=,comm="])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()?;
    // Drain concurrently so a busy host's process list cannot fill the pipe.
    let stdout = child.stdout.take().context("Missing process list")?;
    let reader = std::thread::spawn(move || {
        let mut output = String::new();
        stdout
            .take(1_048_577)
            .read_to_string(&mut output)
            .map(|_| output)
    });
    let status = wait_bounded(&mut child, Duration::from_secs(2), &AtomicBool::new(false));
    let output = reader
        .join()
        .map_err(|_| anyhow::anyhow!("Process list reader stopped"))??;
    if !status?.success() {
        bail!("Could not locate Steam's sign-in window");
    }
    if output.len() > 1_048_576 {
        bail!("Process list exceeds the supported size");
    }
    Ok(matching_pids(&output, original))
}
fn normalize(path: &str) -> String {
    path.replace('\\', "/")
        .trim_start_matches("Z:")
        .trim_start_matches("z:")
        .to_ascii_lowercase()
}
fn matching_pids(output: &str, executable: &Path) -> Vec<u32> {
    let expected = normalize(&executable.to_string_lossy());
    output
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            let (pid, path) = line.split_once(char::is_whitespace)?;
            let pid = pid.parse::<u32>().ok()?;
            (pid > 0 && normalize(path.trim()) == expected).then_some(pid)
        })
        .take(8)
        .collect()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ignores_native_steam_games_and_other_wine_prefixes() {
        let path = Path::new("/Managed Steam/bin/steamwebhelper-orbit-original.exe");
        let text = "1 /Applications/Steam.app/Steam\n2 Z:\\Managed Steam\\bin\\steamwebhelper-orbit-original.exe\n3 /Other/bin/steamwebhelper-orbit-original.exe\n4 /Managed Steam/bin/steamwebhelper-orbit-original.exe\n";
        assert_eq!(matching_pids(text, path), vec![2, 4]);
    }
}
