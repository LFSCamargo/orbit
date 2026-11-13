//! Local Apple Game Porting Toolkit packages. Apple 4.x (and 3.0/4.0 beta
//! payloads) are only available through Apple's authenticated download, so
//! Orbit does not fetch them. It instead detects DMGs the user already
//! downloaded, verifies them against pinned digests when known, and imports
//! the evaluation payload (`redist/lib`) with Apple's license documents.
use super::components::{self, InstalledComponent};
use super::manager::SetupProgress;
use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::atomic::AtomicBool,
    time::Duration,
};

const MAX_DMG_BYTES: u64 = 400_000_000;
const MOUNT_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalGptkPackage {
    pub path: String,
    pub file: String,
    pub version: String,
    /// "evaluation" payloads are the runtime slice Orbit imports; "complete"
    /// toolkits contain the evaluation DMG nested inside.
    pub kind: String,
    pub size_bytes: u64,
    pub digest_verified: bool,
}

#[derive(Debug, Deserialize)]
struct MirrorManifest {
    packages: Vec<MirrorPackage>,
}

#[derive(Debug, Deserialize)]
struct MirrorPackage {
    version: String,
    kind: String,
    file: String,
    sha256: String,
}

fn pinned_digests() -> Vec<MirrorPackage> {
    serde_json::from_str::<MirrorManifest>(include_str!(
        "../../../../../runtime-packages/gptk/manifest.json"
    ))
    .map(|manifest| manifest.packages)
    .unwrap_or_default()
}

fn parse_version(file: &str) -> Option<(String, String)> {
    let stem = file.strip_suffix(".dmg")?;
    if let Some(rest) = stem.strip_prefix("Game_Porting_Toolkit_") {
        return Some((rest.replace('_', " "), "complete".into()));
    }
    if let Some(rest) = stem.strip_prefix("Evaluation_environment_for_Windows_games_") {
        return Some((rest.replace('_', " "), "evaluation".into()));
    }
    None
}

fn scan_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![dirs::download_dir().unwrap_or_default()];
    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join("Applications/GameHub.app"));
        dirs.push(home.join("Downloads/GameHub"));
    }
    dirs.into_iter().filter(|dir| dir.is_dir()).collect()
}

/// Bounded scan (depth 1 per directory) for Apple GPTK DMGs the user already
/// has locally. Symlinked DMGs are rejected; only regular files are listed.
pub fn scan_local_packages() -> Vec<LocalGptkPackage> {
    let mut found = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for dir in scan_dirs() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(name) = path.file_name().map(|n| n.to_string_lossy().into_owned()) else {
                continue;
            };
            if !name.ends_with(".dmg") {
                continue;
            }
            let Some((version, kind)) = parse_version(&name) else {
                continue;
            };
            let Ok(metadata) = path.metadata() else {
                continue;
            };
            if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_DMG_BYTES {
                continue;
            }
            // Reject symlinked packages at the scan boundary.
            if path
                .symlink_metadata()
                .is_ok_and(|m| m.file_type().is_symlink())
            {
                continue;
            }
            if !seen.insert(path.clone()) {
                continue;
            }
            found.push(LocalGptkPackage {
                digest_verified: verify_digest(&path, &version, &kind),
                file: name,
                path: path.to_string_lossy().into_owned(),
                size_bytes: metadata.len(),
                version,
                kind,
            });
        }
    }
    found.sort_by(|a, b| b.version.cmp(&a.version));
    found
}

fn verify_digest(path: &Path, version: &str, kind: &str) -> bool {
    let Some(expected) = pinned_digests()
        .into_iter()
        .find(|package| package.version == version && package.kind == kind)
        .map(|package| package.sha256)
    else {
        return false;
    };
    sha256_of(path).is_ok_and(|actual| actual == expected)
}

fn sha256_of(path: &Path) -> Result<String> {
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 128 * 1024];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

struct Mounted(PathBuf);
impl Drop for Mounted {
    fn drop(&mut self) {
        let _ = run_bounded(
            "hdiutil",
            &["detach", "-quiet", &self.0.to_string_lossy()],
            Duration::from_secs(30),
        );
    }
}

fn run_bounded(program: &str, args: &[&str], timeout: Duration) -> Result<()> {
    let cancel = AtomicBool::new(false);
    let mut child = Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .with_context(|| format!("Cannot run {program}"))?;
    super::process::wait_bounded(&mut child, timeout, &cancel)?;
    Ok(())
}

