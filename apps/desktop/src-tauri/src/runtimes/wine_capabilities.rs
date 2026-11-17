//! Probe a Wine distribution for CrossOver-class features used by containers.
use anyhow::{Context, Result};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};

const MAX_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WineCapabilities {
    pub msync: bool,
    pub metal_view: bool,
    pub d3dmetal: bool,
}

impl WineCapabilities {
    /// MSync and the D3DMetal loader hooks: what GPTK titles need to run well.
    pub fn crossover_class(&self) -> bool {
        self.msync && self.d3dmetal
    }
}

/// Whether this Wine has MSync. Every process sharing a container's
/// wineserver must agree on `WINEMSYNC`, so Steam, Orbit's helpers, and the game
/// all use this one answer. Cached per Wine path: the probe reads large files.
pub fn supports_msync(wine: &Path) -> bool {
    static CACHE: std::sync::Mutex<Vec<(PathBuf, bool)>> = std::sync::Mutex::new(Vec::new());
    let Ok(mut cache) = CACHE.lock() else {
        return false;
    };
    if let Some((_, msync)) = cache.iter().find(|(path, _)| path == wine) {
        return *msync;
    }
    let msync = inspect(wine).is_ok_and(|caps| caps.msync);
    if cache.len() < 16 {
        cache.push((wine.to_path_buf(), msync));
    }
    msync
}

/// The sync variables for a container on this Wine.
pub fn container_sync_env(wine: &Path) -> [(&'static str, &'static str); 2] {
    if supports_msync(wine) {
        [("WINEMSYNC", "1"), ("WINEESYNC", "0")]
    } else {
        [("WINEMSYNC", "0"), ("WINEESYNC", "0")]
    }
}

/// Orbit Wine builds live here, one folder per version. Each is a games-category
/// app bundle so macOS Game Mode boosts the game (scripts/wine/build.sh).
pub const ORBIT_WINE_DIR: &str = "components/orbit-wine";
const BUNDLED_LOADER: &str = "Orbit Wine.app/Contents/MacOS/wine";

/// The newest installed Orbit Wine that passes the CrossOver-class probe.
pub fn installed_crossover(runtimes_root: &Path) -> Option<PathBuf> {
    let entries = fs::read_dir(runtimes_root.join(ORBIT_WINE_DIR)).ok()?;
    let mut versions: Vec<PathBuf> = entries
        .flatten()
        .take(32)
        .map(|entry| entry.path())
        .filter(|path| !path.is_symlink())
        .collect();
    versions.sort_by_key(|path| std::cmp::Reverse(version_key(path)));
    versions
        .into_iter()
        .flat_map(|version| [version.join(BUNDLED_LOADER), version.join("bin/wine")])
        .find(|wine| wine.is_file() && inspect(wine).is_ok_and(|caps| caps.crossover_class()))
}

fn version_key(path: &Path) -> Vec<u32> {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .split(|c: char| !c.is_ascii_digit())
        .filter_map(|part| part.parse().ok())
        .collect()
}

pub fn inspect(wine: &Path) -> Result<WineCapabilities> {
    let wine = wine
        .canonicalize()
        .context("Wine executable could not be read")?;
    let bin = wine.parent().context("Invalid Wine distribution layout")?;
    let root = bin.parent().unwrap_or(bin);
    let mut haystack = Vec::new();
    read_capped(&wine, &mut haystack)?;
    for candidate in [
        bin.join("wineserver"),
        root.join("lib/wine/x86_64-unix/winemac.so"),
        root.join("lib/wine/x86_64-unix/ntdll.so"),
        root.join("lib/wine/aarch64-unix/winemac.so"),
        root.join("lib/libwine.dylib"),
    ] {
        if candidate.is_file() {
            read_capped(&candidate, &mut haystack)?;
        }
    }
    Ok(scan(&haystack))
}

fn scan(bytes: &[u8]) -> WineCapabilities {
    WineCapabilities {
        msync: contains(bytes, b"WINEMSYNC"),
        metal_view: contains(bytes, b"metal_view") || contains(bytes, b"macdrv_create_metal"),
        d3dmetal: contains(bytes, b"D3DMetal") || contains(bytes, b"libd3dshared"),
    }
}

fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    haystack
        .windows(needle.len())
        .any(|window| window == needle)
}

