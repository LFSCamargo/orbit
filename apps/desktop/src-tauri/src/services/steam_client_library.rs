//! Register extra Steam libraries with the managed Wine client.
//! Orbit's UI already scans additional folders; Steamworks only sees installs
//! listed in the prefix steamapps / libraryfolders.vdf.
use crate::utils::steam_vdf::{self, Value};
use std::{
    collections::HashSet,
    fs,
    io::Read,
    path::{Path, PathBuf},
};

const EMPTY_FOLDERS: &str =
    "\"libraryfolders\" { \"0\" { \"path\" \"C:\\\\Program Files (x86)\\\\Steam\" } }";

fn merge(content: &str, paths: &[String]) -> Result<String, String> {
    let mut tree = steam_vdf::parse(content)?;
    let fields = match tree.as_mut_slice() {
        [(name, Value::Object(fields))] if name.eq_ignore_ascii_case("libraryfolders") => fields,
        _ => return Err("Steam library configuration has an unsupported format".into()),
    };
    if paths.len() > 16 {
        return Err("Too many Steam libraries".into());
    }
    let mut known = HashSet::new();
    let mut next = 0u32;
    for (id, value) in fields.iter() {
        if let Ok(number) = id.parse::<u32>() {
            next = next.max(number.saturating_add(1));
        }
        if let Value::Object(entry) = value {
            for (key, value) in entry {
                if let ("path", Value::Text(path)) = (key.as_str(), value) {
                    known.insert(library_key(path));
                }
            }
        }
    }
    for path in paths {
        if !known.insert(library_key(path)) {
            continue;
        }
        fields.push((
            next.to_string(),
            Value::Object(vec![
                ("path".into(), Value::Text(path.clone())),
                ("label".into(), Value::Text(String::new())),
                ("apps".into(), Value::Object(Vec::new())),
            ]),
        ));
        next += 1;
    }
    Ok(steam_vdf::write(&tree))
}

fn read_vdf(path: &Path, root: &Path) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }
    if path
        .symlink_metadata()
        .is_ok_and(|meta| meta.file_type().is_symlink())
    {
        return Err("Managed Steam library configuration cannot be a symlink".into());
    }
    let root = root.canonicalize().map_err(|_| "Steam is not installed")?;
    if !path
        .canonicalize()
        .map_err(|_| "Steam library configuration is inaccessible")?
        .starts_with(&root)
    {
        return Err("Steam library configuration escapes its managed directory".into());
    }
    let mut text = String::new();
    fs::File::open(path)
        .map_err(|_| "Steam library configuration is inaccessible")?
        .take(262145)
        .read_to_string(&mut text)
        .map_err(|_| "Steam library configuration could not be read")?;
    Ok(Some(text))
}

fn write_vdf(path: &Path, content: &str) -> Result<(), String> {
    let pending = path.with_extension("orbit-new");
    if pending
        .symlink_metadata()
        .is_ok_and(|meta| meta.file_type().is_symlink())
    {
        return Err("Steam library staging file cannot be a symlink".into());
    }
    fs::create_dir_all(path.parent().ok_or("Invalid Steam library directory")?)
        .map_err(|_| "Steam library directory could not be created")?;
    fs::write(&pending, content)
        .and_then(|_| fs::rename(&pending, path))
        .map_err(|_| "Steam library configuration could not be saved".to_string())
}

fn library_root(common: &Path) -> Result<PathBuf, String> {
    common
        .parent()
        .and_then(Path::parent)
        .ok_or_else(|| "Invalid Steam library".into())
        .map(Path::to_path_buf)
}

/// One spelling per library: Steam rewrites `S:\\` as `S:` and older lists
/// hold doubled backslashes, which once let the same drive repeat 33 times.
pub(crate) fn library_key(path: &str) -> String {
    path.replace("\\\\", "\\")
        .trim_end_matches('\\')
        .to_ascii_lowercase()
}

