use super::{detection::WineInstallation, process};
use anyhow::{bail, Context, Result};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{atomic::AtomicBool, Arc, Mutex},
    time::Duration,
};

pub fn game_directory(root: &Path, id: &str) -> Result<PathBuf> {
    if id.is_empty()
        || id.len() > 100
        || !id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
    {
        bail!("Invalid game identifier");
    }
    fs::create_dir_all(root)?;
    let root = root.canonicalize()?;
    let path = root.join(id);
    if path
        .symlink_metadata()
        .is_ok_and(|m| m.file_type().is_symlink())
    {
        bail!("Managed game directory cannot be a symlink");
    }
    fs::create_dir_all(&path)?;
    Ok(path)
}

pub fn prepare(
    dir: &Path,
    runtime: &WineInstallation,
    cancel: &AtomicBool,
    log: &Arc<Mutex<fs::File>>,
) -> Result<PathBuf> {
    let prefix = dir.join("prefix");
    if prefix
        .symlink_metadata()
        .is_ok_and(|m| m.file_type().is_symlink())
    {
        bail!("Managed prefix cannot be a symlink");
    }
    let marker = dir.join("runtime.json");
    if marker
        .symlink_metadata()
        .is_ok_and(|m| m.file_type().is_symlink())
    {
        bail!("Runtime marker cannot be a symlink");
    }
    if prefix_ready(&prefix) {
        let previous = read_marker(&marker)?;
        if previous.as_ref().is_some_and(|previous| {
            previous.path == runtime.path && previous.version == runtime.version
        }) {
            return Ok(prefix);
        }
        wineboot(runtime, &prefix, &["wineboot", "-u"], cancel, log)?;
        if !prefix_ready(&prefix) {
            bail!("Wine environment setup failed. See runtime diagnostics");
        }
        fs::write(&marker, serde_json::to_vec(runtime)?)?;
        return Ok(prefix);
    }
    if prefix.exists() {
        let _ = super::wine::stop_prefix(runtime, &prefix);
        reset_incomplete(&prefix, &marker)?;
    }
    let result = (|| -> Result<()> {
        wineboot(runtime, &prefix, &["wineboot", "-i"], cancel, log)?;
        if !prefix_ready(&prefix) {
            bail!("Wine environment setup failed. See runtime diagnostics");
        }
        fs::write(&marker, serde_json::to_vec(runtime)?)?;
        Ok(())
    })();
    if let Err(error) = result {
        if prefix.exists() && super::wine::stop_prefix(runtime, &prefix).is_ok() {
            let _ = fs::remove_dir_all(&prefix);
            let _ = fs::remove_file(&marker);
        }
        return Err(error);
    }
    Ok(prefix)
}

pub fn accept_shared(requested: &Path, allowed: &Path) -> Result<PathBuf> {
    let requested = requested
        .canonicalize()
        .context("Steam for Windows is not ready. Sign in from Settings → Steam.")?;
    let allowed = allowed
        .canonicalize()
        .context("Steam for Windows is not ready. Sign in from Settings → Steam.")?;
    if requested != allowed {
        bail!("This game can only launch in Orbit's Steam for Windows environment");
    }
    if !prefix_ready(&requested) {
        bail!("Sign in with Steam before playing so Windows Steam can finish setting up");
    }
    Ok(requested)
}

fn prefix_ready(prefix: &Path) -> bool {
    prefix.is_dir() && prefix.join("system.reg").is_file()
}

fn read_marker(marker: &Path) -> Result<Option<WineInstallation>> {
    if !marker.exists() {
        return Ok(None);
    }
    Ok(Some(serde_json::from_slice(&fs::read(marker).context(
        "Prefix setup was interrupted. Remove the incomplete environment before retrying",
    )?)?))
}

fn reset_incomplete(prefix: &Path, marker: &Path) -> Result<()> {
    fs::remove_dir_all(prefix).context("Could not reset the incomplete Windows environment")?;
    let _ = fs::remove_file(marker);
    Ok(())
}

fn wineboot(
    runtime: &WineInstallation,
    prefix: &Path,
    args: &[&str],
    cancel: &AtomicBool,
    log: &Arc<Mutex<fs::File>>,
) -> Result<()> {
    let mut boot = process::spawn_logged(
        process::command(Path::new(&runtime.path), prefix).args(args),
        log,
    )?;
    let _ = process::wait_bounded(&mut boot, Duration::from_secs(120), cancel)?;
    let mut wait = process::spawn_logged(
        process::command(Path::new(&runtime.server_path), prefix).arg("-w"),
        log,
    )?;
    let _ = process::wait_bounded(&mut wait, Duration::from_secs(30), cancel)?;
    Ok(())
}
