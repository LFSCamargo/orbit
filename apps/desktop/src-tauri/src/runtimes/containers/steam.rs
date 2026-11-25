/// Seed Valve's Steam client into a container without touching steam-windows.
/// Read-only client binaries are symlinked from steam-windows (0 extra disk
/// bytes per game), while per-game config/saves stay local and disposable
/// Steam caches inside game containers are pruned.
use anyhow::{bail, Result};
use std::{fs, path::Path};

use super::clone::copy_file;
use super::layout::prefix_ready;

const STEAM_REL: &str = "drive_c/Program Files (x86)/Steam";
const LOGIN_FILES: &[&str] = &["config/loginusers.vdf", "config/config.vdf"];
/// Account data that stays local to each container and is never linked from source.
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
/// Mutable or per-container files at Steam's root that must never be symlinked.
const MUTABLE_ROOT_FILES: &[&str] = &[
    "steam.cfg",
    "steam.pid",
    "steam.signatures",
    "update_hosts_cached.vdf",
    "steam.exe.valve",
    "steam.exe.orbit-kept",
];
const SKIP_EXTENSIONS: &[&str] = &[".log", ".mdmp", ".old", ".tmp", ".lock", ".pid", ".dmp"];
/// Disposable cache folders inside a per-game container's Steam directory.
/// Never touched in `steam-windows`; pruned in game containers to prevent GBs of bloat.
const DISPOSABLE_CACHES: &[&str] = &[
    "htmlcache",
    "appcache/httpcache",
    "depotcache",
    "dumps",
    "logs",
    "package/tmp",
];
/// Valve's steam.exe, set aside while Orbit's agent stands in for it.
const KEPT_STEAM_EXE: &str = "steam.exe.orbit-kept";
const VALVE_STASH_EXE: &str = "steam.exe.valve";
const MAX_LINK_DEPTH: u8 = 12;

pub fn steam_root(prefix: &Path) -> std::path::PathBuf {
    prefix.join(STEAM_REL)
}

pub fn has_steam(prefix: &Path) -> bool {
    steam_root(prefix).join("steam.exe").is_file()
}

/// Write Steam's `steam.cfg` updater lock inside `steam_root`, refusing symlinks.
pub fn write_updater_config(steam_root: &Path, err_msg: &str) -> Result<(), String> {
    let path = steam_root.join("steam.cfg");
    if is_symlink(&path) {
        return Err("Steam configuration cannot be a symlink".into());
    }
    fs::write(
        &path,
        "BootStrapperInhibitAll = Enable\nBootStrapperForceSelfUpdate = False\n",
    )
    .map_err(|_| err_msg.to_string())
}

/// Link Valve's Steam client from a signed-in source prefix into the container
/// and copy only the small login files. The source is never modified.
/// Existing containers with copied client files or stale mutable symlinks are
/// automatically healed on launch.
pub fn seed(source_prefix: &Path, dest_prefix: &Path) -> Result<bool> {
    if !prefix_ready(source_prefix) {
        bail!("Sign in with Steam before playing this game");
    }
    if !has_steam(source_prefix) {
        return Ok(false);
    }
    let source = steam_root(source_prefix);
    let dest = steam_root(dest_prefix);
    if is_symlink(&dest) {
        bail!("Container Steam directory cannot be a symlink");
    }
    let steam_exe = dest.join("steam.exe");
    let has_dest_steam = steam_exe.is_file() || dest.join(KEPT_STEAM_EXE).is_file();
    let needs_dedup = has_dest_steam
        && !is_symlink(&steam_exe)
        && !dest.join(KEPT_STEAM_EXE).is_file()
        && !dest.join(VALVE_STASH_EXE).is_file();
    if has_dest_steam {
        let version_changed =
            client_version(&source).is_some() && client_version(&source) != client_version(&dest);
        if version_changed || needs_dedup {
            refresh_client(&source, &dest)?;
        }
        clean_mutable_symlinks(dest_prefix, &dest);
        prune_caches(dest_prefix);
        refresh_login(source_prefix, dest_prefix)?;
        return Ok(true);
    }
    fs::create_dir_all(&dest)?;
    clean_mutable_symlinks(dest_prefix, &dest);
    refresh_client(&source, &dest)?;
    prune_caches(dest_prefix);
    refresh_login(source_prefix, dest_prefix)?;
    Ok(true)
}

