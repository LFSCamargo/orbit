//! Wine compatibility shim for Steam's browser, with the vendor binary preserved.
use anyhow::{bail, Context, Result};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};

const SHIM: &[u8] = include_bytes!("../../assets/steam-browser-helper.exe");
pub const ORIGINAL_NAME: &str = "steamwebhelper-orbit-original.exe";
const CEF_LAYOUTS: &[&str] = &["cef.win64", "cef.win7x64", "cef.win7"];

/// Wine Steam may ship Win64 or Win7 CEF. Prefer 64-bit, then the helper that is on disk.
pub fn helper_dir(steam_root: &Path) -> Option<PathBuf> {
    let cef = steam_root.join("bin/cef");
    CEF_LAYOUTS.iter().find_map(|name| {
        let dir = cef.join(name);
        dir.join("steamwebhelper.exe").is_file().then_some(dir)
    })
}

pub fn helper_exe(steam_root: &Path) -> Option<PathBuf> {
    helper_dir(steam_root).map(|dir| dir.join("steamwebhelper.exe"))
}

pub fn original_helper(steam_root: &Path) -> Option<PathBuf> {
    helper_dir(steam_root).map(|dir| dir.join(ORIGINAL_NAME))
}

/// Fixed vendor layout, bounded reads, atomic replacement. O(helper bytes).
/// Steam's updater may replace the shim; preserve that new vendor binary too.
pub fn prepare(steam: &Path) -> Result<PathBuf> {
    let root = steam
        .parent()
        .context("Steam has no installation directory")?
        .canonicalize()?;
    let Some(cef) = helper_dir(&root) else {
        bail!("Steam is still installing its browser. Use Install Steam for Windows, then sign in");
    };
    let Ok(canonical) = cef.canonicalize() else {
        bail!("Steam is still installing its browser. Use Install Steam for Windows, then sign in");
    };
    if !canonical.starts_with(&root) {
        bail!("Steam's browser directory escapes its installation");
    }
    let helper = canonical.join("steamwebhelper.exe");
    let original = canonical.join(ORIGINAL_NAME);
    let staged = canonical.join("orbit-browser.tmp");
    for path in [&helper, &original, &staged] {
        if path
            .symlink_metadata()
            .is_ok_and(|m| m.file_type().is_symlink())
        {
            bail!("Steam browser paths cannot be symlinks");
        }
    }
    let mut bytes = Vec::new();
    fs::File::open(&helper)?
        .take(32 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > 32 * 1024 * 1024 || !bytes.starts_with(b"MZ") {
        bail!("Steam's browser is invalid. Repair the official Steam installation");
    }
    if bytes == SHIM {
        if !original.is_file() {
            bail!("Steam's original browser is missing. Repair Steam before signing in");
        }
        return Ok(original);
    }
    // Write the backup first. A failed installation always leaves Valve's
    // executable at its existing launch path until the final atomic rename.
    fs::write(&staged, &bytes)?;
    fs::rename(&staged, &original)?;
    fs::write(&staged, SHIM)?;
    fs::rename(&staged, &helper)?;
    Ok(original)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    fn fixture() -> (PathBuf, PathBuf) {
        let root =
            std::env::temp_dir().join(format!("orbit-steam-browser-{}", uuid::Uuid::new_v4()));
        let cef = root.join("bin/cef/cef.win64");
        fs::create_dir_all(&cef).unwrap();
        fs::write(root.join("steam.exe"), b"MZsteam").unwrap();
        fs::write(cef.join("steamwebhelper.exe"), b"MZoriginal").unwrap();
        (root, cef)
    }
    #[test]
    fn installs_idempotently_and_preserves_the_latest_vendor_helper() {
        let (root, cef) = fixture();
        prepare(&root.join("steam.exe")).unwrap();
        let shim = fs::read(cef.join("steamwebhelper.exe")).unwrap();
        assert_ne!(shim, b"MZoriginal");
        assert_eq!(
            fs::read(cef.join("steamwebhelper-orbit-original.exe")).unwrap(),
            b"MZoriginal"
        );
        prepare(&root.join("steam.exe")).unwrap();
        assert_eq!(
            fs::read(cef.join("steamwebhelper-orbit-original.exe")).unwrap(),
            b"MZoriginal"
        );
        fs::write(cef.join("steamwebhelper.exe"), b"MZupdated").unwrap();
        prepare(&root.join("steam.exe")).unwrap();
        assert_eq!(
            fs::read(cef.join("steamwebhelper-orbit-original.exe")).unwrap(),
            b"MZupdated"
        );
        assert_eq!(fs::read(cef.join("steamwebhelper.exe")).unwrap(), shim);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn prefers_win64_then_accepts_the_win7_helper_steam_actually_ships() {
        let root =
            std::env::temp_dir().join(format!("orbit-steam-browser-win7-{}", uuid::Uuid::new_v4()));
        let win7 = root.join("bin/cef/cef.win7x64");
        fs::create_dir_all(&win7).unwrap();
        fs::write(root.join("steam.exe"), b"MZsteam").unwrap();
        fs::write(win7.join("steamwebhelper.exe"), b"MZwin7").unwrap();
        assert_eq!(helper_dir(&root).as_ref(), Some(&win7));
        prepare(&root.join("steam.exe")).unwrap();
        assert_eq!(
            fs::read(win7.join("steamwebhelper-orbit-original.exe")).unwrap(),
            b"MZwin7"
        );
        let win64 = root.join("bin/cef/cef.win64");
        fs::create_dir_all(&win64).unwrap();
        fs::write(win64.join("steamwebhelper.exe"), b"MZwin64").unwrap();
        assert_eq!(helper_dir(&root).as_ref(), Some(&win64));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn missing_browser_explains_the_incomplete_steam_install() {
        let root = std::env::temp_dir().join(format!(
            "orbit-steam-browser-missing-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("steam.exe"), b"MZsteam").unwrap();
        let error = prepare(&root.join("steam.exe")).unwrap_err().to_string();
        assert!(error.contains("still installing its browser"), "{error}");
        assert!(!error.to_ascii_lowercase().contains("os error"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    #[cfg(unix)]
    fn rejects_a_symlink_without_overwriting_its_target() {
        let (root, cef) = fixture();
        let outside = root.join("outside");
        fs::write(&outside, b"keep").unwrap();
        std::os::unix::fs::symlink(&outside, cef.join("steamwebhelper-orbit-original.exe"))
            .unwrap();
        assert!(prepare(&root.join("steam.exe")).is_err());
        assert_eq!(fs::read(outside).unwrap(), b"keep");
        fs::remove_dir_all(root).unwrap();
    }
}
