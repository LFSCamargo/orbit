use std::path::Path;
use std::process::Command;
use std::thread;
use std::time::Duration;

use anyhow::{bail, Context, Result};

pub const APP_LAUNCH_DELAY: Duration = Duration::from_secs(3);

/// Opens or activates a macOS `.app` bundle.
pub fn open_macos_app(app_path: &str) -> Result<()> {
    let path = Path::new(app_path);
    if !path.exists() {
        bail!("Application not found at {app_path}");
    }

    let status = Command::new("open")
        .args(["-a", app_path])
        .status()
        .with_context(|| format!("Failed to open application at {app_path}"))?;
    if !status.success() {
        bail!("open exited with {status} while starting {app_path}");
    }
    Ok(())
}

pub fn wait_for_app_launch() {
    thread::sleep(APP_LAUNCH_DELAY);
}