pub(crate) fn mapped_wine_drive(prefix: &Path, library: &Path) -> Option<String> {
    let devices = prefix.join("dosdevices");
    let target = library.canonicalize().ok()?;
    for letter in b's'..=b'y' {
        let link = devices.join(format!("{}:", letter as char));
        let Ok(existing) = fs::read_link(&link) else {
            continue;
        };
        let existing = if existing.is_absolute() {
            existing
        } else {
            devices.join(existing)
        };
        if existing.canonicalize().ok().as_ref() == Some(&target) {
            return Some(format!("{}:\\", (letter as char).to_ascii_uppercase()));
        }
    }
    None
}

fn wine_drive_path(prefix: &Path, library: &Path) -> Result<String, String> {
    if let Some(existing) = mapped_wine_drive(prefix, library) {
        return Ok(existing);
    }
    let devices = prefix.join("dosdevices");
    fs::create_dir_all(&devices).map_err(|_| "Wine drives could not be created")?;
    let target = library
        .canonicalize()
        .map_err(|_| "Steam library folder is not accessible")?;
    for letter in b's'..=b'y' {
        let link = devices.join(format!("{}:", letter as char));
        if link.symlink_metadata().is_ok() {
            continue;
        }
        std::os::unix::fs::symlink(&target, &link)
            .map_err(|_| "Wine could not map the extra Steam library")?;
        return Ok(format!("{}:\\", (letter as char).to_ascii_uppercase()));
    }
    let unix = target.to_str().ok_or("Steam library path must be UTF-8")?;
    if unix.chars().any(char::is_control) {
        return Err("Invalid Steam library path".into());
    }
    Ok(format!("Z:{}", unix.replace('/', "\\")))
}

fn windows_libraries(prefix: &Path, paths: &[String], create: bool) -> Result<Vec<String>, String> {
    let mut windows = Vec::new();
    for path in paths.iter().take(16) {
        let common = super::steam_library_paths::normalize(Path::new(path))?;
        let library = library_root(&common)?;
        if create {
            windows.push(wine_drive_path(prefix, &library)?);
        } else if let Some(mapped) = mapped_wine_drive(prefix, &library) {
            windows.push(mapped);
        } else {
            return Err("Wine has not mapped the extra Steam library".into());
        }
    }
    Ok(windows)
}

fn vdf_has_paths(content: &str, paths: &[String]) -> bool {
    let Ok(tree) = steam_vdf::parse(content) else {
        return false;
    };
    let mut known = HashSet::new();
    if let [(name, Value::Object(fields))] = tree.as_slice() {
        if name.eq_ignore_ascii_case("libraryfolders") {
            for (_, value) in fields {
                if let Value::Object(entry) = value {
                    for (key, value) in entry {
                        if let ("path", Value::Text(path)) = (key.as_str(), value) {
                            known.insert(path.to_ascii_lowercase());
                        }
                    }
                }
            }
        }
    }
    paths
        .iter()
        .all(|path| known.contains(&path.to_ascii_lowercase()))
}

fn allowed_library_roots(paths: &[String]) -> Vec<PathBuf> {
    paths
        .iter()
        .filter_map(|path| {
            let common = super::steam_library_paths::normalize(Path::new(path)).ok()?;
            library_root(&common).ok()?.canonicalize().ok()
        })
        .collect()
}

fn replace_link(src: &Path, dest: &Path, allowed: &[PathBuf]) -> Result<bool, String> {
    let src = src
        .canonicalize()
        .map_err(|_| "Steam install is not accessible")?;
    if !allowed.iter().any(|root| src.starts_with(root)) {
        return Err("Steam install escapes the extra library folder".into());
    }
    if dest.exists() || dest.symlink_metadata().is_ok() {
        if dest
            .canonicalize()
            .ok()
            .is_some_and(|existing| existing == src)
        {
            return Ok(false);
        }
        if dest
            .symlink_metadata()
            .is_ok_and(|meta| meta.file_type().is_symlink())
        {
            fs::remove_file(dest).map_err(|_| "Steam install link could not be updated")?;
        } else {
            return Ok(false);
        }
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|_| "Steam library directory could not be created")?;
    }
    std::os::unix::fs::symlink(&src, dest)
        .map_err(|_| "Steam could not see the extra library install")?;
    Ok(true)
}

