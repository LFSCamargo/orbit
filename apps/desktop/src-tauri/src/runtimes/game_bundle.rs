//! Run a Wine installation as part of an Orbit app bundle that declares the
//! games category, so macOS Game Mode boosts the game's Wine processes.
//!
//! `gamepolicyd` classifies a process through `LSBundleRecord
//! bundleRecordForAuditToken:` and the record's category. A bare Wine loader
//! has no record, so Game Mode only ever boosted Orbit itself. The bundle:
//!
//! ```text
//! Orbit Game.app/Contents/Info.plist        games category, LSUIElement
//! Orbit Game.app/Contents/MacOS/wine        copy of <unix>/wine (the loader)
//! …/MacOS/lib/wine/<arch>-unix/ntdll.so     copy (WINE_NTDLL_SONAME points here)
//! …/MacOS/lib/wine/<arch>-unix/wine         -> ../../../wine
//! …/MacOS/lib/wine/<arch>-unix/*            -> installation files
//! …/MacOS/lib/wine/<other>, lib/*, share, bin -> installation
//! ```
//!
//! `ntdll.so` derives the loader for every child process (the game included)
//! from its own directory, so children resolve to the bundle's loader too.
//! Only loaders that honour `WINE_NTDLL_SONAME` and carry no entitlements
//! (ad-hoc re-signing would drop them) are bundled; others run unchanged.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use anyhow::{bail, Context, Result};
use sha2::{Digest, Sha256};

pub const BUNDLE_ID: &str = "com.orbit.launcher.game";
const APP_NAME: &str = "Orbit Game.app";
const LAYOUT_VERSION: u32 = 1;

const INFO_PLIST: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>wine</string>
  <key>CFBundleIdentifier</key><string>com.orbit.launcher.game</string>
  <key>CFBundleName</key><string>Orbit Game</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.games</string>
  <key>LSSupportsGameMode</key><true/>
  <key>LSUIElement</key><true/>
  <key>NSPrincipalClass</key><string>WineApplication</string>
</dict>
</plist>
"#;

/// The bundled loader and the `ntdll.so` it must load.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GameBundle {
    pub app: PathBuf,
    pub loader: PathBuf,
    pub ntdll: PathBuf,
}

impl GameBundle {
    /// Environment for the loader: children inherit it.
    pub fn env(&self) -> [(&'static str, PathBuf); 2] {
        [
            ("WINE_NTDLL_SONAME", self.ntdll.clone()),
            ("WINELOADER", self.loader.clone()),
        ]
    }
}

/// The `<arch>-unix` directory holding the loader and `ntdll.so`.
pub fn unix_dir(install: &Path) -> Option<PathBuf> {
    let lib = install.join("lib/wine");
    let mut dirs: Vec<PathBuf> = fs::read_dir(&lib)
        .ok()?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.ends_with("-unix"))
                && path.join("wine").is_file()
                && path.join("ntdll.so").is_file()
        })
        .collect();
    dirs.sort();
    dirs.into_iter().next()
}

fn mentions(path: &Path, needle: &[u8]) -> bool {
    fs::read(path)
        .map(|bytes| bytes.windows(needle.len()).any(|window| window == needle))
        .unwrap_or(false)
}

/// Fingerprint of the sources a bundle was built from.
fn stamp(loader: &Path, ntdll: &Path) -> String {
    let describe = |path: &Path| {
        fs::metadata(path)
            .map(|meta| {
                let modified = meta
                    .modified()
                    .ok()
                    .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                    .map(|elapsed| elapsed.as_nanos())
                    .unwrap_or_default();
                format!("{}:{modified}", meta.len())
            })
            .unwrap_or_default()
    };
    format!("v{LAYOUT_VERSION} {} {}", describe(loader), describe(ntdll))
}

/// `<cache>/game-bundles/<sha of install path>`.
pub fn bundle_dir(cache: &Path, install: &Path) -> PathBuf {
    let digest = Sha256::digest(install.to_string_lossy().as_bytes());
    let key: String = digest[..8]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    cache.join("game-bundles").join(key)
}

