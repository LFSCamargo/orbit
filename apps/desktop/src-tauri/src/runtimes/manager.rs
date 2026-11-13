//! Managed macOS compatibility downloads. Users see "Windows compatibility";
//! distribution names and paths stay behind the advanced settings boundary.
use super::components::{self, ComponentSpec};
use super::detection::{probe, WineInstallation};
use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

const PINNED_WINE_ID: &str = "wine-stable";
const PINNED_VERSION: &str = "11.0_1";
const WINE_URL: &str = "https://github.com/Gcenx/macOS_Wine_builds/releases/download/11.0_1/wine-stable-11.0_1-osx64.tar.xz";
const WINE_SHA256: &str = "b50dc50ec7f41d58b115a6b685d4d1315ba3c797bd3aa0f49213f2703cb82388";
const WINE_BYTES: u64 = 185_303_032;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityPackage {
    pub version: String,
    pub download_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityStatus {
    /// System capability flag: managed compatibility is intentionally macOS-only.
    pub supported: bool,
    pub managed: Option<WineInstallation>,
    pub package: CompatibilityPackage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "phase")]
pub enum SetupProgress {
    Downloading {
        component: String,
        downloaded_bytes: u64,
        total_bytes: u64,
    },
    Verifying {
        component: String,
    },
    Extracting {
        component: String,
    },
    Installing {
        component: String,
    },
    Ready {
        component: String,
        message: String,
    },
}

pub fn supported() -> bool {
    cfg!(target_os = "macos")
}

fn require_macos() -> Result<()> {
    if !supported() {
        bail!("Managed Windows compatibility is only available on macOS");
    }
    Ok(())
}

pub fn package() -> CompatibilityPackage {
    CompatibilityPackage {
        version: "11.0.1".into(),
        download_bytes: WINE_BYTES,
    }
}

pub fn status(root: &Path) -> CompatibilityStatus {
    CompatibilityStatus {
        supported: supported(),
        managed: supported()
            .then(|| components::installed_wine(root).or_else(|| detect_legacy_wine(root)))
            .flatten(),
        package: package(),
    }
}

/// Backward compatibility: older installs used a non-versioned directory.
fn detect_legacy_wine(root: &Path) -> Option<WineInstallation> {
    let legacy = root
        .join("wine-11.0_1")
        .join("Wine Stable.app/Contents/Resources/wine/bin/wine");
    probe(&legacy).ok()
}

fn pinned_spec() -> ComponentSpec {
    ComponentSpec {
        id: PINNED_WINE_ID.into(),
        version: PINNED_VERSION.into(),
        url: WINE_URL.into(),
        size: WINE_BYTES,
        sha256: Some(WINE_SHA256.into()),
    }
}

pub fn install<F>(root: &Path, mut progress: F) -> Result<WineInstallation>
where
    F: FnMut(SetupProgress),
{
    require_macos()?;
    let name = format!("{PINNED_WINE_ID} {PINNED_VERSION}");
    if let Some(runtime) = status(root).managed {
        progress(SetupProgress::Ready {
            component: name,
            message: format!("{} is ready", runtime.version),
        });
        return Ok(runtime);
    }
    let component = components::install(root, pinned_spec(), |update| progress(update))?;
    // Legacy callers expect a WineInstallation. Map the component back.
    let path = Path::new(&component.path);
    probe(path).context("Managed runtime activation failed")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn system_flag_controls_availability() {
        assert_eq!(supported(), cfg!(target_os = "macos"));
        let state = status(Path::new("/nonexistent-orbit-runtime"));
        assert_eq!(state.supported, supported());
        assert!(state.managed.is_none());
    }

    /// Opt-in network/macOS validation. Never runs in the normal test suite.
    #[test]
    #[ignore = "downloads the pinned macOS runtime from its official release"]
    fn real_managed_download_and_activation() {
        if !supported() {
            return;
        }
        let root =
            std::env::temp_dir().join(format!("orbit-managed-real-{}", uuid::Uuid::new_v4()));
        let runtime = install(&root, |_| {}).unwrap();
        assert!(runtime.version.starts_with("wine-"));
        assert_eq!(status(&root).managed.unwrap().path, runtime.path);
        let _ = fs::remove_dir_all(root);
    }
}
