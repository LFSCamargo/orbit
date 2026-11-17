//! SteamCMD config owned by Orbit. A saved login is files on disk, not a
//! running steam.exe. Passwords are never written or logged.
use std::{fs, path::Path};

use crate::utils::steam_account;

const COPY_CAP: usize = 16;

pub fn steamcmd_root(session: &Path) -> std::path::PathBuf {
    session.join("steamcmd")
}

pub fn has_saved_login(root: &Path) -> bool {
    steam_account::saved_client_session(root) || root.join("config/loginusers.vdf").is_file()
}

/// Copy sentry and login files from the Windows Steam seed into SteamCMD's
/// directory. The source prefix is not modified.
pub fn seed_from_client(prefix: &Path, steamcmd_root: &Path) -> Result<(), String> {
    let source = prefix.join("drive_c/Program Files (x86)/Steam");
    if !source.is_dir() {
        return Ok(());
    }
    fs::create_dir_all(steamcmd_root.join("config")).map_err(|err| err.to_string())?;
    for rel in ["config/loginusers.vdf", "config/config.vdf"] {
        copy_file(&source.join(rel), &steamcmd_root.join(rel))?;
    }
    let Ok(entries) = fs::read_dir(&source) else {
        return Ok(());
    };
    for (index, entry) in entries.flatten().enumerate() {
        if index >= COPY_CAP {
            break;
        }
        let name = entry.file_name();
        let Some(text) = name.to_str() else {
            continue;
        };
        if text.starts_with("ssfn") && entry.path().is_file() {
            copy_file(&entry.path(), &steamcmd_root.join(text))?;
        }
    }
    Ok(())
}

fn copy_file(from: &Path, to: &Path) -> Result<(), String> {
    if !from.is_file() {
        return Ok(());
    }
    if from
        .symlink_metadata()
        .is_ok_and(|meta| meta.file_type().is_symlink())
        || to
            .symlink_metadata()
            .is_ok_and(|meta| meta.file_type().is_symlink())
    {
        return Err("Steam login files cannot be symlinks".into());
    }
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    fs::copy(from, to)
        .map(|_| ())
        .map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn download_requires_a_saved_login_and_does_not_need_steam_exe() {
        let root = std::env::temp_dir().join(format!("orbit-cmd-login-{}", uuid::Uuid::new_v4()));
        let prefix = root.join("prefix");
        let steam = prefix.join("drive_c/Program Files (x86)/Steam");
        fs::create_dir_all(steam.join("config")).unwrap();
        fs::write(
            steam.join("config/loginusers.vdf"),
            "\"users\"\n{\n\t\"76561198000000000\"\n\t{\n\t\t\"AccountName\"\t\t\"orbit_player\"\n\t\t\"MostRecent\"\t\t\"1\"\n\t}\n}\n",
        )
        .unwrap();
        let cmd = steamcmd_root(&root.join("session"));
        assert!(!has_saved_login(&cmd));
        assert!(!steam.join("steam.exe").exists());
        seed_from_client(&prefix, &cmd).unwrap();
        assert!(has_saved_login(&cmd));
        assert!(cmd.join("config/loginusers.vdf").is_file());
        let _ = fs::remove_dir_all(root);
    }
}
