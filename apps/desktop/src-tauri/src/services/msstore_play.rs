//! Launch orchestrator for Microsoft Store / PC Game Pass GDK titles through Orbit Wine.
//!
//! Responsibilities:
//! - Verifies Orbit Wine includes the `WINE_DLL_FILE_MAP` loader patch and `xgameruntime.dll`.
//! - Stages LGPL-2.1 `xgameruntime.dll` into the game's isolated container `system32`.
//! - Allocates a bounded ephemeral macOS RAM disk (`hdiutil` + `newfs_hfs` + `mount`, RAII cleanup),
//!   decrypts `keep_encrypted` executables into unlinked temp files on the RAM disk, clears
//!   `FD_CLOEXEC`, verifies decrypted PE headers (`MZ` / `PE\0\0`), and constructs `WINE_DLL_FILE_MAP`.
//! - Starts the private per-session `msstore_ipc` Unix socket bridge (`<container>/xodus.sock`).
//! - Wraps the launched `WineProcess` + `RamDiskGuard` + `MsStoreIpcServer` into `MsStoreProcess`
//!   (`impl RuntimeProcess`) so `SessionManager` handles monitoring, playtime, Stop, and Drop cleanup.

use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::os::unix::io::{AsRawFd, RawFd};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use anyhow::{bail, Context, Result};
use orbit_msstore::catalog::acquire_content_license;
use orbit_msstore::msixvc::{
    decrypt_encrypted_file, encrypted_entries, load_installed_manifest, InstalledMsixvcManifest,
};
use zeroize::Zeroizing;

use crate::runtimes::components::{self, ComponentKind};
use crate::runtimes::wine::{PreparedWineLaunch, WineAdapter};
use crate::runtimes::{wine_capabilities, RuntimeProcess, WineProfile};
use crate::services::msstore_auth;
use crate::services::msstore_ipc::{MsStoreIpcServer, OrbitMsStoreIpcBackend};

/// Safety ceiling for the ephemeral macOS RAM disk holding decrypted executables (2 GiB).
pub const MAX_RAMDISK_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const RAMDISK_OVERHEAD_BYTES: u64 = 16 * 1024 * 1024;
const SECTOR_SIZE: u64 = 512;

/// Computes the 512-byte sector count for `hdiutil attach -nomount ram://<sectors>`,
/// bounded by [`MAX_RAMDISK_BYTES`].
pub fn ram_disk_sectors(total_encrypted_bytes: u64) -> Result<u64> {
    let bytes = total_encrypted_bytes
        .saturating_add(RAMDISK_OVERHEAD_BYTES)
        .max(32 * 1024 * 1024);
    if bytes > MAX_RAMDISK_BYTES {
        bail!(
            "Encrypted executables ({} MB) exceed Orbit's 2 GB RAM disk limit",
            bytes / (1024 * 1024)
        );
    }
    Ok(bytes.div_ceil(SECTOR_SIZE))
}

/// RAII macOS RAM disk mounted with `nobrowse,noatime,nosuid,nodev`.
/// Always unmounts and detaches on `Drop` so no orphaned RAM disks remain.
pub struct RamDiskGuard {
    device: String,
    mount_point: PathBuf,
}

