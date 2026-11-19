//! Seed Valve's Steam client into a container without touching steam-windows.
use anyhow::{bail, Result};
use std::{fs, path::Path};

use super::clone::{clone_tree, copy_file};
use super::layout::prefix_ready;

const STEAM_REL: &str = "drive_c/Program Files (x86)/Steam";
const LOGIN_FILES: &[&str] = &["config/loginusers.vdf", "config/config.vdf"];
/// Account data that stays when the client files are refreshed.
const USER_DATA: &[&str] = &[
    "config",
    "userdata",
    "steamapps",
    "logs",
    "appcache",
    "depotcache",
    "dumps",
    "htmlcache",
];
/// Valve's steam.exe, set aside while Orbit's agent stands in for it.
const KEPT_STEAM_EXE: &str = "steam.exe.orbit-kept";

pub fn steam_root(prefix: &Path) -> std::path::PathBuf {
    prefix.join(STEAM_REL)
}

pub fn has_steam(prefix: &Path) -> bool {
    steam_root(prefix).join("steam.exe").is_file()
}

/// Copy Steam from a signed-in source prefix into the container. The source is
/// never deleted, emptied, or replaced.
pub fn seed(source_prefix: &Path, dest_prefix: &Path) -> Result<bool> {
    if !prefix_ready(source_prefix) {
        bail!("Sign in with Steam before playing this game");
    }
    if !has_steam(source_prefix) {
        return Ok(false);
    }
    let source = steam_root(source_prefix);
    let dest = steam_root(dest_prefix);
    if dest
        .symlink_metadata()
        .is_ok_and(|meta| meta.file_type().is_symlink())
    {
        bail!("Container Steam directory cannot be a symlink");
    }
    if dest.join("steam.exe").is_file() {
        if client_version(&source).is_some() && client_version(&source) != client_version(&dest) {
            refresh_client(&source, &dest)?;
        }
        refresh_login(source_prefix, dest_prefix)?;
        return Ok(true);
    }
    if dest.exists() {
        fs::remove_dir_all(&dest)?;
    }
    clone_tree(&source, &dest)?;
    refresh_login(source_prefix, dest_prefix)?;
    Ok(true)
}

/// Which Valve client a Steam folder holds: its `package/*.installed` records
/// (name and build). None when the folder has no client records.
pub fn client_version(steam: &Path) -> Option<Vec<(String, Vec<u8>)>> {
    let mut records: Vec<(String, Vec<u8>)> = fs::read_dir(steam.join("package"))
        .ok()?
        .flatten()
        .take(256)
        .filter_map(|entry| {
            let name = entry.file_name().to_str()?.to_string();
            if !name.ends_with(".installed") {
                return None;
            }
            Some((name, fs::read(entry.path()).ok()?))
        })
        .collect();
    records.sort();
    (!records.is_empty()).then_some(records)
}

/// Replaces the container's Valve client files with the signed-in client's,
/// so steam.exe, its DLLs and `package/` are one version. Account data
/// (`USER_DATA`), sentry files and dot-files stay. The source is only read.
/// O(f) over the client's files.
fn refresh_client(source: &Path, dest: &Path) -> Result<()> {
    let agent_installed = dest.join(KEPT_STEAM_EXE).is_file();
    for entry in fs::read_dir(source)?.take(4096) {
        let entry = entry?;
        let name = entry.file_name();
        let Some(text) = name.to_str() else {
            continue;
        };
        if text.starts_with('.') || text.starts_with("ssfn") || USER_DATA.contains(&text) {
            continue;
        }
        let from = entry.path();
        let kind = entry.file_type()?;
        if kind.is_symlink() {
            continue;
        }
        // While the agent runs as steam.exe, Valve's client waits beside it.
        let to = if text == "steam.exe" && agent_installed {
            dest.join(KEPT_STEAM_EXE)
        } else {
            dest.join(&name)
        };
        if let Ok(meta) = to.symlink_metadata() {
            if meta.is_dir() {
                fs::remove_dir_all(&to)?;
            } else {
                fs::remove_file(&to)?;
            }
        }
        if kind.is_dir() {
            clone_tree(&from, &to)?;
        } else {
            copy_file(&from, &to)?;
        }
    }
    Ok(())
}