/// Link extra-library manifests and install dirs into the managed steamapps
/// so Wine Steam treats extra-library copies as installed on C:.
pub fn link_installs(steam_root: &Path, paths: &[String]) -> Result<bool, String> {
    let steamapps = steam_root.join("steamapps");
    fs::create_dir_all(steamapps.join("common"))
        .map_err(|_| "Steam library directory could not be created")?;
    let steamapps = steamapps
        .canonicalize()
        .map_err(|_| "Steam library directory is inaccessible")?;
    if !steamapps.starts_with(
        steam_root
            .canonicalize()
            .map_err(|_| "Steam is not installed")?,
    ) {
        return Err("Steam library directory escapes its managed root".into());
    }
    let allowed = allowed_library_roots(paths);
    let mut changed = false;
    for install in super::steam_library_paths::index(paths).by_id.into_values() {
        let Some(name) = install.install_dir.file_name() else {
            continue;
        };
        let dest_dir = steamapps.join("common").join(name);
        changed |= replace_link(&install.install_dir, &dest_dir, &allowed)?;
        let Some(src_apps) = install.install_dir.parent().and_then(Path::parent) else {
            continue;
        };
        let src_acf = src_apps.join(format!("appmanifest_{}.acf", install.app_id));
        let dest_acf = steamapps.join(format!("appmanifest_{}.acf", install.app_id));
        if !src_acf.is_file() {
            continue;
        }
        changed |= replace_link(&src_acf, &dest_acf, &allowed)?;
    }
    Ok(changed)
}

/// True when extra-library manifests already appear in the managed steamapps.
pub fn installs_linked(steam_root: &Path, paths: &[String]) -> bool {
    if paths.is_empty() {
        return true;
    }
    let steamapps = steam_root.join("steamapps");
    let index = super::steam_library_paths::index(paths);
    if index.by_id.is_empty() {
        return true;
    }
    index.by_id.values().all(|install| {
        let Some(name) = install.install_dir.file_name() else {
            return false;
        };
        steamapps.join("common").join(name).exists()
            && steamapps
                .join(format!("appmanifest_{}.acf", install.app_id))
                .exists()
    })
}

/// True when Wine Steam already has the extra libraries on disk and in VDF.
pub fn published(steam_root: &Path, prefix: &Path, paths: &[String]) -> bool {
    if !installs_linked(steam_root, paths) {
        return false;
    }
    let Ok(windows) = windows_libraries(prefix, paths, false) else {
        return false;
    };
    let config = read_vdf(&steam_root.join("config/libraryfolders.vdf"), steam_root)
        .ok()
        .flatten();
    let apps = read_vdf(&steam_root.join("steamapps/libraryfolders.vdf"), steam_root)
        .ok()
        .flatten();
    [config, apps]
        .into_iter()
        .flatten()
        .any(|content| vdf_has_paths(&content, &windows))
}

/// Call while the managed client is stopped so it cannot overwrite registration.
pub fn register(steam_root: &Path, prefix: &Path, paths: &[String]) -> Result<(), String> {
    let root = steam_root
        .canonicalize()
        .map_err(|_| "Steam is not installed")?;
    let windows_paths = windows_libraries(prefix, paths, true)?;
    let steamapps = root.join("steamapps");
    fs::create_dir_all(&steamapps).map_err(|_| "Steam library directory could not be created")?;
    if !steamapps
        .canonicalize()
        .map_err(|_| "Steam library directory is inaccessible")?
        .starts_with(&root)
    {
        return Err("Steam library directory escapes its managed root".into());
    }
    let steamapps_vdf = steamapps.join("libraryfolders.vdf");
    let config_vdf = root.join("config/libraryfolders.vdf");
    let content = read_vdf(&config_vdf, &root)?
        .or(read_vdf(&steamapps_vdf, &root)?)
        .unwrap_or_else(|| EMPTY_FOLDERS.into());
    let updated = merge(&content, &windows_paths)?;
    write_vdf(&steamapps_vdf, &updated)?;
    write_vdf(&config_vdf, &updated)
}

