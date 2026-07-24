use anyhow::{bail, Context, Result};
use std::path::Path;
use std::process::Command;

use crate::importers::detect_gamehub;
use crate::launching::context::LaunchContext;
use crate::launching::gamehub_readiness::{launch_gamehub_with_deep_link, GAMEHUB_PROCESS_NAME};
use crate::launching::screen_placement::{
    astris_app_path, screen_watcher_process_names, STEAM_PROCESS_NAME,
};
use crate::models::{Game, GameProvider, LaunchConfiguration};
use crate::utils::gamehub_shortcut::deep_link_from_shortcut;
use crate::utils::macos_apps::is_switch_rom;
use crate::utils::paths::resolve_switch_base_launch_path;

pub fn launch_game(game: &Game, ctx: &LaunchContext) -> Result<()> {
    spawn_screen_watchers(game, ctx);

    match &game.launch_config {
        LaunchConfiguration::Gamehub {
            gamehub_app_path,
            shortcut_app_path,
        } => launch_gamehub_shortcut(gamehub_app_path, shortcut_app_path, ctx)?,
        _ if game.provider == GameProvider::Gamehub => launch_legacy_gamehub(game, ctx)?,
        _ => launch_configuration(&game.launch_config, ctx, game.provider.clone())?,
    }
    Ok(())
}

fn spawn_screen_watchers(game: &Game, ctx: &LaunchContext) {
    let names = match game.provider {
        GameProvider::Gamehub => vec![GAMEHUB_PROCESS_NAME.to_string()],
        GameProvider::Steam => vec![STEAM_PROCESS_NAME.to_string()],
        _ => screen_watcher_process_names(&game.launch_config, game.provider.clone()),
    };
    if names.is_empty() {
        return;
    }
    ctx.spawn_fullscreen_watchers(names.iter().map(String::as_str));
}

pub fn launch_configuration(
    config: &LaunchConfiguration,
    ctx: &LaunchContext,
    provider: GameProvider,
) -> Result<()> {
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
        } => launch_gamehub_shortcut(gamehub_app_path, shortcut_app_path, ctx)?,
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
    let _ = (ctx, provider);
    Ok(())
}

fn launch_legacy_gamehub(game: &Game, ctx: &LaunchContext) -> Result<()> {
    match &game.launch_config {
        LaunchConfiguration::OpenApplication {
            application_path, ..
        } => {
            let gamehub = detect_gamehub()
                .ok_or_else(|| anyhow::anyhow!("GameHub is not installed in /Applications"))?;
            launch_gamehub_shortcut(
                &gamehub.to_string_lossy(),
                application_path,
                ctx,
            )
        }
        LaunchConfiguration::OpenFile { file_path, .. } => {
            let gamehub = detect_gamehub()
                .ok_or_else(|| anyhow::anyhow!("GameHub is not installed in /Applications"))?;
            launch_gamehub_shortcut(&gamehub.to_string_lossy(), file_path, ctx)
        }
        _ => launch_configuration(&game.launch_config, ctx, game.provider.clone()),
    }
}

fn launch_gamehub_shortcut(gamehub_app: &str, shortcut_app: &str, ctx: &LaunchContext) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        let shortcut_path = Path::new(shortcut_app);
        if !shortcut_path.exists() {
            bail!("Game shortcut not found at {shortcut_app}");
        }

        let deep_link = deep_link_from_shortcut(shortcut_path)?;
        launch_gamehub_with_deep_link(gamehub_app, &deep_link)?;
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (gamehub_app, shortcut_app, ctx);
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

        let status = if is_switch_rom(&resolved) {
            if let Some(astris_app) = astris_app_path() {
                Command::new("open")
                    .args(["-a", &astris_app.to_string_lossy()])
                    .arg(&launch_path)
                    .status()
                    .context("Failed to open Switch ROM with Astris")?
            } else {
                Command::new("open")
                    .arg(&launch_path)
                    .status()
                    .context("Failed to open Switch ROM")?
            }
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
