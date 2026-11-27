//! Warms a game's compiled shaders before it starts, with a progress bar in
//! Orbit's launch overlay.
//!
//! Orbit cannot compile shaders for a game: only the game knows its pipelines
//! and creates them itself (God of War Ragnarök compiles them while it boots,
//! the first run takes minutes). What Orbit does is load the caches the last
//! runs left, before the game process exists: D3DMetal's translated shaders
//! (`<user cache>/d3dm/<exe>/shaders.cache`) and Metal's compiled pipelines for
//! Orbit Wine (`<user cache>/com.orbit.wine/com.apple.metal`). Every container
//! title reads them once, sequentially, before spawn, so its menu's lookups hit
//! memory instead of the disk. Bounded by `BUDGET`; symlinks are never
//! followed; Cancel stops it; unavailable caches are skipped.
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

/// Orbit Wine's bundle identifier (`scripts/wine/Info.plist`), which names
/// Metal's cache for every process it starts.
const WINE_BUNDLE_ID: &str = "com.orbit.wine";
/// Most bytes read per launch.
pub const BUDGET: u64 = 2 * 1024 * 1024 * 1024;
/// Files visited per launch; caches are a few hundred files.
const FILE_LIMIT: usize = 20_000;
const CHUNK: usize = 1024 * 1024;

/// The cache folders for a game executable under the user cache directory.
pub fn cache_dirs(user_cache: &Path, executable_name: &str) -> Vec<PathBuf> {
    vec![
        user_cache
            .join("d3dm")
            .join(executable_name)
            .join("shaders.cache"),
        user_cache.join(WINE_BUNDLE_ID).join("com.apple.metal"),
    ]
}

/// Snapshot file sizes once for byte-based progress. The game cache is first.
fn cache_files(dirs: &[PathBuf], budget: u64, cancel: &AtomicBool) -> Vec<(PathBuf, u64)> {
    let mut files = Vec::new();
    let mut remaining_bytes = budget;
    let mut visited = 0usize;
    let mut pending: Vec<PathBuf> = dirs.iter().rev().cloned().collect();
    while let Some(path) = pending.pop() {
        if cancel.load(Ordering::Relaxed) || remaining_bytes == 0 || visited >= FILE_LIMIT {
            break;
        }
        visited += 1;
        let Ok(meta) = fs::symlink_metadata(&path) else {
            continue;
        };
        if meta.is_dir() {
            if let Ok(entries) = fs::read_dir(&path) {
                let remaining = FILE_LIMIT.saturating_sub(visited + pending.len());
                for entry in entries.take(remaining) {
                    if cancel.load(Ordering::Relaxed) {
                        return files;
                    }
                    if let Ok(entry) = entry {
                        pending.push(entry.path());
                    }
                }
            }
        } else if meta.is_file() {
            let bytes = remaining_bytes.min(meta.len());
            if bytes != 0 {
                files.push((path, bytes));
                remaining_bytes -= bytes;
            }
        }
    }
    files
}

/// Reads regular files under `dirs` until `budget` bytes or `cancel`,
/// reporting the percent of bytes read. Returns the bytes read.
/// O(files + bytes read).
fn warm_with_progress(
    dirs: &[PathBuf],
    budget: u64,
    cancel: &AtomicBool,
    mut progress: impl FnMut(u8),
) -> u64 {
    use std::os::unix::fs::OpenOptionsExt;
    let files = cache_files(dirs, budget, cancel);
    let total: u64 = files.iter().map(|(_, size)| size).sum();
    if total == 0 || cancel.load(Ordering::Relaxed) {
        return 0;
    }
    progress(0);
    let mut buffer = vec![0u8; CHUNK];
    let mut read = 0;
    let mut last_percent = 0;
    for (path, bytes) in files {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        let Ok(file) = fs::OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
            .open(path)
        else {
            continue;
        };
        if !file.metadata().is_ok_and(|m| m.is_file()) {
            continue;
        }
        let mut limited = file.take(bytes);
        while !cancel.load(Ordering::Relaxed) {
            let Ok(count) = limited.read(&mut buffer) else {
                break;
            };
            if count == 0 {
                break;
            }
            read += count as u64;
            let percent = (read * 100 / total) as u8;
            if percent != last_percent {
                last_percent = percent;
                progress(percent);
            }
        }
    }
    read
}

/// The per-user cache directory (`DARWIN_USER_CACHE_DIR`).
#[cfg(target_os = "macos")]
fn user_cache_dir() -> Option<PathBuf> {
    let mut buffer = vec![0u8; 1024];
    // SAFETY: confstr writes at most buffer.len() bytes, NUL-terminated.
    let len = unsafe {
        libc::confstr(
            libc::_CS_DARWIN_USER_CACHE_DIR,
            buffer.as_mut_ptr().cast(),
            buffer.len(),
        )
    };
    if len == 0 || len > buffer.len() {
        return None;
    }
    buffer.truncate(len - 1);
    String::from_utf8(buffer).ok().map(PathBuf::from)
}

#[cfg(not(target_os = "macos"))]
fn user_cache_dir() -> Option<PathBuf> {
    None
}

