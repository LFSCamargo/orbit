//! Seed Valve's Steam client into a container without touching steam-windows.
use anyhow::{bail, Result};
use std::{fs, path::Path};

use super::clone::{clone_tree, copy_file};
use super::layout::prefix_ready;

const STEAM_REL: &str = "drive_c/Program Files (x86)/Steam";
const LOGIN_FILES: &[&str] = &["config/loginusers.vdf", "config/config.vdf"];

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
}
