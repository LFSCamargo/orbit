//! The libraries GameHub injects into every container launch, in GameHub's
//! order, with the defaults recorded in its own launch logs:
//!
//! - `libwine_engine_monitor.dylib`: only its GPTK DXGI vendor spoof is
//!   enabled. Its FPS monitor and Steam overlay need GameHub's host sockets,
//!   so they stay off.
//! - `libMetalDuck.dylib`: present pacing (120 fps native cap), with
//!   upscaling and frame generation off. It binds its own settings socket.
//! - `libsandboxfs.dylib`: the container overlay (always last).
//!
//! Every library is loaded from GameHub.app in place; missing optional ones
//! are skipped.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

const METALDUCK_DEFAULTS: [(&str, &str); 10] = [
    ("METALDUCK_COLOR_MODE", "2"),
    ("METALDUCK_FLOW_SCALE", "1."),
    ("METALDUCK_FRAMEGEN", "0"),
    ("METALDUCK_FRAMEGEN_MODE", "1x"),
    ("METALDUCK_FRAMEGEN_MODEL", "model_a"),
    ("METALDUCK_FRAMEGEN_QUALITY", "1"),
    ("METALDUCK_FRAMEGEN_VSYNC", "0"),
    ("METALDUCK_LOG_LEVEL", "3"),
    ("METALDUCK_NATIVE_FPS_LIMIT", "120"),
    ("METALDUCK_UPSCALING", "0"),
];

/// Set `DYLD_INSERT_LIBRARIES` and the matching switches. `sandboxfs` is
/// GameHub.app's `Contents/Resources/libsandboxfs.dylib`; `socket` is a unique,
/// short (`sun_path`) path for MetalDuck's settings socket.
pub(super) fn apply(env: &mut BTreeMap<String, String>, sandboxfs: &Path, socket: &Path) {
    let contents = sandboxfs.parent().and_then(Path::parent);
    let optional = |relative: &str| {
        contents
            .map(|dir| dir.join(relative))
            .filter(|path| path.is_file())
    };
    let mut libraries: Vec<PathBuf> = Vec::new();
    if let Some(monitor) = optional("Frameworks/libwine_engine_monitor.dylib") {
        libraries.push(monitor);
        env.insert("WINEENGINE_GPTK_DXGI_SPOOF_ENABLED".into(), "1".into());
    }
    if let Some(metalduck) = optional("Resources/assets/metalduck/libMetalDuck.dylib") {
        libraries.push(metalduck);
        for (key, value) in METALDUCK_DEFAULTS {
            env.insert(key.into(), value.into());
        }
        env.insert("METALDUCK_UPSCALE_RATIO".into(), "0".into());
        env.insert(
            "METALDUCK_SETTINGS_SOCKET_PATH".into(),
            socket.to_string_lossy().into_owned(),
        );
    }
    libraries.push(sandboxfs.to_path_buf());
    let joined: Vec<String> = libraries
        .iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect();
    env.insert("DYLD_INSERT_LIBRARIES".into(), joined.join(":"));
}

/// `/tmp/orbit-metalduck-<orbit pid>-<nanos>.sock`, well under `sun_path`.
pub(super) fn metalduck_socket() -> PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or_default();
    PathBuf::from(format!(
        "/tmp/orbit-metalduck-{}-{nanos}.sock",
        std::process::id()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn app(with: &[&str]) -> (PathBuf, PathBuf) {
        let root = std::env::temp_dir().join(format!("orbit-gh-app-{}", uuid::Uuid::new_v4()));
        let contents = root.join("GameHub.app/Contents");
        for relative in with.iter().copied().chain(["Resources/libsandboxfs.dylib"]) {
            let path = contents.join(relative);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, b"dylib").unwrap();
        }
        (root, contents.join("Resources/libsandboxfs.dylib"))
    }

    #[test]
    fn injects_monitor_metalduck_and_overlay_in_gamehub_order() {
        let (root, sandboxfs) = app(&[
            "Frameworks/libwine_engine_monitor.dylib",
            "Resources/assets/metalduck/libMetalDuck.dylib",
        ]);
        let mut env = BTreeMap::new();
        apply(
            &mut env,
            &sandboxfs,
            Path::new("/tmp/orbit-metalduck-1-2.sock"),
        );
        let libraries: Vec<_> = env["DYLD_INSERT_LIBRARIES"].split(':').collect();
        assert_eq!(libraries.len(), 3);
        assert!(libraries[0].ends_with("Frameworks/libwine_engine_monitor.dylib"));
        assert!(libraries[1].ends_with("metalduck/libMetalDuck.dylib"));
        assert!(libraries[2].ends_with("Resources/libsandboxfs.dylib"));
        assert_eq!(env["WINEENGINE_GPTK_DXGI_SPOOF_ENABLED"], "1");
        assert_eq!(env["METALDUCK_NATIVE_FPS_LIMIT"], "120");
        assert_eq!(env["METALDUCK_FRAMEGEN"], "0");
        assert_eq!(env["METALDUCK_UPSCALING"], "0");
        assert_eq!(
            env["METALDUCK_SETTINGS_SOCKET_PATH"],
            "/tmp/orbit-metalduck-1-2.sock"
        );
        // Host-socket features stay off without GameHub running.
        assert!(!env.contains_key("WINEENGINE_MONITOR_ENABLED"));
        assert!(!env.contains_key("WINEENGINE_NATIVE_OVERLAY_ENABLED"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn missing_optional_libraries_leave_only_the_overlay() {
        let (root, sandboxfs) = app(&[]);
        let mut env = BTreeMap::new();
        apply(&mut env, &sandboxfs, Path::new("/tmp/x.sock"));
        assert_eq!(
            env["DYLD_INSERT_LIBRARIES"],
            sandboxfs.to_string_lossy().as_ref()
        );
        assert!(!env.contains_key("WINEENGINE_GPTK_DXGI_SPOOF_ENABLED"));
        assert!(!env.keys().any(|key| key.starts_with("METALDUCK_")));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn metalduck_sockets_are_unique_and_fit_sun_path() {
        let socket = metalduck_socket();
        assert!(socket.to_string_lossy().len() < 104);
        assert_ne!(socket, metalduck_socket());
    }
}