/// Shown when no earlier run left a cache: the game compiles them itself.
pub const FIRST_RUN: &str = "No compiled shaders yet: the game compiles them on its first start";

/// Called on the launch worker before the game starts, for every container
/// title. The UI stays responsive; Cancel stops it.
pub fn prepare_for_menu(executable: &Path, cancel: &AtomicBool, progress: &mut impl FnMut(&str)) {
    warm_for(user_cache_dir().as_deref(), executable, cancel, progress);
}

/// `prepare_for_menu` with the user cache directory given. Returns the bytes read.
fn warm_for(
    user_cache: Option<&Path>,
    executable: &Path,
    cancel: &AtomicBool,
    progress: &mut impl FnMut(&str),
) -> u64 {
    let (Some(cache), Some(name)) = (user_cache, executable.file_name().and_then(|s| s.to_str()))
    else {
        return 0;
    };
    progress("graphics|Checking existing shader caches");
    let read = warm_with_progress(&cache_dirs(cache, name), BUDGET, cancel, |percent| {
        progress(&format!("graphics|shader-cache:{percent}"));
    });
    if read == 0 && !cancel.load(Ordering::Relaxed) {
        progress(&format!("graphics|{FIRST_RUN}"));
    }
    read
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("orbit-shader-cache-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn warm(dirs: &[PathBuf], budget: u64, cancel: &AtomicBool) -> u64 {
        warm_with_progress(dirs, budget, cancel, |_| {})
    }

    #[test]
    fn every_title_warms_its_cache_with_progress_before_spawn() {
        // Regression: only Ragnarök showed the warmup; God of War (GoW.exe)
        // and other titles read their caches in the background while booting.
        let root = temp();
        let cache = root.join("d3dm/GoW.exe/shaders.cache");
        fs::create_dir_all(&cache).unwrap();
        fs::write(cache.join("a.bin"), vec![1u8; 4000]).unwrap();
        let cancel = AtomicBool::new(false);
        let mut steps = Vec::new();
        let read = warm_for(
            Some(&root),
            Path::new("C:/Games/GoW/GoW.exe"),
            &cancel,
            &mut |step: &str| steps.push(step.to_string()),
        );
        assert_eq!(read, 4000);
        assert_eq!(
            steps.first().unwrap(),
            "graphics|Checking existing shader caches"
        );
        assert_eq!(steps.last().unwrap(), "graphics|shader-cache:100");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_first_run_says_the_game_compiles_its_shaders() {
        let root = temp();
        let cancel = AtomicBool::new(false);
        let mut steps = Vec::new();
        let read = warm_for(
            Some(&root),
            Path::new("GoWR.exe"),
            &cancel,
            &mut |step: &str| steps.push(step.to_string()),
        );
        assert_eq!(read, 0);
        assert_eq!(steps.last().unwrap(), &format!("graphics|{FIRST_RUN}"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn caches_are_d3dmetal_per_executable_and_metal_per_orbit_wine() {
        let dirs = cache_dirs(Path::new("/c"), "GoWR.exe");
        assert_eq!(
            dirs,
            [
                PathBuf::from("/c/d3dm/GoWR.exe/shaders.cache"),
                PathBuf::from("/c/com.orbit.wine/com.apple.metal"),
            ]
        );
    }

    #[test]
    fn foreground_warmup_reports_bytes_and_honors_cancel_between_chunks() {
        let root = temp();
        fs::write(root.join("cache"), vec![0; CHUNK * 2]).unwrap();
        let cancel = AtomicBool::new(false);
        let mut updates = Vec::new();
        let bytes = warm_with_progress(&[root.clone()], BUDGET, &cancel, |percent| {
            updates.push(percent);
            if percent == 50 {
                cancel.store(true, Ordering::Relaxed);
            }
        });
        assert_eq!(updates, [0, 50]);
        assert_eq!(bytes, CHUNK as u64);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn reads_every_cached_shader_within_the_budget() {
        let root = temp();
        let cache = root.join("d3dm/GoWR.exe/shaders.cache");
        fs::create_dir_all(cache.join("nested")).unwrap();
        fs::write(cache.join("a.bin"), vec![1u8; 3000]).unwrap();
        fs::write(cache.join("nested/b.bin"), vec![2u8; 2000]).unwrap();
        let cancel = AtomicBool::new(false);
        assert_eq!(warm(std::slice::from_ref(&cache), BUDGET, &cancel), 5000);
        assert_eq!(warm(&[cache], 4000, &cancel), 4000, "stops at the budget");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn missing_caches_symlinks_and_cancelled_launches_read_nothing() {
        let root = temp();
        let outside = root.join("outside.bin");
        fs::write(&outside, vec![0u8; 1000]).unwrap();
        let cache = root.join("cache");
        fs::create_dir_all(&cache).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside, cache.join("link.bin")).unwrap();
        let cancel = AtomicBool::new(false);
        assert_eq!(
            warm(&[cache.clone(), root.join("missing")], BUDGET, &cancel),
            0
        );
        fs::write(cache.join("real.bin"), vec![0u8; 1000]).unwrap();
        cancel.store(true, Ordering::Relaxed);
        assert_eq!(warm(&[cache], BUDGET, &cancel), 0);
        let _ = fs::remove_dir_all(root);
    }
}
