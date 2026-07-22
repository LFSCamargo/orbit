use anyhow::{bail, Context, Result};
use std::path::Path;
use std::process::Command;

use crate::importers::detect_gamehub;
use crate::models::{Game, GameProvider, LaunchConfiguration};
use crate::utils::macos_apps::is_switch_rom;
use crate::utils::paths::resolve_switch_base_launch_path;

pub fn launch_game(game: &Game) -> Result<()> {
    match &game.launch_config {
        LaunchConfiguration::Gamehub {
            gamehub_app_path,
            shortcut_app_path,
        } => launch_gamehub_shortcut(gamehub_app_path, shortcut_app_path)?,
        _ if game.provider == GameProvider::Gamehub => launch_legacy_gamehub(game)?,
        _ => launch_configuration(&game.launch_config)?,
    }
    Ok(())
}

pub fn launch_configuration(config: &LaunchConfiguration) -> Result<()> {
    match config {
        LaunchConfiguration::OpenFile {
            file_path,
            application_path,
        } => launch_open_file(file_path, application_path.as_deref())?,
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
        LaunchConfiguration::Gamehub {
            gamehub_app_path,
            shortcut_app_path,
        } => launch_gamehub_shortcut(gamehub_app_path, shortcut_app_path)?,
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

fn launch_legacy_gamehub(game: &Game) -> Result<()> {
    match &game.launch_config {
        LaunchConfiguration::OpenApplication {
            application_path, ..
        } => {
            let gamehub = detect_gamehub()
                .ok_or_else(|| anyhow::anyhow!("GameHub is not installed in /Applications"))?;
            launch_gamehub_shortcut(
                &gamehub.to_string_lossy(),
                application_path,
            )
        }
        LaunchConfiguration::OpenFile { file_path, .. } => {
            let gamehub = detect_gamehub()
                .ok_or_else(|| anyhow::anyhow!("GameHub is not installed in /Applications"))?;
            launch_gamehub_shortcut(&gamehub.to_string_lossy(), file_path)
        }
        _ => launch_configuration(&game.launch_config),
    }
}

fn launch_gamehub_shortcut(_gamehub_app: &str, shortcut_app: &str) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        if !Path::new(shortcut_app).exists() {
            bail!("Game shortcut not found at {shortcut_app}");
        }

        // Shortcuts ship a launcher script that forwards gamehub:// deep links to GameHub.
        let status = Command::new("open")
            .arg(shortcut_app)
            .status()
            .context("Failed to open GameHub game shortcut")?;
        if !status.success() {
            bail!("Failed to open game shortcut (exit {status})");
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (_gamehub_app, shortcut_app);
        bail!("GameHub launching is only implemented for macOS in this MVP");
    }
}

fn launch_open_file(file_path: &str, application_path: Option<&str>) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        let resolved = resolve_switch_base_launch_path(Path::new(file_path))
            .map_err(|error| anyhow::anyhow!(error))?;
        if !resolved.is_file() {
            bail!("Game file not found: {file_path}");
        }

        let launch_path = resolved.to_string_lossy().into_owned();

        // Switch ROMs rely on macOS default app associations (.nsp / .xci → Astris, etc.).
        let status = if is_switch_rom(&resolved) {
            Command::new("open")
                .arg(&launch_path)
                .status()
                .context("Failed to open Switch ROM")?
        } else if let Some(app) = application_path {
            Command::new("open")
                .args(["-a", app])
                .arg(&launch_path)
                .status()
                .context("Failed to open file with application")?
        } else {
            Command::new("open")
                .arg(&launch_path)
                .status()
                .context("Failed to open file")?
        };

        if !status.success() {
            bail!("open exited with {status}");
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (file_path, application_path);
        bail!("open-file launching is only implemented for macOS in this MVP");
    }
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
