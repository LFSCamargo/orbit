use anyhow::{Context, Result};
use std::process::Command;

pub fn is_process_running(pid: u32) -> bool {
    Command::new("kill")
        .args(["-0", &pid.to_string()])
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
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
