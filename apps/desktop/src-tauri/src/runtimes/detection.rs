use super::{process::wait_bounded, validation::absolute_file};
use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    process::Stdio,
    sync::atomic::AtomicBool,
    time::Duration,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WineInstallation {
    pub path: String,
    pub server_path: String,
    pub version: String,
}

pub fn probe(path: &Path) -> Result<WineInstallation> {
    let path = absolute_file(path)?;
    let name = path
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or_default();
    if !matches!(name, "wine" | "wine64") {
        bail!("Choose the wine or wine64 executable from a Wine distribution");
    }
    let server = absolute_file(
        &path
            .parent()
            .context("Invalid runtime directory")?
            .join("wineserver"),
    )
    .context("Wine requires a matching wineserver in the same directory")?;
    let mut child = super::process::base_command(&path)
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .context("Cannot execute Wine; check architecture and macOS permissions")?;
    // The first launch of a freshly downloaded x86_64 runtime can include
    // Rosetta/Gatekeeper initialization. Keep a bound, but do not mistake that
    // one-time startup cost for an invalid package.
    let status = wait_bounded(&mut child, Duration::from_secs(20), &AtomicBool::new(false))
        .context("Wine did not start within 20 seconds. If this is the first launch, retry after macOS finishes its security checks; Rosetta 2 is required on Apple Silicon")?;
    use std::io::Read;
    let mut version = String::new();
    child
        .stdout
        .take()
        .unwrap()
        .take(512)
        .read_to_string(&mut version)?;
    if !status.success() || !version.trim().to_ascii_lowercase().starts_with("wine-") {
        bail!("Runtime did not report a supported Wine version");
    }
    Ok(WineInstallation {
        path: path.to_string_lossy().into_owned(),
        server_path: server.to_string_lossy().into_owned(),
        version: version.trim().into(),
    })
}

/// Bounded candidate discovery, O(PATH directories + known application roots).
/// Paths are hints only: every result must pass a real version probe.
pub fn detect(custom: Option<&str>) -> Vec<WineInstallation> {
    let mut candidates = Vec::new();
    if let Some(p) = custom {
        candidates.push(PathBuf::from(p));
    }
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path).take(64) {
            if dir.is_absolute() {
                candidates.push(dir.join("wine"));
                candidates.push(dir.join("wine64"));
            }
        }
    }
    for root in [
        PathBuf::from("/Applications"),
        dirs::home_dir().unwrap_or_default().join("Applications"),
    ] {
        for app in ["Wine Stable.app", "Wine Staging.app", "Wine Devel.app"] {
            candidates.push(root.join(app).join("Contents/Resources/wine/bin/wine"));
        }
    }
    for dir in ["/opt/homebrew/bin", "/usr/local/bin"] {
        candidates.push(PathBuf::from(dir).join("wine"));
    }
    let mut seen = HashSet::new();
    candidates
        .into_iter()
        .filter_map(|p| p.canonicalize().ok())
        .filter(|p| seen.insert(p.clone()))
        .filter_map(|p| probe(&p).ok())
        .collect()
}