impl RamDiskGuard {
    #[cfg(target_os = "macos")]
    pub fn allocate(total_encrypted_bytes: u64) -> Result<Self> {
        let sectors = ram_disk_sectors(total_encrypted_bytes)?;
        let attach = Command::new("/usr/bin/hdiutil")
            .args(["attach", "-nomount", &format!("ram://{sectors}")])
            .output()
            .context("Could not run hdiutil to allocate RAM disk")?;
        if !attach.status.success() {
            bail!("Could not allocate ephemeral RAM disk for Microsoft Store executables");
        }
        let device = String::from_utf8_lossy(&attach.stdout).trim().to_string();
        if !device.starts_with("/dev/disk") {
            bail!("Unexpected RAM disk device from hdiutil: {device}");
        }

        let volume_name = format!("OrbitMS{}", &uuid::Uuid::new_v4().simple().to_string()[..8]);
        let format = Command::new("/sbin/newfs_hfs")
            .args(["-v", &volume_name, &device])
            .output()
            .context("Could not format ephemeral RAM disk")?;
        if !format.status.success() {
            let _ = Command::new("/usr/bin/hdiutil")
                .args(["detach", "-force", &device])
                .status();
            bail!("Could not format ephemeral RAM disk");
        }

        let mount_point =
            std::env::temp_dir().join(format!("orbit-msram-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&mount_point)?;
        let mount = Command::new("/sbin/mount")
            .args([
                "-t",
                "hfs",
                "-o",
                "nobrowse,noatime,nosuid,nodev",
                &device,
                &mount_point.to_string_lossy(),
            ])
            .output()
            .context("Could not mount ephemeral RAM disk")?;
        if !mount.status.success() {
            let _ = fs::remove_dir_all(&mount_point);
            let _ = Command::new("/usr/bin/hdiutil")
                .args(["detach", "-force", &device])
                .status();
            bail!("Could not mount ephemeral RAM disk");
        }

        Ok(Self {
            device,
            mount_point,
        })
    }

    #[cfg(not(target_os = "macos"))]
    pub fn allocate(_total_encrypted_bytes: u64) -> Result<Self> {
        bail!("Ephemeral RAM disk launch is supported on macOS only")
    }

    pub fn mount_point(&self) -> &Path {
        &self.mount_point
    }
}

impl Drop for RamDiskGuard {
    fn drop(&mut self) {
        #[cfg(target_os = "macos")]
        {
            let _ = Command::new("/sbin/umount")
                .args(["-f", &self.mount_point.to_string_lossy()])
                .status();
            let _ = Command::new("/usr/bin/hdiutil")
                .args(["detach", "-force", &self.device])
                .status();
        }
        let _ = fs::remove_dir_all(&self.mount_point);
    }
}

/// Formats `WINE_DLL_FILE_MAP` entries (`<fd>:\??\Z:\path\to\file.exe|...`) for Orbit Wine's
/// `0003-ntdll-WINE_DLL_FILE_MAP.patch`.
pub fn build_wine_dll_file_map(mappings: &[(RawFd, PathBuf)]) -> String {
    mappings
        .iter()
        .map(|(fd, posix_path)| {
            let win_path = posix_path.to_string_lossy().replace('/', "\\");
            let trimmed = win_path.trim_start_matches('\\');
            format!(r"{fd}:\??\Z:\{trimmed}")
        })
        .collect::<Vec<_>>()
        .join("|")
}

/// Clears `FD_CLOEXEC` so the child Wine loader inherits only the decrypted PE descriptors.
#[cfg(unix)]
fn clear_fd_cloexec(fd: RawFd) -> Result<()> {
    // SAFETY: `fd` is a valid open file descriptor owned by `File`.
    let flags = unsafe { libc::fcntl(fd, libc::F_GETFD) };
    if flags < 0 {
        bail!("Failed reading descriptor flags");
    }
    if unsafe { libc::fcntl(fd, libc::F_SETFD, flags & !libc::FD_CLOEXEC) } < 0 {
        bail!("Failed clearing FD_CLOEXEC on decrypted executable descriptor");
    }
    Ok(())
}

/// Verifies a decrypted file handle begins with valid Windows `MZ` and `PE\0\0` headers.
fn verify_decrypted_pe(file: &mut File) -> Result<()> {
    file.seek(SeekFrom::Start(0))?;
    let mut dos = [0u8; 64];
    file.read_exact(&mut dos)
        .context("Decrypted executable is too short to be a Windows PE binary")?;
    if &dos[..2] != b"MZ" {
        bail!("Decrypted executable is missing MZ header (wrong license key or corrupt file)");
    }
    let pe_offset = u32::from_le_bytes([dos[60], dos[61], dos[62], dos[63]]) as u64;
    file.seek(SeekFrom::Start(pe_offset))?;
    let mut sig = [0u8; 4];
    file.read_exact(&mut sig)
        .context("Decrypted executable has invalid PE header offset")?;
    if &sig != b"PE\0\0" {
        bail!("Decrypted executable is missing PE signature");
    }
    file.seek(SeekFrom::Start(0))?;
    Ok(())
}

/// Copies LGPL-2.1 `xgameruntime.dll` into `prefix/drive_c/windows/system32/xgameruntime.dll`.
/// Refuses symlinks on either source or destination.
pub fn stage_xgameruntime(prefix: &Path, component_dir: &Path) -> Result<()> {
    let source = component_dir.join("xgameruntime.dll");
    if source
        .symlink_metadata()
        .map_or(true, |m| m.file_type().is_symlink() || !m.is_file())
    {
        bail!("Installed xgameruntime component is missing xgameruntime.dll");
    }
    let system32 = prefix.join("drive_c/windows/system32");
    fs::create_dir_all(&system32)?;
    let dest = system32.join("xgameruntime.dll");
    if dest
        .symlink_metadata()
        .is_ok_and(|m| m.file_type().is_symlink())
    {
        bail!("Refusing to overwrite symlinked xgameruntime.dll inside container");
    }
    fs::copy(&source, &dest).context("Could not stage xgameruntime.dll into game container")?;
    Ok(())
}

/// Finds the installed `xgameruntime` component directory.
pub fn find_xgameruntime_dir(runtimes_root: &Path) -> Option<PathBuf> {
    components::installed_components(runtimes_root)
        .into_iter()
        .find(|c| c.kind == ComponentKind::XgameRuntime)
        .map(|c| PathBuf::from(c.path))
}

/// Verifies Orbit Wine includes the `WINE_DLL_FILE_MAP` loader patch.
pub fn verify_wine_capability(wine_path: &Path) -> Result<()> {
    let caps = wine_capabilities::inspect(wine_path)
        .context("Could not inspect Orbit Wine capabilities")?;
    if !caps.msstore_file_map {
        bail!(
            "Update Orbit Wine to play Microsoft Store games (this Wine build is missing the WINE_DLL_FILE_MAP loader patch)"
        );
    }
    Ok(())
}

/// Runtime process handle owning Wine, decrypted RAM-disk descriptors, RAM disk guard,
/// and the private per-session IPC server.
pub struct MsStoreProcess {
    inner: Box<dyn RuntimeProcess>,
    open_fds: Vec<File>,
    ipc: Option<MsStoreIpcServer>,
    ram_disk: Option<RamDiskGuard>,
}

impl RuntimeProcess for MsStoreProcess {
    fn pid(&self) -> u32 {
        self.inner.pid()
    }

    fn poll(&mut self) -> Result<Option<i32>> {
        let res = self.inner.poll()?;
        if res.is_some() {
            // Release handles and RAM disk as soon as the game exits.
            self.open_fds.clear();
            self.ipc = None;
            self.ram_disk = None;
        }
        Ok(res)
    }

    fn stop(&mut self) -> Result<()> {
        let stop_result = self.inner.stop();
        self.open_fds.clear();
        self.ipc = None;
        self.ram_disk = None;
        stop_result
    }
}

impl Drop for MsStoreProcess {
    fn drop(&mut self) {
        let _ = self.inner.stop();
        self.open_fds.clear();
        self.ipc = None;
        self.ram_disk = None;
    }
}

/// Launches an installed Microsoft Store / PC Game Pass GDK title through Orbit Wine.
#[allow(clippy::too_many_arguments)]
pub fn launch<F: FnMut(&str)>(
    resolved: &WineProfile,
    game_id: &str,
    product_id: &str,
    runtimes_root: &Path,
    session_dir: &Path,
    cancel: &AtomicBool,
    progress: &mut F,
) -> Result<Box<dyn RuntimeProcess>> {
    progress("resolve");
    verify_wine_capability(Path::new(&resolved.runtime_path))?;

    let xgameruntime_dir = find_xgameruntime_dir(runtimes_root).ok_or_else(|| {
        anyhow::anyhow!(
            "Install the xgameruntime component in Settings → Compatibility before launching Microsoft Store games"
        )
    })?;

    let exe_path = PathBuf::from(&resolved.executable);
    let install_root = find_install_root(&exe_path).ok_or_else(|| {
        anyhow::anyhow!("Could not locate Microsoft Store installation metadata for this game")
    })?;
    let manifest = load_installed_manifest(&install_root)
        .map_err(|e| anyhow::anyhow!("Could not read Microsoft Store install manifest: {e}"))?;

    progress("container");
    let container_id = format!("msstore-{}", product_id.to_ascii_lowercase());
    let prepared: PreparedWineLaunch = WineAdapter.prepare_msstore(
        resolved,
        &container_id,
        runtimes_root,
        cancel,
        progress,
    )?;
    stage_xgameruntime(&prepared.prefix, &xgameruntime_dir)?;

    let encrypted_files = encrypted_entries(&manifest);
    let mut ram_disk: Option<RamDiskGuard> = None;
    let mut open_fds: Vec<File> = Vec::new();
    let mut mappings: Vec<(RawFd, PathBuf)> = Vec::new();

    if manifest.encrypted && !encrypted_files.is_empty() {
        progress("license");
        let cik = acquire_live_cik(session_dir, &manifest)?;

        progress("decrypt");
        let total_enc_bytes: u64 = encrypted_files.iter().map(|f| f.size).sum();
        let disk = RamDiskGuard::allocate(total_enc_bytes)?;
        for entry in &encrypted_files {
            let temp_path = disk
                .mount_point()
                .join(format!("pe-{}.bin", uuid::Uuid::new_v4()));
            let mut file = fs::OpenOptions::new()
                .create_new(true)
                .read(true)
                .write(true)
                .open(&temp_path)?;
            // Immediately unlink so the decrypted PE exists only via open FD in RAM.
            let _ = fs::remove_file(&temp_path);

            decrypt_encrypted_file(&install_root, &manifest, entry, &cik, &mut file)
                .map_err(|e| anyhow::anyhow!("Failed decrypting {}: {e}", entry.relative_path))?;
            if entry.relative_path.to_ascii_lowercase().ends_with(".exe") {
                verify_decrypted_pe(&mut file)?;
            }
            let raw_fd = file.as_raw_fd();
            #[cfg(unix)]
            clear_fd_cloexec(raw_fd)?;

            let disk_path = install_root.join(&entry.relative_path);
            let canonical_disk_path = disk_path.canonicalize().unwrap_or(disk_path);
            mappings.push((raw_fd, canonical_disk_path));
            open_fds.push(file);
        }
        ram_disk = Some(disk);
    }

    progress("ipc");
    let container_dir = prepared
        .prefix
        .parent()
        .unwrap_or(&prepared.prefix)
        .to_path_buf();
    let status = msstore_auth::status(session_dir, runtimes_root, None);
    let backend = Arc::new(OrbitMsStoreIpcBackend {
        session_dir: session_dir.to_path_buf(),
        product_id: product_id.to_ascii_uppercase(),
        gamertag: status.gamertag.unwrap_or_else(|| "OrbitPlayer".into()),
        xuid: status.xuid.unwrap_or_else(|| "0".into()),
    });
    let ipc = MsStoreIpcServer::start(&container_dir, backend)
        .map_err(|e| anyhow::anyhow!("Could not start Microsoft Store IPC bridge: {e}"))?;

    let mut extra_env: Vec<(String, String)> = vec![
        (
            "XODUS_SOCKET_PATH".into(),
            ipc.socket_path().to_string_lossy().into_owned(),
        ),
        ("ORBIT_MSSTORE_GAME_ID".into(), game_id.to_string()),
    ];
    if !mappings.is_empty() {
        extra_env.push((
            "WINE_DLL_FILE_MAP".into(),
            build_wine_dll_file_map(&mappings),
        ));
    }

    progress("spawn");
    let inner = prepared.spawn_with_extra_env(None, &extra_env, Some("xgameruntime=n,b"), cancel)?;
    Ok(Box::new(MsStoreProcess {
        inner,
        open_fds,
        ipc: Some(ipc),
        ram_disk,
    }))
}

fn acquire_live_cik(
    session_dir: &Path,
    manifest: &InstalledMsixvcManifest,
) -> Result<Zeroizing<[u8; 32]>> {
    let device_token =
        msstore_auth::device_ms_token(session_dir).map_err(|e| anyhow::anyhow!(e))?;
    let user_token =
        msstore_auth::exchange_user_token(session_dir, "www.microsoft.com", "MBI_SSL")
            .map_err(|e| anyhow::anyhow!(e))?;
    let hw_id = msstore_auth::hardware_id_b64(session_dir).map_err(|e| anyhow::anyhow!(e))?;
    let dev_key = msstore_auth::device_key(session_dir).map_err(|e| anyhow::anyhow!(e))?;
    let license = acquire_content_license(&manifest.content_id, &device_token, &user_token, &hw_id)
        .map_err(|e| anyhow::anyhow!("{e}"))?;
    let keys = license
        .unpack_content_keys(&dev_key)
        .map_err(|e| anyhow::anyhow!("{e}"))?;
    keys.into_iter()
        .next()
        .map(|(_, cik)| cik)
        .ok_or_else(|| anyhow::anyhow!("Microsoft license did not include a content key"))
}

fn find_install_root(exe_path: &Path) -> Option<PathBuf> {
    for ancestor in exe_path.ancestors().skip(1).take(8) {
        if ancestor
            .join(orbit_msstore::msixvc::SEGMENT_MANIFEST_FILE)
            .is_file()
        {
            return Some(ancestor.to_path_buf());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_wine_dll_file_map_with_nt_z_drive_paths() {
        let map = build_wine_dll_file_map(&[
            (7, PathBuf::from("/Volumes/SSD/Orbit Games/msstore/9P8/Game.exe")),
            (8, PathBuf::from("/Users/me/Library/Game/Bin/sub.dll")),
        ]);
        assert_eq!(
            map,
            r"7:\??\Z:\Volumes\SSD\Orbit Games\msstore\9P8\Game.exe|8:\??\Z:\Users\me\Library\Game\Bin\sub.dll"
        );
    }

    #[test]
    fn enforces_ram_disk_size_floor_and_2gib_cap() {
        let small = ram_disk_sectors(1024).unwrap();
        assert_eq!(small, (32 * 1024 * 1024) / 512);
        let medium = ram_disk_sectors(100 * 1024 * 1024).unwrap();
        assert_eq!(medium, (116 * 1024 * 1024) / 512);
        assert!(ram_disk_sectors(MAX_RAMDISK_BYTES).is_err());
    }

    #[test]
    fn gates_launch_when_orbit_wine_lacks_msstore_file_map() {
        let dir = std::env::temp_dir().join(format!("orbit-msplay-cap-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(dir.join("bin")).unwrap();
        fs::create_dir_all(dir.join("lib/wine/x86_64-unix")).unwrap();
        let wine = dir.join("bin/wine");
        fs::write(&wine, b"wine").unwrap();
        fs::write(dir.join("lib/wine/x86_64-unix/ntdll.so"), b"plain ntdll").unwrap();

        let err = verify_wine_capability(&wine).unwrap_err();
        assert!(err.to_string().contains("WINE_DLL_FILE_MAP"));

        fs::write(
            dir.join("lib/wine/x86_64-unix/ntdll.so"),
            b"WINEMSYNC WINE_DLL_FILE_MAP",
        )
        .unwrap();
        verify_wine_capability(&wine).unwrap();
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn stages_xgameruntime_and_rejects_symlinks() {
        let dir = std::env::temp_dir().join(format!("orbit-msplay-xgr-{}", uuid::Uuid::new_v4()));
        let comp = dir.join("component");
        let prefix = dir.join("prefix");
        fs::create_dir_all(&comp).unwrap();
        fs::write(comp.join("xgameruntime.dll"), b"MZ-LGPL").unwrap();

        stage_xgameruntime(&prefix, &comp).unwrap();
        assert_eq!(
            fs::read(prefix.join("drive_c/windows/system32/xgameruntime.dll")).unwrap(),
            b"MZ-LGPL"
        );

        let dest = prefix.join("drive_c/windows/system32/xgameruntime.dll");
        fs::remove_file(&dest).unwrap();
        std::os::unix::fs::symlink(dir.join("outside.dll"), &dest).unwrap();
        assert!(stage_xgameruntime(&prefix, &comp).is_err());

        let _ = fs::remove_dir_all(&dir);
    }
}