/// Build the bundle tree (no signing). Returns the bundle description.
pub fn build_layout(install: &Path, unix: &Path, app: &Path) -> Result<GameBundle> {
    let arch_unix = unix
        .file_name()
        .context("Wine's unix directory has no name")?;
    let macos = app.join("Contents/MacOS");
    let mirror = macos.join("lib/wine").join(arch_unix);
    fs::create_dir_all(&mirror)?;
    fs::write(app.join("Contents/Info.plist"), INFO_PLIST)?;
    fs::copy(unix.join("wine"), macos.join("wine")).context("Cannot copy the Wine loader")?;
    for entry in fs::read_dir(unix)? {
        let entry = entry?;
        let name = entry.file_name();
        let target = mirror.join(&name);
        match name.to_str() {
            Some("wine") => std::os::unix::fs::symlink("../../../wine", &target)?,
            Some("ntdll.so") => {
                fs::copy(entry.path(), &target).context("Cannot copy ntdll.so")?;
            }
            _ => std::os::unix::fs::symlink(entry.path(), &target)?,
        }
    }
    for entry in fs::read_dir(install.join("lib/wine"))? {
        let entry = entry?;
        if entry.file_name() != arch_unix {
            std::os::unix::fs::symlink(
                entry.path(),
                macos.join("lib/wine").join(entry.file_name()),
            )?;
        }
    }
    for entry in fs::read_dir(install.join("lib"))? {
        let entry = entry?;
        if entry.file_name() != "wine" {
            std::os::unix::fs::symlink(entry.path(), macos.join("lib").join(entry.file_name()))?;
        }
    }
    for name in ["share", "bin"] {
        let source = install.join(name);
        if source.exists() {
            std::os::unix::fs::symlink(&source, macos.join(name))?;
        }
    }
    Ok(GameBundle {
        app: app.to_path_buf(),
        loader: macos.join("wine"),
        ntdll: mirror.join("ntdll.so"),
    })
}

/// The bundle for `install`, built or refreshed under `cache`. `None` when the
/// loader cannot run from a bundle; callers then launch the installation as is.
pub fn ensure(install: &Path, cache: &Path) -> Result<Option<GameBundle>> {
    let Some(unix) = unix_dir(install) else {
        return Ok(None);
    };
    let loader = unix.join("wine");
    let ntdll = unix.join("ntdll.so");
    if !mentions(&loader, b"WINE_NTDLL_SONAME") || has_entitlements(&loader) {
        return Ok(None);
    }
    let dir = bundle_dir(cache, install);
    let app = dir.join(APP_NAME);
    let stamp_path = dir.join("source.stamp");
    let wanted = stamp(&loader, &ntdll);
    if app.is_dir() && fs::read_to_string(&stamp_path).ok().as_deref() == Some(wanted.as_str()) {
        return Ok(Some(described(&unix, &app)?));
    }

    fs::create_dir_all(&dir)?;
    let staging = dir.join(format!(".building-{}", uuid::Uuid::new_v4()));
    let staged_app = staging.join(APP_NAME);
    let result = build_layout(install, &unix, &staged_app).and_then(|_| sign(&staged_app));
    if let Err(error) = result {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }
    if app.exists() {
        fs::remove_dir_all(&app)?;
    }
    fs::rename(&staged_app, &app)?;
    let _ = fs::remove_dir_all(&staging);
    fs::write(&stamp_path, &wanted)?;
    register(&app);
    Ok(Some(described(&unix, &app)?))
}

fn described(unix: &Path, app: &Path) -> Result<GameBundle> {
    let arch_unix = unix
        .file_name()
        .context("Wine's unix directory has no name")?;
    let macos = app.join("Contents/MacOS");
    Ok(GameBundle {
        app: app.to_path_buf(),
        loader: macos.join("wine"),
        ntdll: macos.join("lib/wine").join(arch_unix).join("ntdll.so"),
    })
}

fn has_entitlements(loader: &Path) -> bool {
    std::process::Command::new("/usr/bin/codesign")
        .args(["-d", "--entitlements", "-", "--xml"])
        .arg(loader)
        .output()
        .map(|output| output.stdout.windows(5).any(|window| window == b"<key>"))
        .unwrap_or(true)
}

/// Ad-hoc signature over the new Info.plist (the copied loader's own
/// signature binds a different one and macOS would kill it).
fn sign(app: &Path) -> Result<()> {
    let status = std::process::Command::new("/usr/bin/codesign")
        .args(["--force", "--sign", "-"])
        .arg(app)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .context("codesign is unavailable")?;
    if !status.success() {
        bail!("Could not sign Orbit's game bundle");
    }
    Ok(())
}