pub fn refresh_login(source_prefix: &Path, dest_prefix: &Path) -> Result<()> {
    let source = steam_root(source_prefix);
    let dest = steam_root(dest_prefix);
    for rel in LOGIN_FILES {
        let from = source.join(rel);
        if from.is_file() {
            copy_file(&from, &dest.join(rel))?;
        }
    }
    let cache = source.join("config/ConnectCache");
    if cache.is_dir() {
        for (index, item) in fs::read_dir(&cache)?.enumerate() {
            if index >= 32 {
                break;
            }
            let item = item?;
            if item.path().is_file() {
                copy_file(
                    &item.path(),
                    &dest.join("config/ConnectCache").join(item.file_name()),
                )?;
            }
        }
    }
    // Wine Steam keeps its saved login (ConnectCache) per Windows user, outside
    // the Steam folder. Without it a container signs in with a stale token.
    let users = source_prefix.join("drive_c/users");
    if let Ok(entries) = fs::read_dir(&users) {
        for (index, item) in entries.enumerate() {
            if index >= 16 {
                break;
            }
            let rel = Path::new("drive_c/users")
                .join(item?.file_name())
                .join("AppData/Local/Steam/local.vdf");
            let from = source_prefix.join(&rel);
            if from.is_file()
                && !from
                    .symlink_metadata()
                    .is_ok_and(|meta| meta.file_type().is_symlink())
            {
                copy_file(&from, &dest_prefix.join(&rel))?;
            }
        }
    }
    if let Ok(entries) = fs::read_dir(&source) {
        for (index, item) in entries.enumerate() {
            if index >= 16 {
                break;
            }
            let item = item?;
            let name = item.file_name();
            if name
                .to_str()
                .is_some_and(|name| name.starts_with("ssfn") && name.len() <= 40)
                && item.path().is_file()
            {
                copy_file(&item.path(), &dest.join(name))?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seeds_steam_and_leaves_the_signed_in_prefix_in_place() {
        let root = std::env::temp_dir().join(format!("orbit-steam-seed-{}", uuid::Uuid::new_v4()));
        let source = root.join("steam-windows/prefix");
        let dest = root.join("containers/games/g1/prefix");
        fs::create_dir_all(steam_root(&source).join("config")).unwrap();
        fs::write(source.join("system.reg"), b"reg").unwrap();
        fs::write(steam_root(&source).join("steam.exe"), b"MZ").unwrap();
        fs::write(
            steam_root(&source).join("config/loginusers.vdf"),
            b"\"AccountName\"\t\"orbit\"",
        )
        .unwrap();
        fs::create_dir_all(dest.join("drive_c")).unwrap();
        fs::write(dest.join("system.reg"), b"reg").unwrap();
        assert!(seed(&source, &dest).unwrap());
        assert!(steam_root(&source).join("steam.exe").is_file());
        assert!(steam_root(&dest).join("steam.exe").is_file());
        fs::write(
            steam_root(&source).join("config/loginusers.vdf"),
            b"\"AccountName\"\t\"updated\"",
        )
        .unwrap();
        assert!(seed(&source, &dest).unwrap());
        let login = fs::read_to_string(steam_root(&dest).join("config/loginusers.vdf")).unwrap();
        assert!(login.contains("updated"));
        assert!(steam_root(&source).join("steam.exe").is_file());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_new_sign_in_reaches_a_container_that_already_has_steam() {
        // Regression: the saved login lives in each Windows user's local.vdf,
        // outside the Steam folder, so containers kept a revoked token.
        let root = std::env::temp_dir().join(format!("orbit-steam-token-{}", uuid::Uuid::new_v4()));
        let source = root.join("steam-windows/prefix");
        let dest = root.join("containers/games/g1/prefix");
        let local = "drive_c/users/lfscamargo/AppData/Local/Steam/local.vdf";
        for prefix in [&source, &dest] {
            fs::create_dir_all(steam_root(prefix).join("config")).unwrap();
            fs::write(prefix.join("system.reg"), b"reg").unwrap();
            fs::write(steam_root(prefix).join("steam.exe"), b"MZ").unwrap();
            fs::create_dir_all(prefix.join(local).parent().unwrap()).unwrap();
        }
        fs::write(dest.join(local), b"\"ConnectCache\" revoked").unwrap();
        fs::write(source.join(local), b"\"ConnectCache\" fresh").unwrap();
        assert!(seed(&source, &dest).unwrap());
        assert_eq!(
            fs::read(dest.join(local)).unwrap(),
            b"\"ConnectCache\" fresh"
        );
        assert_eq!(
            fs::read(source.join(local)).unwrap(),
            b"\"ConnectCache\" fresh"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_container_with_an_older_client_gets_the_signed_in_client() {
        // Regression: a container cloned from an older seed kept its January
        // 32-bit client while Orbit linked in a newer steam.exe, and Steam
        // stopped with "steamui.dll not found".
        let root =
            std::env::temp_dir().join(format!("orbit-steam-client-{}", uuid::Uuid::new_v4()));
        let source = root.join("steam-windows/prefix");
        let dest = root.join("containers/games/steam-312990/prefix");
        for prefix in [&source, &dest] {
            fs::create_dir_all(steam_root(prefix).join("package")).unwrap();
            fs::create_dir_all(steam_root(prefix).join("config")).unwrap();
            fs::create_dir_all(steam_root(prefix).join("bin")).unwrap();
            fs::write(prefix.join("system.reg"), b"reg").unwrap();
        }
        let (src, dst) = (steam_root(&source), steam_root(&dest));
        fs::write(src.join("steam.exe"), b"MZ-NEW").unwrap();
        fs::write(src.join("steamui.dll"), b"UI-NEW").unwrap();
        fs::write(src.join("bin/cef.dll"), b"CEF-NEW").unwrap();
        fs::write(src.join("package/steam_client_win64.installed"), b"1794").unwrap();
        fs::write(src.join("config/loginusers.vdf"), b"fresh login").unwrap();
        fs::write(dst.join("steam.exe"), b"MZ-OLD").unwrap();
        fs::write(dst.join("steamui.dll"), b"UI-OLD").unwrap();
        fs::write(dst.join("bin/cef.dll"), b"CEF-OLD").unwrap();
        fs::write(dst.join("package/steam_client_win32.installed"), b"1769").unwrap();
        fs::create_dir_all(dst.join("steamapps/common/Game")).unwrap();
        fs::write(dst.join("steamapps/appmanifest_312990.acf"), b"game").unwrap();
        fs::create_dir_all(dst.join("userdata/1/312990/remote")).unwrap();
        fs::write(dst.join("userdata/1/312990/remote/save.dat"), b"save").unwrap();

        assert!(seed(&source, &dest).unwrap());
        assert_eq!(fs::read(dst.join("steam.exe")).unwrap(), b"MZ-NEW");
        assert_eq!(fs::read(dst.join("steamui.dll")).unwrap(), b"UI-NEW");
        assert_eq!(fs::read(dst.join("bin/cef.dll")).unwrap(), b"CEF-NEW");
        assert!(dst.join("package/steam_client_win64.installed").is_file());
        assert!(!dst.join("package/steam_client_win32.installed").exists());
        assert_eq!(
            fs::read(dst.join("config/loginusers.vdf")).unwrap(),
            b"fresh login"
        );
        assert_eq!(
            fs::read(dst.join("steamapps/appmanifest_312990.acf")).unwrap(),
            b"game"
        );
        assert_eq!(
            fs::read(dst.join("userdata/1/312990/remote/save.dat")).unwrap(),
            b"save"
        );
        assert_eq!(fs::read(src.join("steamui.dll")).unwrap(), b"UI-NEW");

        // Same client version: nothing is copied again.
        fs::write(dst.join("steamui.dll"), b"UI-LOCAL").unwrap();
        assert!(seed(&source, &dest).unwrap());
        assert_eq!(fs::read(dst.join("steamui.dll")).unwrap(), b"UI-LOCAL");
        let _ = fs::remove_dir_all(root);
    }
}