fn mount_image(image: &Path, mountpoint: &Path) -> Result<()> {
    fs::create_dir_all(mountpoint)?;
    run_bounded(
        "hdiutil",
        &[
            "attach",
            "-nobrowse",
            "-readonly",
            "-mountpoint",
            &mountpoint.to_string_lossy(),
            &image.to_string_lossy(),
        ],
        MOUNT_TIMEOUT,
    )?;
    if !mountpoint.is_dir() {
        bail!("Package could not be mounted");
    }
    Ok(())
}

/// Find the `redist` payload: directly in the mount, or inside the nested
/// evaluation DMG of a complete toolkit (mounted one level deeper).
fn locate_payload(mount: &Path, staging: &Path) -> Result<(PathBuf, Option<Mounted>)> {
    let direct = mount.join("redist");
    if direct.join("lib").is_dir() {
        return Ok((direct, None));
    }
    let nested = fs::read_dir(mount)
        .ok()
        .into_iter()
        .flatten()
        .flatten()
        .map(|entry| entry.path())
        .find(|path| {
            path.is_file()
                && path
                    .extension()
                    .is_some_and(|e| e.eq_ignore_ascii_case("dmg"))
                && path.file_name().is_some_and(|name| {
                    name.to_string_lossy()
                        .starts_with("Evaluation_environment_for_Windows_games_")
                })
        });
    let Some(nested) = nested else {
        bail!("Package does not contain the Windows evaluation environment");
    };
    let inner = staging.join("inner");
    mount_image(&nested, &inner)?;
    let mounted = Mounted(inner.clone());
    let payload = inner.join("redist");
    if !payload.join("lib").is_dir() {
        bail!("Nested evaluation environment is missing its runtime payload");
    }
    Ok((payload, Some(mounted)))
}

fn validate_payload(payload: &Path) -> Result<()> {
    let external = payload.join("lib/external");
    let windows_libs = payload.join("lib/wine/x86_64-windows");
    if !external.join("D3DMetal.framework").exists()
        && !external.join("libd3dshared.dylib").exists()
    {
        bail!("Package is missing the D3DMetal framework");
    }
    if !windows_libs.join("d3d11.dll").is_file() {
        bail!("Package is missing D3DMetal's Windows runtime libraries");
    }
    Ok(())
}