fn is_skippable_entry(name: &str, at_root: bool) -> bool {
    let lower = name.to_ascii_lowercase();
    if lower.starts_with('.') || SKIP_EXTENSIONS.iter().any(|ext| lower.ends_with(ext)) {
        return true;
    }
    if at_root {
        return lower.starts_with("ssfn")
            || USER_DATA
                .iter()
                .any(|entry| entry.eq_ignore_ascii_case(&lower))
            || MUTABLE_ROOT_FILES.contains(&lower.as_str())
            || lower.ends_with(".vdf")
            || lower.ends_with(".cfg");
    }
    false
}

/// Removes symlinks on mutable per-container files so Orbit never errors with
/// "cannot be a symlink" or writes back into `steam-windows`. Intentional
/// `steamapps/common/*` and `steamapps/appmanifest_*.acf` symlinks are kept.
pub fn clean_mutable_symlinks(dest_prefix: &Path, dest_steam: &Path) {
    for rel in [
        "steam.cfg",
        "steam.pid",
        "steam.signatures",
        "update_hosts_cached.vdf",
        "config/loginusers.vdf",
        "config/config.vdf",
        "config/libraryfolders.vdf",
        "steamapps/libraryfolders.vdf",
    ] {
        let path = dest_steam.join(rel);
        if is_symlink(&path) {
            let _ = fs::remove_file(&path);
        }
    }
    for dir in [dest_steam, &dest_steam.join("bin/cef")] {
        unlink_matching_recursive(dir, 0, 3, |name| {
            let lower = name.to_ascii_lowercase();
            SKIP_EXTENSIONS.iter().any(|ext| lower.ends_with(ext))
        });
    }
    unlink_matching_recursive(&dest_steam.join("config/ConnectCache"), 0, 1, |_| true);
    unlink_matching_recursive(dest_steam, 0, 0, |name| {
        name.to_ascii_lowercase().starts_with("ssfn")
    });
    if let Ok(accounts) = fs::read_dir(dest_steam.join("userdata")) {
        for account in accounts.take(32).flatten() {
            let localcfg = account.path().join("config/localconfig.vdf");
            if is_symlink(&localcfg) {
                let _ = fs::remove_file(&localcfg);
            }
        }
    }
    if let Ok(users) = fs::read_dir(dest_prefix.join("drive_c/users")) {
        for user in users.take(16).flatten() {
            let local = user.path().join("AppData/Local/Steam/local.vdf");
            if is_symlink(&local) {
                let _ = fs::remove_file(&local);
            }
        }
    }
}

fn unlink_matching_recursive(dir: &Path, depth: u8, max_depth: u8, matches: fn(&str) -> bool) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.take(4096).flatten() {
        let path = entry.path();
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if kind.is_symlink() {
            if entry.file_name().to_str().is_some_and(matches) {
                let _ = fs::remove_file(&path);
            }
        } else if kind.is_dir() && depth < max_depth {
            unlink_matching_recursive(&path, depth + 1, max_depth, matches);
        }
    }
}

