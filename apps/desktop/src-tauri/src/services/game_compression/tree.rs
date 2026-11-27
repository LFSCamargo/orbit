//! Compresses or decompresses every file under one game folder, on a few
//! threads. Only APFS (and HFS+) volumes support transparent compression;
//! other drives are left as they are. Symlinks are never followed.
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};

use parking_lot::Mutex;
use serde::Serialize;

use super::afsc::{self, Encoder, Outcome};

/// A game folder with more files than this is not walked further.
const FILE_LIMIT: usize = 2_000_000;
const MAX_WORKERS: usize = 6;
/// Decompressing stops when the volume would fall below this much free space.
const FREE_SPACE_RESERVE: u64 = 2 * 1024 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    Compress,
    Decompress,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Totals {
    pub changed_files: u64,
    /// Bytes on disk before and after, for the files that changed.
    pub before: u64,
    pub after: u64,
    pub failed_files: u64,
}

impl Totals {
    pub fn saved(&self) -> i64 {
        self.before as i64 - self.after as i64
    }

    pub fn add(&mut self, other: Totals) {
        self.changed_files += other.changed_files;
        self.before += other.before;
        self.after += other.after;
        self.failed_files += other.failed_files;
    }
}

/// Whether the volume holding `path` supports decmpfs compression.
pub fn supported(path: &Path) -> bool {
    use std::os::unix::ffi::OsStrExt;
    let Ok(c_path) = std::ffi::CString::new(path.as_os_str().as_bytes()) else {
        return false;
    };
    let mut stats = std::mem::MaybeUninit::<libc::statfs>::uninit();
    // SAFETY: NUL-terminated path and a writable statfs buffer.
    if unsafe { libc::statfs(c_path.as_ptr(), stats.as_mut_ptr()) } != 0 {
        return false;
    }
    // SAFETY: statfs succeeded and filled the buffer.
    let stats = unsafe { stats.assume_init() };
    // SAFETY: f_fstypename is NUL-terminated by the kernel.
    let kind = unsafe { std::ffi::CStr::from_ptr(stats.f_fstypename.as_ptr()) };
    matches!(kind.to_bytes(), b"apfs" | b"hfs")
}

fn free_space(path: &Path) -> Option<u64> {
    use std::os::unix::ffi::OsStrExt;
    let c_path = std::ffi::CString::new(path.as_os_str().as_bytes()).ok()?;
    let mut stats = std::mem::MaybeUninit::<libc::statvfs>::uninit();
    // SAFETY: NUL-terminated path and a writable statvfs buffer.
    if unsafe { libc::statvfs(c_path.as_ptr(), stats.as_mut_ptr()) } != 0 {
        return None;
    }
    // SAFETY: statvfs succeeded.
    let stats = unsafe { stats.assume_init() };
    Some(stats.f_bavail as u64 * stats.f_frsize as u64)
}

fn is_temp(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.starts_with('.') && name.ends_with(afsc::TEMP_SUFFIX))
}

/// Regular files under `root` with their sizes. Leftover temp files from an
/// interrupted run are removed. O(f), f ≤ `FILE_LIMIT`.
pub fn files(root: &Path, cancel: &AtomicBool) -> Vec<(PathBuf, u64)> {
    let mut found = Vec::new();
    for entry in walkdir::WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .flatten()
    {
        if cancel.load(Ordering::Relaxed) || found.len() >= FILE_LIMIT {
            break;
        }
        if !entry.file_type().is_file() {
            continue;
        }
        if is_temp(entry.path()) {
            let _ = fs::remove_file(entry.path());
            continue;
        }
        if let Ok(meta) = entry.metadata() {
            found.push((entry.into_path(), meta.len()));
        }
    }
    found
}

