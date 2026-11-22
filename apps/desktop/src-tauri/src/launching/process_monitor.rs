use anyhow::{Context, Result};
use std::process::Command;

/// `kill(pid, 0)`: a syscall instead of spawning `kill -0` every poll while a
/// game plays. EPERM still means the process exists.
pub fn is_process_running(pid: u32) -> bool {
    let Ok(pid) = libc::pid_t::try_from(pid) else {
        return false;
    };
    if pid <= 0 {
        // 0 and negatives address process groups, never one game.
        return false;
    }
    // SAFETY: signal 0 only checks that the pid exists; nothing is delivered.
    let result = unsafe { libc::kill(pid, 0) };
    result == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

pub fn terminate_pid(pid: u32) -> Result<()> {
    let status = Command::new("kill")
        .arg(pid.to_string())
        .status()
        .with_context(|| format!("Failed to terminate pid {pid}"))?;
    if !status.success() {
        anyhow::bail!("kill exited with {status}");
    }
    Ok(())
}

pub fn list_process_pids_by_name(name: &str) -> Result<Vec<u32>> {
    let output = Command::new("pgrep")
        .args(["-if", name])
        .output()
        .with_context(|| format!("Failed to run pgrep for {name}"))?;

    if !output.status.success() && output.stdout.is_empty() {
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout
        .lines()
        .filter_map(|line| line.trim().parse::<u32>().ok())
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_current_process_is_running_and_an_unused_pid_is_not() {
        assert!(is_process_running(std::process::id()));
        assert!(!is_process_running(i32::MAX as u32));
    }

    #[test]
    fn pid_zero_and_overflowing_pids_never_count_as_a_game() {
        // kill(0, 0) would test Orbit's own process group and succeed.
        assert!(!is_process_running(0));
        assert!(!is_process_running(u32::MAX));
    }
}
