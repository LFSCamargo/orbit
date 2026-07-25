use std::path::Path;
use std::process::Command;

use anyhow::{bail, Context, Result};

use crate::launching::app_launch::{open_macos_app, wait_for_app_launch};
use crate::utils::gamehub_shortcut::{
    resolve_gamehub_executable, GAMEHUB_MAIN_BUNDLE_ID,
};

pub const GAMEHUB_PROCESS_NAME: &str = "GameHub";

/// Launch GameHub with a `gamehub://` deep link, matching shortcut `.app` behavior.
pub fn dispatch_gamehub_deep_link(gamehub_app: &str, deep_link: &str) -> Result<()> {
    let gamehub_path = Path::new(gamehub_app);
    if !gamehub_path.exists() {
        bail!("GameHub not found at {gamehub_app}");
    }
    if !deep_link.starts_with("gamehub://") {
        bail!("Invalid GameHub deep link: {deep_link}");
    }

    let binary = resolve_gamehub_executable(gamehub_path)?;
    if binary.is_file() {
        Command::new(&binary)
            .arg(deep_link)
            .spawn()
            .with_context(|| format!("Failed to spawn {} with deep link", binary.display()))?;
        return Ok(());
    }

    let status = Command::new("open")
        .args(["-b", GAMEHUB_MAIN_BUNDLE_ID, "--args", deep_link])
        .status()
        .context("Failed to open GameHub with deep link")?;
    if !status.success() {
        bail!("open exited with {status} while launching GameHub deep link");
    }
    Ok(())
}

/// Open GameHub, wait briefly, then forward the deep link to launch the game.
pub fn launch_gamehub_with_deep_link(gamehub_app: &str, deep_link: &str) -> Result<()> {
    open_macos_app(gamehub_app)?;
    wait_for_app_launch();
    dispatch_gamehub_deep_link(gamehub_app, deep_link)
}