/// The library list with `drive`'s entry carrying `contentid`, or None when
/// it already does (or the drive is not listed).
pub fn with_contentid(content: &str, drive: &str, contentid: u64) -> Option<String> {
    let mut tree = steam_vdf::parse(content).ok()?;
    let [(_, Value::Object(fields))] = tree.as_mut_slice() else {
        return None;
    };
    let wanted = library_key(drive);
    let id = contentid.to_string();
    let mut changed = false;
    for (_, value) in fields.iter_mut() {
        let Value::Object(entry) = value else {
            continue;
        };
        let listed = entry.iter().any(|(key, value)| {
            key == "path" && matches!(value, Value::Text(path) if library_key(path) == wanted)
        });
        if !listed {
            continue;
        }
        match entry.iter_mut().find(|(key, _)| key == "contentid") {
            Some((_, Value::Text(existing))) if *existing == id => {}
            Some((_, slot)) => {
                *slot = Value::Text(id.clone());
                changed = true;
            }
            None => {
                entry.push(("contentid".into(), Value::Text(id.clone())));
                changed = true;
            }
        }
    }
    changed.then(|| steam_vdf::write(&tree))
}

/// Gives the picked library's entry the id in its own `libraryfolder.vdf`.
/// Steam reports a library whose ids differ as "not mounted" and ignores it;
/// several game containers share one library, so the folder's id wins.
/// Call while the client is stopped.
pub fn set_library_contentid(
    steam_root: &Path,
    prefix: &Path,
    library: &Path,
    contentid: u64,
) -> Result<(), String> {
    let drive =
        mapped_wine_drive(prefix, library).ok_or("Wine has not mapped the Steam library")?;
    let root = steam_root
        .canonicalize()
        .map_err(|_| "Steam is not installed")?;
    for path in [
        root.join("steamapps/libraryfolders.vdf"),
        root.join("config/libraryfolders.vdf"),
    ] {
        if let Some(content) = read_vdf(&path, &root)? {
            if let Some(updated) = with_contentid(&content, &drive, contentid) {
                write_vdf(&path, &updated)?;
            }
        }
    }
    Ok(())
}

