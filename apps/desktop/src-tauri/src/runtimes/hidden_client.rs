//! Keep the Windows Steam client that signs a game in out of sight on macOS.
//!
//! Wine's Mac driver makes every Wine process with a window a regular app: a
//! Dock icon, an app menu and a Cmd-Tab entry, and Steam's tray icon in the
//! menu bar. `native/hidden_client.m` (built by `build.rs`) stops that for
//! Steam's own processes when it is loaded into them through
//! `DYLD_INSERT_LIBRARIES`. Only the commands that start the container's Steam
//! client get it; the game never does.

use std::path::{Path, PathBuf};
use std::process::Command;

use sha2::{Digest, Sha256};

#[cfg(target_os = "macos")]
const LIBRARY: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/OrbitHiddenClient.dylib"));
#[cfg(not(target_os = "macos"))]
const LIBRARY: &[u8] = &[];

const FILE_NAME: &str = "OrbitHiddenClient.dylib";
const ENV_KEY: &str = "DYLD_INSERT_LIBRARIES";

/// `<runtimes>/hidden-client/<content hash>/OrbitHiddenClient.dylib`, so a new
/// build never overwrites a library a running Steam has loaded.
fn library_path(runtimes: &Path, bytes: &[u8]) -> PathBuf {
    let digest = Sha256::digest(bytes);
    let key: String = digest[..8]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    runtimes.join("hidden-client").join(key).join(FILE_NAME)
}

/// Writes `bytes` to its content-addressed path once (O(size) when the file
/// already exists, to check it). Returns the path, or `None` if it cannot be
/// written.
fn install(runtimes: &Path, bytes: &[u8]) -> Option<PathBuf> {
    if bytes.is_empty() {
        return None;
    }
    let path = library_path(runtimes, bytes);
    let current = std::fs::symlink_metadata(&path).ok();
    if current.as_ref().is_some_and(|meta| meta.is_file())
        && std::fs::read(&path).ok().as_deref() == Some(bytes)
    {
        return Some(path);
    }
    let dir = path.parent()?;
    if let Err(err) = std::fs::create_dir_all(dir) {
        eprintln!("Orbit could not prepare the hidden Steam library: {err}");
        return None;
    }
    let staging = dir.join(format!(".{FILE_NAME}.{}", uuid::Uuid::new_v4()));
    let written = std::fs::write(&staging, bytes).and_then(|()| std::fs::rename(&staging, &path));
    if let Err(err) = written {
        let _ = std::fs::remove_file(&staging);
        eprintln!("Orbit could not install the hidden Steam library: {err}");
        return None;
    }
    Some(path)
}

/// Runs the command's Steam client hidden from the Dock, the menu bar and
/// Cmd-Tab. When the library cannot be installed Steam runs as before.
pub fn apply(command: &mut Command) {
    apply_from(command, &crate::runtimes::root(), LIBRARY);
}

fn apply_from(command: &mut Command, runtimes: &Path, bytes: &[u8]) {
    if let Some(path) = install(runtimes, bytes) {
        command.env(ENV_KEY, path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root() -> PathBuf {
        std::env::temp_dir().join(format!("orbit-hidden-{}", uuid::Uuid::new_v4()))
    }

    fn env_of(command: &Command) -> Option<PathBuf> {
        command
            .get_envs()
            .find(|(key, _)| *key == ENV_KEY)
            .and_then(|(_, value)| value.map(PathBuf::from))
    }

    #[test]
    fn installs_the_library_once_and_points_steam_at_it() {
        let root = temp_root();
        let mut command = Command::new("/usr/bin/true");
        apply_from(&mut command, &root, b"library-bytes");
        let path = env_of(&command).expect("DYLD_INSERT_LIBRARIES is set");
        assert!(path.starts_with(root.join("hidden-client")));
        assert_eq!(std::fs::read(&path).unwrap(), b"library-bytes");

        let mut again = Command::new("/usr/bin/true");
        apply_from(&mut again, &root, b"library-bytes");
        assert_eq!(env_of(&again), Some(path.clone()));
        let entries = std::fs::read_dir(path.parent().unwrap()).unwrap().count();
        assert_eq!(entries, 1, "no staging files are left behind");
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn replaces_a_tampered_library_and_keeps_new_builds_apart() {
        let root = temp_root();
        let first = install(&root, b"v1").unwrap();
        std::fs::write(&first, b"tampered").unwrap();
        assert_eq!(install(&root, b"v1").unwrap(), first);
        assert_eq!(std::fs::read(&first).unwrap(), b"v1");
        assert_ne!(install(&root, b"v2").unwrap(), first);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn leaves_the_command_alone_without_a_library() {
        let root = temp_root();
        let mut command = Command::new("/usr/bin/true");
        apply_from(&mut command, &root, b"");
        assert!(env_of(&command).is_none());
        assert!(!root.exists());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn the_embedded_library_loads_into_x86_64_wine() {
        // Universal Mach-O (FAT_MAGIC, big-endian) carrying CPU_TYPE_X86_64.
        assert_eq!(&LIBRARY[..4], &[0xca, 0xfe, 0xba, 0xbe]);
        let arch_count = u32::from_be_bytes(LIBRARY[4..8].try_into().unwrap()) as usize;
        let has_x86_64 = (0..arch_count).any(|index| {
            let offset = 8 + index * 20;
            u32::from_be_bytes(LIBRARY[offset..offset + 4].try_into().unwrap()) == 0x0100_0007
        });
        assert!(has_x86_64);
        let marker = b"steamwebhelper.exe";
        assert!(LIBRARY.windows(marker.len()).any(|window| window == marker));
    }
}