/// Make LaunchServices aware of the bundle before its first launch.
fn register(app: &Path) {
    let _ = std::process::Command::new(
        "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
    )
    .arg("-f")
    .arg(app)
    .stdout(std::process::Stdio::null())
    .stderr(std::process::Stdio::null())
    .status();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fake_install() -> PathBuf {
        let root = std::env::temp_dir().join(format!("orbit-bundle-{}", uuid::Uuid::new_v4()));
        let unix = root.join("lib/wine/x86_64-unix");
        fs::create_dir_all(&unix).unwrap();
        fs::write(unix.join("wine"), b"loader WINE_NTDLL_SONAME").unwrap();
        fs::write(unix.join("ntdll.so"), b"ntdll").unwrap();
        fs::write(unix.join("winemac.so"), b"winemac").unwrap();
        fs::create_dir_all(root.join("lib/wine/x86_64-windows")).unwrap();
        fs::create_dir_all(root.join("lib/wine/i386-windows")).unwrap();
        fs::write(root.join("lib/libMoltenVK.dylib"), b"mvk").unwrap();
        fs::create_dir_all(root.join("share/wine")).unwrap();
        fs::create_dir_all(root.join("bin")).unwrap();
        root
    }

    #[test]
    fn finds_the_unix_directory_with_a_loader_and_ntdll() {
        let install = fake_install();
        assert_eq!(
            unix_dir(&install),
            Some(install.join("lib/wine/x86_64-unix"))
        );
        assert!(unix_dir(&install.join("missing")).is_none());
        let _ = fs::remove_dir_all(install);
    }

    #[test]
    fn layout_keeps_child_loaders_inside_the_bundle() {
        let install = fake_install();
        let unix = unix_dir(&install).unwrap();
        let app = install.join("out/Orbit Game.app");
        let bundle = build_layout(&install, &unix, &app).unwrap();
        let macos = app.join("Contents/MacOS");
        assert_eq!(bundle.loader, macos.join("wine"));
        assert_eq!(bundle.ntdll, macos.join("lib/wine/x86_64-unix/ntdll.so"));
        // Real copies where the path decides identity.
        assert!(!fs::symlink_metadata(&bundle.loader)
            .unwrap()
            .file_type()
            .is_symlink());
        assert!(!fs::symlink_metadata(&bundle.ntdll)
            .unwrap()
            .file_type()
            .is_symlink());
        // ntdll's sibling loader resolves back to Contents/MacOS/wine.
        let child = macos.join("lib/wine/x86_64-unix/wine");
        assert_eq!(
            fs::read_link(&child).unwrap(),
            PathBuf::from("../../../wine")
        );
        assert_eq!(
            fs::canonicalize(&child).unwrap(),
            fs::canonicalize(&bundle.loader).unwrap()
        );
        // Everything else points at the installation.
        assert_eq!(
            fs::read_link(macos.join("lib/wine/x86_64-unix/winemac.so")).unwrap(),
            unix.join("winemac.so")
        );
        assert!(macos.join("lib/wine/x86_64-windows").is_dir());
        assert!(macos.join("lib/wine/i386-windows").is_dir());
        assert!(macos.join("lib/libMoltenVK.dylib").is_file());
        assert!(macos.join("share/wine").is_dir());
        let plist = fs::read_to_string(app.join("Contents/Info.plist")).unwrap();
        assert!(plist.contains("public.app-category.games"));
        assert!(plist.contains(BUNDLE_ID));
        assert!(plist.contains("<key>LSUIElement</key><true/>"));
        let env = bundle.env();
        assert_eq!(env[0], ("WINE_NTDLL_SONAME", bundle.ntdll.clone()));
        assert_eq!(env[1], ("WINELOADER", bundle.loader.clone()));
        let _ = fs::remove_dir_all(install);
    }

    #[test]
    fn loaders_without_ntdll_override_run_unbundled() {
        let install = fake_install();
        fs::write(
            install.join("lib/wine/x86_64-unix/wine"),
            b"upstream loader",
        )
        .unwrap();
        let cache = install.join("cache");
        assert_eq!(ensure(&install, &cache).unwrap(), None);
        assert!(!cache.exists());
        let _ = fs::remove_dir_all(install);
    }

    #[test]
    fn bundle_directories_are_per_installation_and_stamps_track_sources() {
        let install = fake_install();
        let cache = Path::new("/cache");
        assert_ne!(
            bundle_dir(cache, &install),
            bundle_dir(cache, &install.join("other"))
        );
        assert!(bundle_dir(cache, &install).starts_with("/cache/game-bundles"));
        let unix = unix_dir(&install).unwrap();
        let before = stamp(&unix.join("wine"), &unix.join("ntdll.so"));
        fs::write(unix.join("ntdll.so"), b"updated ntdll build").unwrap();
        assert_ne!(before, stamp(&unix.join("wine"), &unix.join("ntdll.so")));
        let _ = fs::remove_dir_all(install);
    }

    #[test]
    #[ignore = "requires GameHub's x86_64 Wine installation"]
    fn live_gamehub_wine_runs_from_a_signed_games_bundle() {
        let install = dirs::data_dir()
            .unwrap()
            .join("com.gamemac.www/wine-engine/containers/wine_installations/10000073");
        let cache =
            std::env::temp_dir().join(format!("orbit-bundle-live-{}", uuid::Uuid::new_v4()));
        let bundle = ensure(&install, &cache).unwrap().expect("bundled");
        let verify = std::process::Command::new("/usr/bin/codesign")
            .arg("-v")
            .arg(&bundle.app)
            .status()
            .unwrap();
        assert!(verify.success());
        let version = std::process::Command::new(&bundle.loader)
            .arg("--version")
            .envs(bundle.env())
            .output()
            .unwrap();
        assert!(String::from_utf8_lossy(&version.stdout).starts_with("wine-"));
        // A second call reuses the bundle.
        assert_eq!(ensure(&install, &cache).unwrap(), Some(bundle));
        let _ = fs::remove_dir_all(cache);
    }
}