/// Import a locally detected (or user-selected) Apple GPTK DMG. Idempotent:
/// re-importing a version replaces its managed copy after validation. Orbit
/// owns the destination directory; the Apple DMG is never modified.
pub fn import<F>(root: &Path, package_path: &Path, mut progress: F) -> Result<InstalledComponent>
where
    F: FnMut(SetupProgress),
{
    if !cfg!(target_os = "macos") {
        bail!("Apple Game Porting Toolkit import is only available on macOS");
    }
    let name = package_path
        .file_name()
        .context("Package has no file name")?
        .to_string_lossy()
        .into_owned();
    let (version, _kind) = parse_version(&name)
        .context("Expected a Game Porting Toolkit or evaluation environment DMG")?;
    let metadata = package_path
        .metadata()
        .context("Package file is unavailable")?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_DMG_BYTES {
        bail!("Package size is not valid");
    }
    if package_path
        .symlink_metadata()
        .is_ok_and(|m| m.file_type().is_symlink())
    {
        bail!("Package cannot be a symlink");
    }

    progress(SetupProgress::Installing {
        component: format!("gptk {version}"),
    });
    components::ensure_components_root(root)?;
    let staging =
        components::components_root(root).join(format!(".gptk-import-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&staging)?;
    let result = (|| -> Result<()> {
        let mountpoint = staging.join("mount");
        mount_image(package_path, &mountpoint)?;
        let _mounted = Mounted(mountpoint.clone());
        stage_package(&mountpoint, &staging)
    })();
    let outcome = match result {
        Ok(()) => finalize_import(root, &staging, &version),
        Err(error) => Err(error),
    };
    let _ = fs::remove_dir_all(&staging);
    let component = outcome?;
    progress(SetupProgress::Ready {
        component: format!("gptk {}", component.version),
        message: "Apple Game Porting Toolkit is ready".into(),
    });
    Ok(component)
}

/// Copy the runtime payload and Apple's license documents into staging.
fn stage_package(mount: &Path, staging: &Path) -> Result<()> {
    let (payload, _nested) = locate_payload(mount, staging)?;
    validate_payload(&payload)?;
    run_bounded(
        "ditto",
        &[
            &payload.to_string_lossy(),
            &staging.join("redist").to_string_lossy(),
        ],
        Duration::from_secs(300),
    )?;
    if let Some(root_of_payload) = payload.parent() {
        for document in ["License.rtf", "Acknowledgements.rtf", "Read Me.rtf"] {
            let source = root_of_payload.join(document);
            if source.is_file() {
                fs::copy(&source, staging.join(document))?;
            }
        }
    }
    Ok(())
}

fn finalize_import(root: &Path, staging: &Path, version: &str) -> Result<InstalledComponent> {
    let target = components::component_dir(root, "gptk", version);
    // Replacing a previously imported copy is safe: it is Orbit-owned.
    if target.exists() {
        fs::remove_dir_all(&target)?;
    }
    fs::create_dir_all(&target)?;
    run_bounded(
        "ditto",
        &[
            &staging.join("redist").to_string_lossy(),
            &target.join("redist").to_string_lossy(),
        ],
        Duration::from_secs(300),
    )?;
    for document in ["License.rtf", "Acknowledgements.rtf", "Read Me.rtf"] {
        let source = staging.join(document);
        if source.is_file() {
            fs::copy(&source, target.join(document))?;
        }
    }
    let component = InstalledComponent {
        id: "gptk".into(),
        version: version.into(),
        kind: components::ComponentKind::Gptk,
        path: target.to_string_lossy().into_owned(),
        installed_at: chrono::Utc::now().to_rfc3339(),
    };
    components::write_manifest(&target, &component)?;
    Ok(component)
}

/// True when this GPTK version is already registered in Orbit's component
/// store; used by the UI to mark local rows installed.
pub fn is_imported(root: &Path, version: &str) -> bool {
    components::installed_components(root)
        .iter()
        .any(|component| {
            component.kind == components::ComponentKind::Gptk && component.version == version
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_both_package_kinds() {
        assert_eq!(
            parse_version("Game_Porting_Toolkit_4.0_beta_3.dmg").unwrap(),
            ("4.0 beta 3".into(), "complete".into())
        );
        assert_eq!(
            parse_version("Evaluation_environment_for_Windows_games_3.0.dmg").unwrap(),
            ("3.0".into(), "evaluation".into())
        );
        assert!(parse_version("random.dmg").is_none());
    }

    #[test]
    fn pinned_manifest_digests_are_readable() {
        let digests = pinned_digests();
        assert!(digests.len() >= 4);
        assert!(digests.iter().all(|p| p.sha256.len() == 64));
    }

    #[test]
    fn rejects_non_dmg_import() {
        if !cfg!(target_os = "macos") {
            return;
        }
        let root = std::env::temp_dir().join(format!("orbit-gptk-root-{}", uuid::Uuid::new_v4()));
        let file = std::env::temp_dir().join(format!("orbit-gptk-{}.txt", uuid::Uuid::new_v4()));
        fs::write(&file, b"not a dmg").unwrap();
        assert!(import(&root, &file, |_| {}).is_err());
        let _ = fs::remove_file(file);
        let _ = fs::remove_dir_all(root);
    }

    /// Opt-in local validation against a temporary Orbit root: imports the
    /// evaluation DMG found in Downloads and preserves Apple's license files.
    /// Skips silently when absent. Never runs in normal suites.
    #[test]
    #[ignore = "mounts a local Apple package from Downloads"]
    fn real_local_evaluation_import() {
        let packages = scan_local_packages();
        let Some(package) = packages.iter().find(|p| p.kind == "evaluation") else {
            return;
        };
        let root = std::env::temp_dir().join(format!("orbit-gptk-root-{}", uuid::Uuid::new_v4()));
        let component = import(&root, Path::new(&package.path), |_| {}).unwrap();
        assert!(Path::new(&component.path)
            .join("redist/lib/external")
            .is_dir());
        assert!(Path::new(&component.path)
            .join("redist/lib/wine/x86_64-windows/d3d11.dll")
            .is_file());
        assert!(is_imported(&root, &component.version));
        let _ = fs::remove_dir_all(root);
    }
}
