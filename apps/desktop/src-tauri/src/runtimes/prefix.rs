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
    if prefix.exists() {
        if !prefix.is_dir() || !prefix.join("system.reg").is_file() {
            bail!("The managed Windows environment is incomplete");
        }
        let previous: WineInstallation = serde_json::from_slice(&fs::read(&marker).context(
            "Prefix setup was interrupted. Remove the incomplete environment before retrying",
        )?)?;
        if previous.path != runtime.path || previous.version != runtime.version {
            bail!("This environment belongs to a different runtime/version. Restore that runtime or reset the environment before switching");
        }
        return Ok(prefix);
    }
    fs::create_dir(&prefix)?;
    let result = (|| -> Result<()> {
        let mut boot = process::spawn_logged(
            process::command(Path::new(&runtime.path), &prefix).args(["wineboot", "-i"]),
            log,
        )?;
        let status = process::wait_bounded(&mut boot, Duration::from_secs(120), cancel)?;
        if !status.success() {
            bail!("Wine environment setup failed ({status}). See runtime diagnostics");
        }
        let mut wait = process::spawn_logged(
            process::command(Path::new(&runtime.server_path), &prefix).arg("-w"),
            log,
        )?;
        if !process::wait_bounded(&mut wait, Duration::from_secs(30), cancel)?.success() {
            bail!("Wine server failed during setup");
        }
        if !prefix.join("system.reg").is_file() {
            bail!("Wine did not create a usable environment");
        }
        fs::write(&marker, serde_json::to_vec(runtime)?)?;
        Ok(())
    })();
    if let Err(error) = result {
        // Only remove the new, Orbit-owned environment after its server stops.
        if super::wine::stop_prefix(runtime, &prefix).is_ok() {
            let _ = fs::remove_dir_all(&prefix);
            let _ = fs::remove_file(marker);
        }
        return Err(error);
    }
    Ok(prefix)
}