/// Removes disposable Steam and Wine temp caches inside a per-game container
/// prefix. Saves (`Saved Games`, `userdata`), `config`, `local.vdf`, and
/// `steamapps` are never touched.
pub fn prune_caches(dest_prefix: &Path) {
    let dest_steam = steam_root(dest_prefix);
    for rel in DISPOSABLE_CACHES {
        remove_entry(&dest_steam.join(rel));
    }
    let users = dest_prefix.join("drive_c/users");
    if let Ok(entries) = fs::read_dir(&users) {
        for user in entries.take(16).flatten() {
            let path = user.path();
            if !path.is_dir() {
                continue;
            }
            remove_entry(&path.join("AppData/Local/Steam/htmlcache"));
            let temp = path.join("AppData/Local/Temp");
            if let Ok(items) = fs::read_dir(&temp) {
                for item in items.take(4096).flatten() {
                    remove_entry(&item.path());
                }
            }
        }
    }
}

fn remove_entry(target: &Path) {
    let Ok(meta) = target.symlink_metadata() else {
        return;
    };
    if meta.file_type().is_symlink() || !meta.is_dir() {
        let _ = fs::remove_file(target);
    } else {
        let _ = fs::remove_dir_all(target);
    }
}

fn is_symlink(path: &Path) -> bool {
    path.symlink_metadata()
        .is_ok_and(|meta| meta.file_type().is_symlink())
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

/// Links the signed-in client's read-only files into the container so
/// steam.exe, its DLLs and `package/` stay one version without duplicating
/// ~1–1.5 GB per game. Account data (`USER_DATA`), sentry files and dot-files
/// stay local. The source is only read. O(f) over the client's files.
fn refresh_client(source: &Path, dest: &Path) -> Result<()> {
    let kept_installed = dest.join(KEPT_STEAM_EXE).is_file();
    let agent_stashed = dest.join(VALVE_STASH_EXE).symlink_metadata().is_ok();
    for entry in fs::read_dir(source)?.take(4096) {
        let entry = entry?;
        let name = entry.file_name();
        let Some(text) = name.to_str() else {
            continue;
        };
        if is_skippable_entry(text, true) {
            continue;
        }
        let from = entry.path();
        let kind = entry.file_type()?;
        if kind.is_symlink() {
            continue;
        }
        // While the agent runs as steam.exe, Valve's client waits beside it.
        let to = if text == "steam.exe" && kept_installed {
            dest.join(KEPT_STEAM_EXE)
        } else if text == "steam.exe" && agent_stashed {
            dest.join(VALVE_STASH_EXE)
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
            link_tree(&from, &to, 0)?;
        } else {
            link_file(&from, &to)?;
        }
    }
    Ok(())
}

/// Creates real directories in `dest` and symlinks leaf files from `source`
/// so no directory symlink can redirect writes back into `steam-windows`.
fn link_tree(source: &Path, dest: &Path, depth: u8) -> Result<()> {
    if depth > MAX_LINK_DEPTH {
        bail!("Steam client folder exceeded supported depth");
    }
    fs::create_dir_all(dest)?;
    for entry in fs::read_dir(source)?.take(4096) {
        let entry = entry?;
        let name = entry.file_name();
        if name
            .to_str()
            .is_some_and(|text| is_skippable_entry(text, false))
        {
            continue;
        }
        let from = entry.path();
        let to = dest.join(&name);
        let kind = entry.file_type()?;
        if kind.is_symlink() {
            continue;
        }
        if kind.is_dir() {
            link_tree(&from, &to, depth + 1)?;
        } else if kind.is_file() {
            link_file(&from, &to)?;
        }
    }
    Ok(())
}

fn link_file(source: &Path, dest: &Path) -> Result<()> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(source, dest)?;
        Ok(())
    }
    #[cfg(not(unix))]
    {
        copy_file(source, dest)
    }
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
        fs::create_dir_all(dst.join("htmlcache")).unwrap();
        fs::write(dst.join("htmlcache/cache.bin"), b"junk").unwrap();
        fs::create_dir_all(src.join("htmlcache")).unwrap();
        fs::write(src.join("htmlcache/source.bin"), b"keep-source").unwrap();

        assert!(seed(&source, &dest).unwrap());
        assert_eq!(fs::read(dst.join("steam.exe")).unwrap(), b"MZ-NEW");
        assert_eq!(fs::read(dst.join("steamui.dll")).unwrap(), b"UI-NEW");
        assert_eq!(fs::read(dst.join("bin/cef.dll")).unwrap(), b"CEF-NEW");
        #[cfg(unix)]
        {
            assert!(is_symlink(&dst.join("steam.exe")));
            assert!(is_symlink(&dst.join("steamui.dll")));
            assert!(is_symlink(&dst.join("bin/cef.dll")));
            assert!(!is_symlink(&dst.join("bin")));
        }
        assert!(dst.join("package/steam_client_win64.installed").is_file());
        assert!(!dst.join("package/steam_client_win32.installed").exists());
        assert!(!dst.join("htmlcache").exists(), "container caches pruned");
        assert!(
            src.join("htmlcache/source.bin").is_file(),
            "steam-windows is never modified"
        );
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

        // Same client version and already linked: client tree is not rebuilt.
        fs::write(dst.join("bin/keep.txt"), b"local").unwrap();
        assert!(seed(&source, &dest).unwrap());
        assert_eq!(fs::read(dst.join("bin/keep.txt")).unwrap(), b"local");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn deduplicates_existing_copied_container_client_even_on_same_version() {
        let root = std::env::temp_dir().join(format!("orbit-steam-dedup-{}", uuid::Uuid::new_v4()));
        let source = root.join("steam-windows/prefix");
        let dest = root.join("containers/games/steam-570/prefix");
        for prefix in [&source, &dest] {
            fs::create_dir_all(steam_root(prefix).join("package")).unwrap();
            fs::create_dir_all(steam_root(prefix).join("config")).unwrap();
            fs::write(prefix.join("system.reg"), b"reg").unwrap();
            fs::write(steam_root(prefix).join("steam.exe"), b"MZ-SAME").unwrap();
            fs::write(
                steam_root(prefix).join("package/steam_client_win64.installed"),
                b"1794",
            )
            .unwrap();
        }
        fs::create_dir_all(steam_root(&dest).join("depotcache")).unwrap();
        fs::write(steam_root(&dest).join("depotcache/chunk.bin"), b"big").unwrap();
        fs::create_dir_all(steam_root(&dest).join("userdata/1/570/remote")).unwrap();
        fs::write(
            steam_root(&dest).join("userdata/1/570/remote/save.dat"),
            b"ok",
        )
        .unwrap();

        assert!(seed(&source, &dest).unwrap());
        #[cfg(unix)]
        assert!(
            is_symlink(&steam_root(&dest).join("steam.exe")),
            "copied client is replaced with a symlink"
        );
        assert!(!steam_root(&dest).join("depotcache").exists());
        assert_eq!(
            fs::read(steam_root(&dest).join("userdata/1/570/remote/save.dat")).unwrap(),
            b"ok"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn seed_never_symlinks_mutable_root_files_and_heals_existing_symlinks() {
        let root = std::env::temp_dir().join(format!("orbit-steam-heal-{}", uuid::Uuid::new_v4()));
        let source = root.join("steam-windows/prefix");
        let dest = root.join("containers/games/steam-1593500/prefix");
        let (src, dst) = (steam_root(&source), steam_root(&dest));
        fs::create_dir_all(src.join("config")).unwrap();
        fs::create_dir_all(src.join("bin/cef/cef.win64")).unwrap();
        fs::create_dir_all(src.join("package")).unwrap();
        fs::write(source.join("system.reg"), b"reg").unwrap();
        fs::write(src.join("steam.exe"), b"MZ").unwrap();
        fs::write(src.join("steam.cfg"), b"BootStrapperInhibitAll = Enable\n").unwrap();
        fs::write(src.join("steam.pid"), b"123").unwrap();
        fs::write(src.join("update_hosts_cached.vdf"), b"hosts").unwrap();
        fs::write(src.join("steam.signatures"), b"sig").unwrap();
        fs::write(src.join("steam.exe.old"), b"old").unwrap();
        fs::write(src.join("bin/cef/cef.win64/debug.log"), b"log").unwrap();
        fs::write(src.join("package/steam_client_win64.installed"), b"1794").unwrap();
        fs::write(
            src.join("config/loginusers.vdf"),
            b"\"AccountName\"\t\"me\"",
        )
        .unwrap();

        // Simulate an existing container with stale symlinks on mutable paths,
        // plus an intentional extra-library symlink in steamapps/.
        let ext = root.join("External/appmanifest_1593500.acf");
        fs::create_dir_all(ext.parent().unwrap()).unwrap();
        fs::write(&ext, b"manifest").unwrap();
        fs::create_dir_all(dst.join("config")).unwrap();
        fs::create_dir_all(dst.join("steamapps")).unwrap();
        fs::create_dir_all(dst.join("bin/cef/cef.win64")).unwrap();
        fs::create_dir_all(dst.join("package")).unwrap();
        fs::create_dir_all(dest.join("drive_c/users/crossover/AppData/Local/Steam")).unwrap();
        fs::write(dest.join("system.reg"), b"reg").unwrap();
        std::os::unix::fs::symlink(src.join("steam.exe"), dst.join("steam.exe")).unwrap();
        std::os::unix::fs::symlink(src.join("steam.cfg"), dst.join("steam.cfg")).unwrap();
        std::os::unix::fs::symlink(
            src.join("update_hosts_cached.vdf"),
            dst.join("update_hosts_cached.vdf"),
        )
        .unwrap();
        std::os::unix::fs::symlink(
            src.join("bin/cef/cef.win64/debug.log"),
            dst.join("bin/cef/cef.win64/debug.log"),
        )
        .unwrap();
        std::os::unix::fs::symlink(
            src.join("config/loginusers.vdf"),
            dst.join("config/loginusers.vdf"),
        )
        .unwrap();
        std::os::unix::fs::symlink(
            src.join("steam.cfg"),
            dst.join("steamapps/libraryfolders.vdf"),
        )
        .unwrap();
        std::os::unix::fs::symlink(src.join("steam.cfg"), dst.join("config/libraryfolders.vdf"))
            .unwrap();
        std::os::unix::fs::symlink(
            src.join("steam.cfg"),
            dest.join("drive_c/users/crossover/AppData/Local/Steam/local.vdf"),
        )
        .unwrap();
        std::os::unix::fs::symlink(&ext, dst.join("steamapps/appmanifest_1593500.acf")).unwrap();
        fs::write(dst.join("package/steam_client_win64.installed"), b"1794").unwrap();

        assert!(seed(&source, &dest).unwrap());
        assert!(is_symlink(&dst.join("steam.exe")));
        assert!(!is_symlink(&dst.join("steam.cfg")));
        assert!(!dst.join("steam.cfg").exists());
        assert!(!is_symlink(&dst.join("update_hosts_cached.vdf")));
        assert!(!dst.join("update_hosts_cached.vdf").exists());
        assert!(!dst.join("steam.pid").exists());
        assert!(!dst.join("steam.exe.old").exists());
        assert!(!dst.join("bin/cef/cef.win64/debug.log").exists());
        assert!(!is_symlink(&dst.join("config/loginusers.vdf")));
        assert!(!is_symlink(&dst.join("config/libraryfolders.vdf")));
        assert!(!is_symlink(&dst.join("steamapps/libraryfolders.vdf")));
        assert!(!is_symlink(
            &dest.join("drive_c/users/crossover/AppData/Local/Steam/local.vdf")
        ));
        assert!(
            is_symlink(&dst.join("steamapps/appmanifest_1593500.acf")),
            "intentional extra-library symlinks stay intact"
        );
        // Writing steam.cfg after seed succeeds cleanly and never writes to source.
        write_updater_config(&dst, "err").unwrap();
        assert!(dst.join("steam.cfg").is_file());
        let _ = fs::remove_dir_all(root);
    }
}