/// Runs `direction` over every file under `root`. `progress(done, total)`
/// reports logical bytes processed. Stops early on cancel; decompressing
/// stops with an error before the volume runs out of space. O(total size).
pub fn apply(
    root: &Path,
    direction: Direction,
    cancel: &AtomicBool,
    progress: &(dyn Fn(u64, u64) + Sync),
) -> Result<Totals, String> {
    if !root.is_dir() || !supported(root) {
        return Ok(Totals::default());
    }
    let list = files(root, cancel);
    let total: u64 = list.iter().map(|(_, size)| size).sum();
    let next = AtomicUsize::new(0);
    let done = AtomicU64::new(0);
    let totals = Mutex::new(Totals::default());
    let stop: Mutex<Option<String>> = Mutex::new(None);
    let halted = AtomicBool::new(false);
    let workers = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(2)
        .clamp(1, MAX_WORKERS);
    std::thread::scope(|scope| {
        for _ in 0..workers {
            scope.spawn(|| {
                let mut encoder = Encoder::default();
                loop {
                    if cancel.load(Ordering::Relaxed) || halted.load(Ordering::Relaxed) {
                        break;
                    }
                    let index = next.fetch_add(1, Ordering::Relaxed);
                    let Some((path, size)) = list.get(index) else {
                        break;
                    };
                    if direction == Direction::Decompress
                        && free_space(root).is_some_and(|free| free < size + FREE_SPACE_RESERVE)
                    {
                        *stop.lock() = Some(
                            "Not enough free space to decompress every game. Free some space, then turn compression off again."
                                .into(),
                        );
                        halted.store(true, Ordering::Relaxed);
                        break;
                    }
                    let result = match direction {
                        Direction::Compress => afsc::compress(path, &mut encoder),
                        Direction::Decompress => afsc::decompress(path),
                    };
                    let mut sum = totals.lock();
                    match result {
                        Ok(Outcome::Changed { before, after }) => {
                            sum.changed_files += 1;
                            sum.before += before;
                            sum.after += after;
                        }
                        Ok(Outcome::Skipped) => {}
                        Err(err) if err.raw_os_error() == Some(libc::ENOSPC) => {
                            sum.failed_files += 1;
                            *stop.lock() = Some("The disk is full.".into());
                            halted.store(true, Ordering::Relaxed);
                        }
                        Err(err) => {
                            sum.failed_files += 1;
                            eprintln!("[orbit] compression skipped {}: {err}", path.display());
                        }
                    }
                    drop(sum);
                    let now = done.fetch_add(*size, Ordering::Relaxed) + size;
                    progress(now, total);
                }
            });
        }
    });
    if let Some(error) = stop.into_inner() {
        return Err(error);
    }
    Ok(totals.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch() -> PathBuf {
        let dir = dirs::home_dir()
            .unwrap()
            .join("Library/Caches/orbit-afsc-tests")
            .join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(dir.join("bin/x64")).unwrap();
        dir
    }

    #[test]
    fn a_game_folder_compresses_and_decompresses_with_identical_files() {
        let root = scratch();
        let data: Vec<u8> = b"level geometry "
            .iter()
            .cycle()
            .take(300_000)
            .copied()
            .collect();
        fs::write(root.join("bin/x64/game.exe"), &data).unwrap();
        fs::write(root.join("assets.pak"), &data[..200_000]).unwrap();
        fs::write(root.join("settings.ini"), b"Fullscreen=1\n").unwrap();
        fs::write(root.join(".assets.pak.orbit-afsc"), b"stale").unwrap();
        std::os::unix::fs::symlink("/etc/hosts", root.join("link")).unwrap();
        let cancel = AtomicBool::new(false);
        let seen = AtomicU64::new(0);
        let packed = apply(&root, Direction::Compress, &cancel, &|done, total| {
            assert!(done <= total);
            seen.store(done, Ordering::Relaxed);
        })
        .unwrap();
        assert_eq!(packed.changed_files, 2);
        assert!(packed.saved() > 0);
        assert_eq!(seen.load(Ordering::Relaxed), 300_000 + 200_000 + 13);
        assert!(
            !root.join(".assets.pak.orbit-afsc").exists(),
            "stale temp removed"
        );
        assert_eq!(fs::read(root.join("bin/x64/game.exe")).unwrap(), data);
        let unpacked = apply(&root, Direction::Decompress, &cancel, &|_, _| {}).unwrap();
        assert_eq!(unpacked.changed_files, 2);
        for path in ["bin/x64/game.exe", "assets.pak"] {
            let meta = fs::symlink_metadata(root.join(path)).unwrap();
            assert!(!afsc::is_compressed(&meta));
        }
        assert_eq!(fs::read(root.join("assets.pak")).unwrap(), &data[..200_000]);
        assert_eq!(
            fs::read_link(root.join("link")).unwrap(),
            PathBuf::from("/etc/hosts")
        );
        let _ = fs::remove_dir_all(root);
    }

    /// `ORBIT_COMPRESS_DIR=/path cargo test live_compress -- --ignored`
    #[test]
    #[ignore = "compresses a real folder named by ORBIT_COMPRESS_DIR"]
    fn live_compress_a_real_folder() {
        let root = PathBuf::from(std::env::var("ORBIT_COMPRESS_DIR").unwrap());
        let totals = apply(
            &root,
            Direction::Compress,
            &AtomicBool::new(false),
            &|_, _| {},
        )
        .unwrap();
        eprintln!("compressed {totals:?}, saved {} bytes", totals.saved());
    }

    #[test]
    fn a_cancelled_or_missing_folder_does_nothing() {
        let cancel = AtomicBool::new(true);
        let root = scratch();
        fs::write(root.join("a.bin"), vec![b'a'; 100_000]).unwrap();
        let totals = apply(&root, Direction::Compress, &cancel, &|_, _| {}).unwrap();
        assert_eq!(totals, Totals::default());
        let missing = apply(
            &root.join("missing"),
            Direction::Compress,
            &AtomicBool::new(false),
            &|_, _| {},
        );
        assert_eq!(missing.unwrap(), Totals::default());
        assert!(supported(&root));
        let _ = fs::remove_dir_all(root);
    }
}
