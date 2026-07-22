use anyhow::{bail, Context, Result};
use std::process::Command;

use crate::models::LaunchConfiguration;

pub fn launch_configuration(config: &LaunchConfiguration) -> Result<()> {
    match config {
        LaunchConfiguration::OpenFile {
            file_path,
            application_path,
        } => {
            #[cfg(target_os = "macos")]
            {
                let mut cmd = Command::new("open");
                if let Some(app) = application_path {
                    cmd.args(["-a", app]);
                }
                cmd.arg(file_path);
                let status = cmd.status().context("Failed to open file")?;
                if !status.success() {
                    bail!("open exited with {status}");
                }
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = (file_path, application_path);
                bail!("open-file launching is only implemented for macOS in this MVP");
            }
        }
        LaunchConfiguration::OpenApplication {
            application_path,
            arguments,
        } => {
            #[cfg(target_os = "macos")]
            {
                let mut cmd = Command::new("open");
                cmd.arg(application_path);
                if let Some(args) = arguments {
                    if !args.is_empty() {
                        cmd.arg("--args");
                        cmd.args(args);
                    }
                }
                let status = cmd.status().context("Failed to open application")?;
                if !status.success() {
                    bail!("open exited with {status}");
                }
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = (application_path, arguments);
                bail!("open-application launching is only implemented for macOS in this MVP");
            }
        }
        LaunchConfiguration::OpenUrl { url } => {
            open_url(url)?;
        }
        LaunchConfiguration::Steam { app_id } => {
            open_url(&format!("steam://rungameid/{app_id}"))?;
        }
        LaunchConfiguration::CustomCommand {
            executable,
            arguments,
        } => {
            let status = Command::new(executable)
                .args(arguments)
                .status()
                .with_context(|| format!("Failed to spawn {executable}"))?;
            if !status.success() {
                bail!("custom command exited with {status}");
            }
        }
    }
    Ok(())
}

fn open_url(url: &str) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        let status = Command::new("open")
            .arg(url)
            .status()
            .context("Failed to open URL")?;
        if !status.success() {
            bail!("open exited with {status}");
        }
        Ok(())
    }
    #[cfg(target_os = "windows")]
    {
        let status = Command::new("cmd")
            .args(["/C", "start", "", url])
            .status()
            .context("Failed to open URL")?;
        if !status.success() {
            bail!("start exited with {status}");
        }
        Ok(())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let status = Command::new("xdg-open")
            .arg(url)
            .status()
            .context("Failed to open URL")?;
        if !status.success() {
            bail!("xdg-open exited with {status}");
        }
        Ok(())
    }
}
