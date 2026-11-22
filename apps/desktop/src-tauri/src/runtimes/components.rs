//! Managed installation of individual compatibility components from the online
//! catalog or a user-supplied path. Each component lives in its own versioned
//! directory under `runtimes/components/` and writes a manifest after successful
//! validation.
use super::detection::{probe, WineInstallation};
use super::manager::SetupProgress;
use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};

const COMPONENTS_DIR: &str = "components";
const MANIFEST_FILE: &str = "orbit-component.json";
const MAX_DOWNLOAD_BYTES: u64 = 1_000_000_000;
const DOWNLOAD_TIMEOUT_SECS: u64 = 900;

pub(crate) static INSTALL_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ComponentKind {
    Wine,
    Dxvk,
    Dxmt,
    MoltenVk,
    Gptk,
    Vkd3dProton,
    Zink,
    XgameRuntime,
}

impl ComponentKind {
    fn from_component_id(id: &str) -> Option<Self> {
        match id {
            "wine-stable" | "wine-devel" | "wine-staging" => Some(ComponentKind::Wine),
            "dxvk" => Some(ComponentKind::Dxvk),
            "dxmt" => Some(ComponentKind::Dxmt),
            "moltenvk" => Some(ComponentKind::MoltenVk),
            "gptk" => Some(ComponentKind::Gptk),
            "vkd3d-proton" => Some(ComponentKind::Vkd3dProton),
            "zink" => Some(ComponentKind::Zink),
            "xgameruntime" => Some(ComponentKind::XgameRuntime),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledComponent {
    pub id: String,
    pub version: String,
    pub kind: ComponentKind,
    pub path: String,
    pub installed_at: String,
}

impl InstalledComponent {
    pub fn is_wine(&self) -> bool {
        matches!(self.kind, ComponentKind::Wine)
    }

    pub fn graphics_backend(&self) -> Option<super::settings::GraphicsBackend> {
        match self.kind {
            ComponentKind::Dxvk => Some(super::settings::GraphicsBackend::Dxvk),
            ComponentKind::Dxmt => Some(super::settings::GraphicsBackend::Dxmt),
            ComponentKind::Gptk => Some(super::settings::GraphicsBackend::D3dmetal),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentSpec {
    pub id: String,
    pub version: String,
    pub url: String,
    pub size: u64,
    pub sha256: Option<String>,
}

pub fn components_root(root: &Path) -> PathBuf {
    root.join(COMPONENTS_DIR)
}

pub(crate) fn component_dir(root: &Path, id: &str, version: &str) -> PathBuf {
    let safe_version = version
        .replace(['/', '\\'], "-")
        .replace("..", "-")
        .replace(|c: char| c.is_whitespace(), "_");
    components_root(root).join(id).join(safe_version)
}

fn manifest_path(dir: &Path) -> PathBuf {
    dir.join(MANIFEST_FILE)
}

fn load_manifest(dir: &Path) -> Result<InstalledComponent> {
    let bytes = fs::read(manifest_path(dir))
        .with_context(|| format!("Cannot read component manifest at {}", dir.display()))?;
    serde_json::from_slice(&bytes).context("Corrupt component manifest")
}

/// Whether a payload's native bridge can load in Orbit's Wine, which runs as
/// x86_64 under Rosetta. Payloads with a Unix side (DXMT's winemetal, GPTK)
/// must ship `x86_64-unix`; an `aarch64-unix`-only build (an ARM64EC engine)
/// fails to initialise. PE-only payloads (DXVK) always qualify.
pub fn runs_on_x86_64_wine(path: &Path) -> bool {
    let mut unix_dirs = Vec::new();
    for dir in [
        path.to_path_buf(),
        path.join("wine"),
        path.join("lib/wine"),
        path.join("redist/lib/wine"),
    ] {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten().take(64) {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.ends_with("-unix") && entry.path().is_dir() {
                unix_dirs.push(name);
            }
        }
    }
    unix_dirs.is_empty() || unix_dirs.iter().any(|name| name == "x86_64-unix")
}

pub fn installed_components(root: &Path) -> Vec<InstalledComponent> {
    let root = components_root(root);
    let mut components = Vec::new();
    let Ok(entries) = fs::read_dir(&root) else {
        return components;
    };
    for entry in entries.flatten() {
        let id_path = entry.path();
        if !id_path.is_dir() {
            continue;
        }
        let Ok(versions) = fs::read_dir(&id_path) else {
            continue;
        };
        for version_entry in versions.flatten() {
            let dir = version_entry.path();
            if !dir.is_dir() {
                continue;
            }
            if let Ok(component) = load_manifest(&dir) {
                components.push(component);
            }
        }
    }
    components
}

pub fn is_installed(root: &Path, id: &str) -> bool {
    installed_components(root).iter().any(|c| c.id == id)
}

pub fn installed_wine(root: &Path) -> Option<WineInstallation> {
    installed_components(root)
        .into_iter()
        .find(|c| c.is_wine())
        .and_then(|c| probe(Path::new(&c.path)).ok())
}

pub(crate) fn ensure_components_root(root: &Path) -> Result<()> {
    fs::create_dir_all(components_root(root))?;
    Ok(())
}

/// Stream a component download with byte progress. Events are throttled to
/// roughly one percent so a slow mirror cannot flood the IPC channel, and the
/// final count is always reported.
fn download_bytes(url: &str, expected_size: u64, progress: &mut dyn FnMut(u64)) -> Result<Vec<u8>> {
    let client = reqwest::blocking::Client::builder()
        .user_agent(concat!("Orbit/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(DOWNLOAD_TIMEOUT_SECS))
        .build()
        .context("Orbit could not prepare its download connection. Retry the install")?;
    let file = url.rsplit('/').next().unwrap_or(url);
    let response = client
        .get(url)
        .send()
        .map_err(|error| {
            if error.is_timeout() {
                anyhow::anyhow!(
                    "The download of {file} timed out after {} minutes. Check your connection and retry",
                    DOWNLOAD_TIMEOUT_SECS / 60
                )
            } else if error.is_connect() {
                anyhow::anyhow!(
                    "Orbit could not reach the download service for {file}. Check your network and retry"
                )
            } else {
                anyhow::anyhow!("The download of {file} failed: {error}. You can retry safely")
            }
        })?;
    let status = response.status();
    if !status.is_success() {
        let reason = match status.as_u16() {
            404 => "the package is no longer published. Choose another version",
            403 | 401 => "the host refused the download",
            code if code >= 500 => "the download service is unavailable. Try again later",
            _ => "the download failed",
        };
        bail!(
            "Cannot download {file}: HTTP {} — {reason}",
            status.as_u16()
        );
    }
    let mut response = response;

    let mut bytes = Vec::with_capacity(expected_size.min(MAX_DOWNLOAD_BYTES) as usize);
    let mut buffer = [0u8; 64 * 1024];
    let mut last_report = 0u64;
    let step = (expected_size / 100).max(64 * 1024).max(1);
    loop {
        let count = response.read(&mut buffer).map_err(|error| {
            anyhow::anyhow!(
                "The download of {file} stopped after {} MB: {error}. You can retry safely",
                bytes.len() / 1_000_000
            )
        })?;
        if count == 0 {
            break;
        }
        if (bytes.len() + count) as u64 > MAX_DOWNLOAD_BYTES {
            bail!(
                "The download of {file} grew past Orbit's {} MB safety limit. The host served an unexpected file",
                MAX_DOWNLOAD_BYTES / 1_000_000
            );
        }
        bytes.extend_from_slice(&buffer[..count]);
        let downloaded = bytes.len() as u64;
        if downloaded - last_report >= step {
            last_report = downloaded;
            progress(downloaded);
        }
    }
    if expected_size > 0 && (bytes.len() as u64) < expected_size {
        bail!(
            "The download of {file} ended early: got {} MB of the expected {} MB. Retry the install",
            bytes.len() / 1_000_000,
            expected_size / 1_000_000
        );
    }
    progress(bytes.len() as u64);
    Ok(bytes)
}

fn verify_digest(bytes: &[u8], expected: &str) -> Result<()> {
    let actual = format!("{:x}", Sha256::digest(bytes));
    if actual != expected {
        bail!("Download failed its security check. Try again");
    }
    Ok(())
}

fn target_stays_inside(base: &Path, target: &Path) -> bool {
    if target.is_absolute() {
        return false;
    }
    let mut depth = 0usize;
    for component in base.join(target).components() {
        match component {
            std::path::Component::Normal(_) => depth += 1,
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                if depth == 0 {
                    return false;
                }
                depth -= 1;
            }
            std::path::Component::RootDir | std::path::Component::Prefix(_) => return false,
        }
    }
    true
}

fn extract_tar(bytes: &[u8], destination: &Path) -> Result<()> {
    let decoder = xz2::read::XzDecoder::new(bytes);
    let mut archive = tar::Archive::new(decoder);
    extract_archive_entries(&mut archive, destination)
}

fn extract_tar_gz(bytes: &[u8], destination: &Path) -> Result<()> {
    let decoder = flate2::read::GzDecoder::new(bytes);
    let mut archive = tar::Archive::new(decoder);
    extract_archive_entries(&mut archive, destination)
}

pub(crate) fn extract_archive_entries<R: Read>(
    archive: &mut tar::Archive<R>,
    destination: &Path,
) -> Result<()> {
    for entry in archive.entries().context("Cannot read archive")? {
        let mut entry = entry.context("Cannot read archive entry")?;
        let kind = entry.header().entry_type();
        if !kind.is_file() && !kind.is_dir() && !kind.is_symlink() && !kind.is_hard_link() {
            bail!("Archive contains an unsupported link or file type");
        }
        if kind.is_symlink() || kind.is_hard_link() {
            let target = entry
                .link_name()
                .context("Cannot inspect archive link")?
                .context("Archive link has no target")?;
            let base = if kind.is_symlink() {
                entry
                    .path()?
                    .parent()
                    .unwrap_or(Path::new(""))
                    .to_path_buf()
            } else {
                PathBuf::new()
            };
            if !target_stays_inside(&base, &target) {
                bail!("Archive link escapes the managed directory");
            }
        }
        let unpacked = entry
            .unpack_in(destination)
            .context("Archive contains an unsafe path")?;
        if !unpacked {
            bail!("Archive contains an unsafe path");
        }
    }
    Ok(())
}

fn extract(bytes: &[u8], destination: &Path, archive_kind: ArchiveKind) -> Result<()> {
    match archive_kind {
        ArchiveKind::Tar => extract_tar_plain(bytes, destination),
        ArchiveKind::TarXz => extract_tar(bytes, destination),
        ArchiveKind::TarGz => extract_tar_gz(bytes, destination),
        ArchiveKind::TarZst => extract_tar_zst(bytes, destination),
    }
}

fn extract_tar_zst(bytes: &[u8], destination: &Path) -> Result<()> {
    let decoder = zstd::stream::read::Decoder::new(bytes).context("Cannot decode zstd package")?;
    let mut archive = tar::Archive::new(decoder);
    extract_archive_entries(&mut archive, destination)
}

fn extract_tar_plain(bytes: &[u8], destination: &Path) -> Result<()> {
    let mut archive = tar::Archive::new(bytes);
    extract_archive_entries(&mut archive, destination)
}

#[derive(Debug, Clone, Copy)]
enum ArchiveKind {
    Tar,
    TarXz,
    TarGz,
    TarZst,
}

fn archive_kind(name: &str) -> Result<ArchiveKind> {
    if name.ends_with(".tar.xz") {
        Ok(ArchiveKind::TarXz)
    } else if name.ends_with(".tar.gz") || name.ends_with(".tgz") {
        Ok(ArchiveKind::TarGz)
    } else if name.ends_with(".tar.zst") || name.ends_with(".tzst") {
        Ok(ArchiveKind::TarZst)
    } else if name.ends_with(".tar") {
        Ok(ArchiveKind::Tar)
    } else {
        bail!("Unsupported archive format: {name}")
    }
}

/// Bounded recursive search for a file whose name matches. Archives from
/// different vendors nest the payload at different depths (and flattening one
/// level during activation shifts every path), so validation never hardcodes
/// one layout. The visit cap keeps the walk O(size) but strictly bounded.
fn find_file_within(dir: &Path, matches: impl Fn(&Path, &str) -> bool) -> Option<PathBuf> {
    let mut visited = 0usize;
    let mut stack = vec![dir.to_path_buf()];
    while let Some(current) = stack.pop() {
        let Ok(entries) = fs::read_dir(&current) else {
            continue;
        };
        for entry in entries.flatten() {
            visited += 1;
            if visited > 20_000 {
                return None;
            }
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_dir() {
                stack.push(path);
                continue;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            if matches(&path, &name) {
                return Some(path);
            }
        }
    }
    None
}

fn is_wine_launcher(path: &Path, name: &str) -> bool {
    (name == "wine" || name == "wine64")
        && path.parent().is_some_and(|parent| {
            parent
                .file_name()
                .is_some_and(|dir| dir == std::ffi::OsStr::new("bin"))
        })
}

fn validate_installation(dir: &Path, kind: ComponentKind) -> Result<String> {
    match kind {
        ComponentKind::Wine => {
            let executable = find_file_within(dir, is_wine_launcher).with_context(|| {
                format!(
                    "The downloaded Wine package has no wine or wine64 binary under a bin/ directory ({}). The upstream build may be malformed; try another version",
                    dir.display()
                )
            })?;
            let runtime = probe(&executable).with_context(|| {
                format!(
                    "Wine {} started but failed its probe. On Apple Silicon this usually means Rosetta 2 is missing or macOS blocked the first launch; install it from System Settings and retry",
                    executable.display()
                )
            })?;
            Ok(runtime.path)
        }
        ComponentKind::MoltenVk => {
            let lib = find_file_within(dir, |_, name| name == "libMoltenVK.dylib")
                .context("The downloaded MoltenVK package does not contain libMoltenVK.dylib")?;
            Ok(lib.to_string_lossy().into_owned())
        }
        ComponentKind::Dxvk => {
            let dll = find_file_within(dir, |path, name| {
                name == "d3d11.dll"
                    && path.parent().is_some_and(|parent| {
                        parent.file_name().is_some_and(|dir| {
                            dir == std::ffi::OsStr::new("x64") || dir == std::ffi::OsStr::new("x32")
                        })
                    })
            })
            .context("The downloaded DXVK package does not contain its d3d11 DLLs")?;
            // Store the directory that holds x64/x32 so launch can find both.
            let root = dll
                .parent()
                .and_then(|parent| parent.parent())
                .unwrap_or(dir);
            Ok(root.to_string_lossy().into_owned())
        }
        ComponentKind::Dxmt => {
            // Current 3Shain releases are Wine builtin trees (`x86_64-windows`),
            // not the older `x64/` directory. Either layout is a real payload.
            let dll = find_file_within(dir, |path, name| {
                name == "d3d11.dll"
                    && path.parent().is_some_and(|parent| {
                        parent.file_name().is_some_and(|dir| {
                            dir == std::ffi::OsStr::new("x64")
                                || dir == std::ffi::OsStr::new("x86_64-windows")
                        })
                    })
            })
            .context(
                "The downloaded DXMT package does not contain d3d11.dll under x86_64-windows or x64",
            )?;
            let root = dll
                .parent()
                .and_then(|parent| parent.parent())
                .unwrap_or(dir);
            Ok(root.to_string_lossy().into_owned())
        }
        ComponentKind::Gptk => {
            // Community GPTK tarballs contain a patched Wine build plus Apple's
            // D3DMetal frameworks. Locate the payload with a bounded walk; a
            // package without either marker is rejected instead of half-trusted.
            let mut has_wine = false;
            let mut has_d3dmetal = false;
            let mut visited = 0usize;
            let mut stack = vec![dir.to_path_buf()];
            while let Some(current) = stack.pop() {
                let Ok(entries) = fs::read_dir(&current) else {
                    continue;
                };
                for entry in entries.flatten() {
                    visited += 1;
                    if visited > 20_000 {
                        break;
                    }
                    let path = entry.path();
                    let Ok(file_type) = entry.file_type() else {
                        continue;
                    };
                    if file_type.is_dir() {
                        stack.push(path);
                        continue;
                    }
                    match entry.file_name().to_string_lossy().as_ref() {
                        "libD3DMetal.dylib" => has_d3dmetal = true,
                        "wine" | "wine64"
                            if path.parent().is_some_and(|p| {
                                p.file_name() == Some(std::ffi::OsStr::new("bin"))
                            }) =>
                        {
                            has_wine = true
                        }
                        _ => {}
                    }
                    if has_wine && has_d3dmetal {
                        break;
                    }
                }
                if has_wine && has_d3dmetal {
                    break;
                }
            }
            if !has_wine && !has_d3dmetal {
                // Engine-style GPTK packages ship the framework inside
                // external/D3DMetal.framework instead of a loose dylib.
                let framework = find_file_within(dir, |_, name| name == "D3DMetal.framework");
                if framework.is_none() {
                    bail!("Extracted GPTK package is missing the D3DMetal framework and Wine binaries");
                }
            }
            Ok(dir.to_string_lossy().into_owned())
        }
        ComponentKind::Vkd3dProton => {
            // Upstream releases are Wine builtin trees (`x86_64-windows`); some
            // redistributions keep the classic `x64/` layout. Either is valid.
            let dll = find_file_within(dir, |path, name| {
                name == "d3d12.dll"
                    && path.parent().is_some_and(|parent| {
                        parent.file_name().is_some_and(|dir| {
                            dir == std::ffi::OsStr::new("x64")
                                || dir == std::ffi::OsStr::new("x86_64-windows")
                        })
                    })
            })
            .context(
                "The vkd3d-proton package does not contain d3d12.dll under x86_64-windows or x64",
            )?;
            let root = dll
                .parent()
                .and_then(|parent| parent.parent())
                .unwrap_or(dir);
            Ok(root.to_string_lossy().into_owned())
        }
        ComponentKind::Zink => {
            // Mesa's zink gallium driver: Wine-patched builds ship libwine_mesa_zink.dylib,
            // Linux-style builds ship zink_dri.so, and some macOS builds expose
            // libzink.dylib. The directory holding the driver is the payload.
            let driver = find_file_within(dir, |_, name| {
                name == "libwine_mesa_zink.dylib"
                    || name == "zink_dri.so"
                    || name == "libzink.dylib"
            })
            .context("The zink package does not contain a zink driver library")?;
            let root = driver.parent().unwrap_or(dir);
            Ok(root.to_string_lossy().into_owned())
        }
        ComponentKind::XgameRuntime => {
            // LGPL-2.1 xgameruntime.dll (GDK / Xbox Gaming Runtime bridge for Wine).
            let dll = find_file_within(dir, |_, name| name.eq_ignore_ascii_case("xgameruntime.dll"))
                .context("The xgameruntime package does not contain xgameruntime.dll")?;
            let root = dll.parent().unwrap_or(dir);
            Ok(root.to_string_lossy().into_owned())
        }
    }
}

pub(crate) fn write_manifest(dir: &Path, component: &InstalledComponent) -> Result<()> {
    fs::write(manifest_path(dir), serde_json::to_vec_pretty(component)?)?;
    Ok(())
}

fn label(spec: &ComponentSpec) -> String {
    format!("{} {}", spec.id, spec.version)
}

/// Install a component from pre-downloaded bytes. Exposed for tests so the
/// extraction/validation path can run without network access.
pub fn install_from_bytes<F>(
    root: &Path,
    spec: ComponentSpec,
    bytes: &[u8],
    mut progress: F,
) -> Result<InstalledComponent>
where
    F: FnMut(SetupProgress),
{
    if !cfg!(target_os = "macos") {
        bail!("Managed components are only available on macOS");
    }
    let _guard = INSTALL_LOCK
        .lock()
        .map_err(|_| anyhow::anyhow!("Component setup is already in progress"))?;

    let kind = ComponentKind::from_component_id(&spec.id)
        .with_context(|| format!("Unknown component id: {}", spec.id))?;

    ensure_components_root(root)?;
    let dir = component_dir(root, &spec.id, &spec.version);
    let name = label(&spec);
    if manifest_path(&dir).is_file() {
        let existing = load_manifest(&dir)?;
        progress(SetupProgress::Ready {
            component: name.clone(),
            message: "Already installed".into(),
        });
        return Ok(existing);
    }

    progress(SetupProgress::Verifying {
        component: name.clone(),
    });
    if let Some(expected) = &spec.sha256 {
        verify_digest(bytes, expected)?;
    }

    progress(SetupProgress::Extracting {
        component: name.clone(),
    });

    let staging = components_root(root).join(format!(
        ".installing-{}-{}-{}",
        spec.id,
        spec.version,
        uuid::Uuid::new_v4()
    ));
    fs::create_dir_all(&staging)?;
    let result = (|| -> Result<InstalledComponent> {
        let archive_kind = archive_kind(spec.url.rsplit('/').next().unwrap_or(&spec.url))?;
        extract(bytes, &staging, archive_kind)?;
        // Move staged contents into the final versioned directory. For archives
        // with a single top-level folder, flatten one level so the manifest sits
        // beside the payload.
        let install_dir = finalize_staging(&staging, &dir)?;
        let path = validate_installation(&install_dir, kind)?;
        let component = InstalledComponent {
            id: spec.id.clone(),
            version: spec.version.clone(),
            kind,
            path,
            installed_at: chrono::Utc::now().to_rfc3339(),
        };
        write_manifest(&install_dir, &component)?;
        Ok(component)
    })();
    let _ = fs::remove_dir_all(&staging);
    let component = result?;
    progress(SetupProgress::Ready {
        component: name,
        message: format!("{} is ready", component.version),
    });
    Ok(component)
}

/// Install a component from the online catalog. `progress` is called with
/// download/verify/extract/ready phases. The operation is serialized by a
/// global lock so overlapping installs cannot corrupt the component store.
pub fn install<F>(root: &Path, spec: ComponentSpec, mut progress: F) -> Result<InstalledComponent>
where
    F: FnMut(SetupProgress),
{
    if !is_supported_archive(&spec.url) {
        bail!(
            "Orbit cannot install {} because its package format is not a supported archive. Choose a .tar.xz or .tar.gz release instead",
            spec.url.rsplit('/').next().unwrap_or(&spec.url)
        );
    }
    let name = label(&spec);
    progress(SetupProgress::Downloading {
        component: name.clone(),
        downloaded_bytes: 0,
        total_bytes: spec.size,
    });
    let bytes = download_bytes(&spec.url, spec.size, &mut |downloaded| {
        progress(SetupProgress::Downloading {
            component: name.clone(),
            downloaded_bytes: downloaded,
            total_bytes: spec.size,
        });
    })?;
    install_from_bytes(root, spec, &bytes, progress)
}

fn is_supported_archive(url: &str) -> bool {
    let name = url.rsplit('/').next().unwrap_or(url);
    archive_kind(name).is_ok()
}

pub(crate) fn finalize_staging(staging: &Path, target: &Path) -> Result<PathBuf> {
    // If the staging directory contains exactly one subdirectory, use it as the
    // install root; otherwise use the staging directory itself.
    let entries: Vec<_> = fs::read_dir(staging)
        .context("Cannot read staged directory")?
        .flatten()
        .map(|e| e.path())
        .collect();
    let source = if entries.len() == 1 && entries[0].is_dir() {
        &entries[0]
    } else {
        staging
    };
    fs::create_dir_all(target.parent().context("Invalid component target path")?)?;
    // Replace any previous failed attempt atomically.
    if target.exists() {
        fs::remove_dir_all(target)?;
    }
    fs::rename(source, target)?;
    Ok(target.to_path_buf())
}

/// Register a locally available component path. GPTK accepts an Apple DMG or a
/// payload directory; every other kind validates the directory against the same
/// layout rules a download would pass, so a registered path is launch-ready.
pub fn register(
    root: &Path,
    id: String,
    version: String,
    path: PathBuf,
) -> Result<InstalledComponent> {
    if !cfg!(target_os = "macos") {
        bail!("Managed components are only available on macOS");
    }
    let kind = ComponentKind::from_component_id(&id)
        .with_context(|| format!("Unknown component id: {id}"))?;
    ensure_components_root(root)?;
    let dir = component_dir(root, &id, &version);
    fs::create_dir_all(&dir)?;

    let validated_path = match kind {
        ComponentKind::Gptk => validate_gptk_path(&path)?,
        ComponentKind::Wine => {
            // Wine registration goes through the full probe: a path that cannot
            // execute must never become a selectable runtime.
            reject_traversal(&path)?;
            validate_installation(&path, kind)?
        }
        _ => {
            reject_traversal(&path)?;
            if !path.is_dir() {
                bail!("Selected component path is not a directory");
            }
            validate_installation(&path, kind)?
        }
    };

    let component = InstalledComponent {
        id,
        version,
        kind,
        path: validated_path,
        installed_at: chrono::Utc::now().to_rfc3339(),
    };
    write_manifest(&dir, &component)?;
    Ok(component)
}

fn reject_traversal(path: &Path) -> Result<()> {
    if !path.is_absolute()
        || path
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        bail!("Choose an absolute path without parent traversal");
    }
    Ok(())
}

fn validate_gptk_path(path: &Path) -> Result<String> {
    if !path.is_absolute()
        || path
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        bail!("Choose an absolute path without parent traversal");
    }
    if !path.exists() {
        bail!("Selected GPTK path does not exist");
    }
    // Accept either a DMG or the redist/lib directory commonly used by Homebrew.
    let candidate = if path
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("dmg"))
    {
        path.to_path_buf()
    } else {
        let lib = path.join("redist/lib");
        if lib.exists() {
            lib
        } else {
            path.to_path_buf()
        }
    };
    Ok(candidate.to_string_lossy().into_owned())
}

/// Map of component id -> latest installed version. Used to decide whether a
/// graphics backend is available.
pub fn find_installed(root: &Path, id: &str) -> Option<InstalledComponent> {
    installed_components(root)
        .into_iter()
        .filter(|c| c.id == id)
        .max_by(|a, b| a.installed_at.cmp(&b.installed_at))
}

pub fn installed_by_id(root: &Path) -> BTreeMap<String, InstalledComponent> {
    let mut map: BTreeMap<String, InstalledComponent> = BTreeMap::new();
    for component in installed_components(root) {
        // Keep the most recently installed version for each id.
        let keep = match map.get(&component.id) {
            Some(existing) => component.installed_at > existing.installed_at,
            None => true,
        };
        if keep {
            map.insert(component.id.clone(), component);
        }
    }
    map
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arm64_only_bridges_cannot_load_in_orbits_x86_64_wine() {
        // Regression: an ARM64-only DXMT build was picked over x86_64 DXMT;
        // winemetal.dll then failed to initialise and the game quit.
        let root = std::env::temp_dir().join(format!("orbit-arch-{}", uuid::Uuid::new_v4()));
        let arm = root.join("dxmt-arm64/wine");
        fs::create_dir_all(arm.join("aarch64-unix")).unwrap();
        fs::create_dir_all(arm.join("x86_64-windows")).unwrap();
        let x86 = root.join("dxmt-x86/wine");
        fs::create_dir_all(x86.join("x86_64-unix")).unwrap();
        fs::create_dir_all(x86.join("x86_64-windows")).unwrap();
        let flat = root.join("dxmt-flat");
        fs::create_dir_all(flat.join("x86_64-unix")).unwrap();
        let pe_only = root.join("dxvk");
        fs::create_dir_all(pe_only.join("x64")).unwrap();
        let gptk = root.join("gptk");
        fs::create_dir_all(gptk.join("redist/lib/wine/x86_64-unix")).unwrap();

        assert!(!runs_on_x86_64_wine(&arm));
        assert!(!runs_on_x86_64_wine(arm.parent().unwrap()));
        assert!(runs_on_x86_64_wine(&x86));
        assert!(runs_on_x86_64_wine(&flat));
        assert!(
            runs_on_x86_64_wine(&pe_only),
            "PE-only payloads need no bridge"
        );
        assert!(runs_on_x86_64_wine(&gptk));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn component_kind_from_id() {
        assert_eq!(
            ComponentKind::from_component_id("dxvk"),
            Some(ComponentKind::Dxvk)
        );
        assert_eq!(ComponentKind::from_component_id("unknown"), None);
    }

    #[test]
    fn rejects_non_macos_install() {
        if cfg!(target_os = "macos") {
            return;
        }
        let root = std::env::temp_dir().join(format!("orbit-components-{}", uuid::Uuid::new_v4()));
        let result = install(
            &root,
            ComponentSpec {
                id: "dxvk".into(),
                version: "test".into(),
                url: "https://example.com/dxvk.tar.gz".into(),
                size: 1,
                sha256: None,
            },
            |_| {},
        );
        assert!(result.is_err());
    }

    #[test]
    fn target_stays_inside_archive() {
        assert!(target_stays_inside(
            Path::new("Wine.app/bin"),
            Path::new("../lib/wine")
        ));
        assert!(!target_stays_inside(
            Path::new("Wine.app/bin"),
            Path::new("../../../outside")
        ));
        assert!(!target_stays_inside(
            Path::new("Wine.app/bin"),
            Path::new("/tmp/outside")
        ));
    }

    /// Regression: Gcenx archives nest the loader inside `Wine Stable.app` and
    /// activation flattens that top level, so validation must search rather
    /// than assume one fixed path.
    #[test]
    #[cfg(target_os = "macos")]
    fn installs_wine_from_flattened_app_bundle() {
        use std::io::Write;
        let root = std::env::temp_dir().join(format!("orbit-components-{}", uuid::Uuid::new_v4()));
        // Build an archive whose single top-level entry is the app bundle.
        let mut builder = tar::Builder::new(Vec::new());
        for (path, body) in [
            (
                "Wine Stable.app/Contents/Resources/wine/bin/wine",
                "#!/bin/sh\nprintf 'wine-stable-test-11.0\\n'\n",
            ),
            (
                "Wine Stable.app/Contents/Resources/wine/bin/wineserver",
                "#!/bin/sh\nexit 0\n",
            ),
        ] {
            let mut header = tar::Header::new_gnu();
            header.set_size(body.len() as u64);
            header.set_mode(0o755);
            header.set_cksum();
            builder
                .append_data(&mut header, path, body.as_bytes())
                .unwrap();
        }
        let tar_bytes = builder.into_inner().unwrap();
        let mut encoder = xz2::write::XzEncoder::new(Vec::new(), 1);
        encoder.write_all(&tar_bytes).unwrap();
        let archive = encoder.finish().unwrap();

        let component = install_from_bytes(
            &root,
            ComponentSpec {
                id: "wine-stable".into(),
                version: "11.0_test".into(),
                url: "https://example.com/wine-stable-11.0_test-osx64.tar.xz".into(),
                size: archive.len() as u64,
                sha256: None,
            },
            &archive,
            |_| {},
        )
        .expect("flattened app bundle should validate");
        assert!(component.path.ends_with("/wine"));
        assert!(Path::new(&component.path).is_file());
        // Activation is idempotent: a second install reports ready without work.
        let mut phases = Vec::new();
        let again = install_from_bytes(
            &root,
            ComponentSpec {
                id: "wine-stable".into(),
                version: "11.0_test".into(),
                url: "https://example.com/wine-stable-11.0_test-osx64.tar.xz".into(),
                size: archive.len() as u64,
                sha256: None,
            },
            &archive,
            |update| phases.push(update),
        )
        .unwrap();
        assert_eq!(again.path, component.path);
        assert!(matches!(phases.first(), Some(SetupProgress::Ready { .. })));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn rejects_unsupported_archive_before_downloading() {
        let root = std::env::temp_dir().join(format!("orbit-components-{}", uuid::Uuid::new_v4()));
        let error = install(
            &root,
            ComponentSpec {
                id: "dxvk".into(),
                version: "test".into(),
                url: "https://example.com/package.zip".into(),
                size: 1,
                sha256: None,
            },
            |_| {},
        )
        .expect_err("zip packages must be rejected");
        assert!(error.to_string().contains("not a supported archive"));
    }

    /// Regression: the MoltenVK release is a plain .tar whose payload sits
    /// under MoltenVK/dylib/macOS, and activation flattens that first level.
    #[test]
    #[cfg(target_os = "macos")]
    fn installs_moltenvk_from_plain_tar() {
        let root = std::env::temp_dir().join(format!("orbit-components-{}", uuid::Uuid::new_v4()));
        let mut builder = tar::Builder::new(Vec::new());
        let body = b"mach-o stub";
        let mut header = tar::Header::new_gnu();
        header.set_size(body.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        builder
            .append_data(
                &mut header,
                "MoltenVK/dylib/macOS/libMoltenVK.dylib",
                &body[..],
            )
            .unwrap();
        let archive = builder.into_inner().unwrap();
        let component = install_from_bytes(
            &root,
            ComponentSpec {
                id: "moltenvk".into(),
                version: "v1.4.2".into(),
                url: "https://example.com/MoltenVK-macos.tar".into(),
                size: archive.len() as u64,
                sha256: None,
            },
            &archive,
            |_| {},
        )
        .expect("moltenvk tar should validate");
        assert!(component.path.ends_with("libMoltenVK.dylib"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_unsupported_archive_kind() {
        assert!(archive_kind("package.zip").is_err());
        assert!(archive_kind("MoltenVK-macos.tar").is_ok());
        assert!(archive_kind("wine-stable-11.0_1-osx64.tar.xz").is_ok());
        assert!(archive_kind("dxvk-2.3.tar.gz").is_ok());
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn installs_fake_dxvk_from_tar_gz() {
        let root = std::env::temp_dir().join(format!("orbit-components-{}", uuid::Uuid::new_v4()));
        let archive = build_fake_dxvk_tar_gz();
        let result = install_from_bytes(
            &root,
            ComponentSpec {
                id: "dxvk".into(),
                version: "test".into(),
                url: "https://example.com/dxvk-test.tar.gz".into(),
                size: archive.len() as u64,
                sha256: None,
            },
            &archive,
            |_| {},
        );
        let component = result.expect("install should succeed");
        assert_eq!(component.id, "dxvk");
        assert_eq!(component.version, "test");
        assert!(Path::new(&component.path).join("x64/d3d11.dll").is_file());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[cfg(target_os = "macos")]
    fn build_fake_dxvk_tar_gz() -> Vec<u8> {
        use flate2::write::GzEncoder;
        use std::io::Write;
        let mut builder = tar::Builder::new(Vec::new());
        for (path, content) in [
            ("dxvk-test/x64/d3d11.dll", b"x64"),
            ("dxvk-test/x32/d3d11.dll", b"x32"),
        ] {
            let mut header = tar::Header::new_gnu();
            header.set_size(content.len() as u64);
            header.set_mode(0o644);
            header.set_cksum();
            builder
                .append_data(&mut header, path, &content[..])
                .unwrap();
        }
        let tar_bytes = builder.into_inner().unwrap();
        let mut encoder = GzEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(&tar_bytes).unwrap();
        encoder.finish().unwrap()
    }

    /// Regression: upstream DXMT publishes a Wine builtin tree
    /// (`x86_64-windows/d3d11.dll`), not an `x64/` directory.
    #[test]
    #[cfg(target_os = "macos")]
    fn installs_dxmt_from_wine_builtin_layout() {
        let root = std::env::temp_dir().join(format!("orbit-components-{}", uuid::Uuid::new_v4()));
        let archive = build_fake_dxmt_builtin_tar_gz();
        let component = install_from_bytes(
            &root,
            ComponentSpec {
                id: "dxmt".into(),
                version: "v0.80".into(),
                url: "https://example.com/dxmt-v0.80-builtin.tar.gz".into(),
                size: archive.len() as u64,
                sha256: None,
            },
            &archive,
            |_| {},
        )
        .expect("dxmt builtin archive should validate");
        let installed = Path::new(&component.path);
        assert!(installed.join("x86_64-windows/d3d11.dll").is_file());
        assert!(installed.join("x86_64-unix/winemetal.so").is_file());
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(target_os = "macos")]
    fn build_fake_dxmt_builtin_tar_gz() -> Vec<u8> {
        use flate2::write::GzEncoder;
        use std::io::Write;
        let mut builder = tar::Builder::new(Vec::new());
        for (path, content) in [
            ("v0.80/x86_64-windows/d3d11.dll", b"d3d11"),
            ("v0.80/x86_64-windows/dxgi.dll", b"dxgi."),
            ("v0.80/i386-windows/d3d11.dll", b"d3d32"),
            ("v0.80/x86_64-unix/winemetal.so", b"metal"),
        ] {
            let mut header = tar::Header::new_gnu();
            header.set_size(content.len() as u64);
            header.set_mode(0o644);
            header.set_cksum();
            builder
                .append_data(&mut header, path, &content[..])
                .unwrap();
        }
        let tar_bytes = builder.into_inner().unwrap();
        let mut encoder = GzEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(&tar_bytes).unwrap();
        encoder.finish().unwrap()
    }
}