/// Link extra installs into the prefix steamapps and register them with Steam.
/// Returns true when anything changed so callers can restart a running client.
pub fn publish(steam_root: &Path, prefix: &Path, paths: &[String]) -> Result<bool, String> {
    if paths.is_empty() {
        return Ok(false);
    }
    if published(steam_root, prefix, paths) {
        return Ok(false);
    }
    let linked = link_installs(steam_root, paths)?;
    register(steam_root, prefix, paths)?;
    Ok(linked || true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn extra_library(root: &Path, app_id: &str, folder: &str, exe: &str) -> String {
        let apps = root.join("steamapps");
        fs::create_dir_all(apps.join("common").join(folder)).unwrap();
        fs::write(apps.join("common").join(folder).join(exe), b"MZ").unwrap();
        fs::write(
            apps.join(format!("appmanifest_{app_id}.acf")),
            format!(
                r#""appid" "{app_id}" "name" "{folder}" "installdir" "{folder}" "SizeOnDisk" "12""#
            ),
        )
        .unwrap();
        apps.join("common").to_string_lossy().into_owned()
    }

    #[test]
    fn a_library_entry_takes_the_folders_id() {
        // Regression: Steam listed S: with its own id while the folder had
        // none, logged "Install folder S: not mounted" and never downloaded.
        let content = "\"libraryfolders\"\n{\n\t\"0\"\n\t{\n\t\t\"path\"\t\t\"C:\\\\Program Files (x86)\\\\Steam\"\n\t\t\"contentid\"\t\t\"1\"\n\t}\n\t\"1\"\n\t{\n\t\t\"path\"\t\t\"S:\"\n\t\t\"contentid\"\t\t\"9133512604164204669\"\n\t}\n}\n";
        let updated = with_contentid(content, "S:\\", 42).expect("changed");
        assert!(updated.contains("\"42\""));
        assert!(!updated.contains("9133512604164204669"));
        assert!(updated.contains("\"1\""), "the main library keeps its id");
        assert_eq!(with_contentid(&updated, "S:", 42), None);
        assert_eq!(with_contentid(&updated, "T:\\", 42), None);
    }

    #[test]
    fn registration_preserves_other_libraries_and_is_idempotent() {
        let text = r#""libraryfolders" { "0" { "path" "C:\\Steam" "contentid" "keep" } }"#;
        let paths = vec![r"S:\".to_string()];
        let once = merge(text, &paths).unwrap();
        let twice = merge(&once, &paths).unwrap();
        assert_eq!(once, twice);
        assert!(once.contains("contentid"));
        assert!(once.contains("keep"));
        assert_eq!(once.matches("S:\\\\").count(), 1);
        assert!(merge("broken", &paths).is_err());
        assert!(vdf_has_paths(&once, &paths));
    }

    #[test]
    fn an_existing_library_list_past_thirty_two_still_registers() {
        let mut text = String::from("\"libraryfolders\" {\n");
        for index in 0..40 {
            text.push_str(&format!(
                "\"{index}\" {{ \"path\" \"C:\\\\Lib{index}\" }}\n"
            ));
        }
        text.push('}');
        let paths = vec![r"S:\".to_string()];
        let updated = merge(&text, &paths).unwrap();
        assert!(updated.contains("S:\\\\"));
        assert!(updated.contains("C:\\\\Lib39"));
    }

    #[test]
    fn publish_links_god_of_war_into_the_managed_steamapps() {
        let root = std::env::temp_dir().join(format!("orbit-steam-lib-{}", uuid::Uuid::new_v4()));
        let prefix = root.join("prefix");
        let steam = prefix.join("drive_c/Program Files (x86)/Steam");
        let extra = root.join("ExtraLibrary");
        fs::create_dir_all(steam.join("steamapps")).unwrap();
        fs::create_dir_all(prefix.join("dosdevices")).unwrap();
        let common = extra_library(&extra, "1593500", "GodOfWar", "GoW.exe");
        assert!(publish(&steam, &prefix, &[common.clone()]).unwrap());
        assert!(!publish(&steam, &prefix, &[common]).unwrap());
        let dest = steam.join("steamapps/common/GodOfWar");
        assert!(dest.is_dir());
        assert!(steam.join("steamapps/appmanifest_1593500.acf").is_file());
        assert_eq!(
            dest.canonicalize().unwrap(),
            extra
                .join("steamapps/common/GodOfWar")
                .canonicalize()
                .unwrap()
        );
        let folders = fs::read_to_string(steam.join("steamapps/libraryfolders.vdf")).unwrap();
        let config = fs::read_to_string(steam.join("config/libraryfolders.vdf")).unwrap();
        assert_eq!(folders, config);
        assert!(folders.contains("S:\\\\"));
        assert_eq!(
            fs::read_link(prefix.join("dosdevices/s:")).unwrap(),
            extra.canonicalize().unwrap()
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn link_installs_does_not_replace_a_real_orbit_download() {
        let root = std::env::temp_dir().join(format!("orbit-steam-keep-{}", uuid::Uuid::new_v4()));
        let steam = root.join("Steam");
        let extra = root.join("ExtraLibrary");
        fs::create_dir_all(steam.join("steamapps/common/GodOfWar")).unwrap();
        fs::write(steam.join("steamapps/common/GodOfWar/GoW.exe"), b"ORBIT").unwrap();
        let common = extra_library(&extra, "1593500", "GodOfWar", "GoW.exe");
        link_installs(&steam, &[common]).unwrap();
        assert_eq!(
            fs::read(steam.join("steamapps/common/GodOfWar/GoW.exe")).unwrap(),
            b"ORBIT"
        );
        let _ = fs::remove_dir_all(root);
    }
}