fn read_capped(path: &Path, out: &mut Vec<u8>) -> Result<()> {
    let mut file = fs::File::open(path)?;
    let mut buf = vec![0u8; 64 * 1024];
    let start = out.len();
    loop {
        if (out.len() - start) as u64 >= MAX_BYTES {
            break;
        }
        let read = file.read(&mut buf)?;
        if read == 0 {
            break;
        }
        out.extend_from_slice(&buf[..read]);
    }
    Ok(())
}

pub fn distribution_root(wine: &Path) -> PathBuf {
    wine.parent()
        .and_then(Path::parent)
        .map(Path::to_path_buf)
        .unwrap_or_else(|| wine.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_msync_and_metal_view_strings() {
        let bytes = b"Wine WINEMSYNC macdrv_create_metal_view D3DMetal";
        let caps = scan(bytes);
        assert!(caps.msync);
        assert!(caps.metal_view);
        assert!(caps.d3dmetal);
        let empty = scan(b"wine-11.21");
        assert!(!empty.msync);
        assert!(!empty.metal_view);
        assert!(!empty.d3dmetal);
    }

    fn fake_wine(root: &Path, version: &str, ntdll: &[u8]) -> PathBuf {
        fake_wine_at(&root.join(ORBIT_WINE_DIR).join(version), ntdll)
    }

    /// `bin/` here; Orbit Wine's bundle puts the same files in `Contents/MacOS`.
    fn fake_wine_at(dist: &Path, ntdll: &[u8]) -> PathBuf {
        fs::create_dir_all(dist.join("bin")).unwrap();
        fs::create_dir_all(dist.join("lib/wine/x86_64-unix")).unwrap();
        fs::write(dist.join("bin/wine"), b"wine").unwrap();
        fs::write(dist.join("bin/wineserver"), b"WINEMSYNC").unwrap();
        fs::write(dist.join("lib/wine/x86_64-unix/ntdll.so"), ntdll).unwrap();
        dist.join("bin/wine")
    }

    #[test]
    fn a_container_uses_msync_exactly_when_its_wine_has_it() {
        // Regression: Steam started the wineserver without WINEMSYNC and the
        // game, launched with it, exited 1 ("Failed bootstrap_look_up ... msync").
        let root = std::env::temp_dir().join(format!("orbit-msync-{}", uuid::Uuid::new_v4()));
        let orbit = fake_wine(&root, "26.3.0", b"libd3dshared");
        assert_eq!(
            container_sync_env(&orbit),
            [("WINEMSYNC", "1"), ("WINEESYNC", "0")]
        );
        let plain = root.join("plain/bin/wine");
        fs::create_dir_all(plain.parent().unwrap()).unwrap();
        fs::write(&plain, b"wine-11.21").unwrap();
        fs::write(plain.with_file_name("wineserver"), b"server").unwrap();
        assert_eq!(
            container_sync_env(&plain),
            [("WINEMSYNC", "0"), ("WINEESYNC", "0")]
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn play_uses_the_game_mode_bundle_of_an_orbit_wine() {
        let root = std::env::temp_dir().join(format!("orbit-cx-app-{}", uuid::Uuid::new_v4()));
        let contents = root
            .join(ORBIT_WINE_DIR)
            .join("26.3.0/Orbit Wine.app/Contents");
        let bin = fake_wine_at(&contents, b"libd3dshared");
        fs::rename(bin.parent().unwrap(), contents.join("MacOS")).unwrap();
        assert_eq!(
            installed_crossover(&root).map(|wine| wine.canonicalize().unwrap()),
            Some(contents.join("MacOS/wine").canonicalize().unwrap())
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn play_finds_the_newest_crossover_class_orbit_wine() {
        let root = std::env::temp_dir().join(format!("orbit-cx-{}", uuid::Uuid::new_v4()));
        assert_eq!(installed_crossover(&root), None);
        // The D3DMetal hook is only in ntdll.so, which the probe must read.
        fake_wine(
            &root,
            "26.2.0",
            b"CX_APPLEGPTK_LIBD3DSHARED_PATH libd3dshared",
        );
        let newest = fake_wine(
            &root,
            "26.10.0",
            b"CX_APPLEGPTK_LIBD3DSHARED_PATH libd3dshared",
        );
        fake_wine(&root, "27.0.0", b"plain upstream ntdll");
        assert_eq!(
            installed_crossover(&root).map(|wine| wine.canonicalize().unwrap()),
            Some(newest.canonicalize().unwrap())
        );
        let _ = fs::remove_dir_all(root);
    }
}
