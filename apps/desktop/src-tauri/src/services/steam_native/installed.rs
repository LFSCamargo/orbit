//! Installed Windows games from disk. steam.exe is not required.
//! One pass over library folders, per-game containers, and legacy copies.
//! O(libraries × manifests) with the existing 16-folder and 2,000-entry caps,
//! plus one bounded directory read for container and legacy installs.
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
};

use crate::services::steam_download::{find_game_executable, valid_app_id};
use crate::services::steam_library_paths;

const DIR_CAP: usize = 2_000;

pub fn library_paths(
    home: Option<&Path>,
    steam_root: Option<&Path>,
    extra: &[String],
) -> Vec<String> {
    let mut paths = Vec::new();
    for path in extra.iter().take(16) {
        push_library(&mut paths, Path::new(path));
        if paths.len() >= 16 {
            return paths;
        }
    }
    if let Some(root) = steam_root {
        for folder in folders_from_steam_root(root) {
            if paths.len() >= 16 {
                return paths;
            }
            if !paths.contains(&folder) {
                paths.push(folder);
            }
        }
    }
    if let Some(home) = home {
        for steamapps in gamehub_steamapps(home) {
            if paths.len() >= 16 {
                break;
            }
            push_library(&mut paths, &steamapps.join("common"));
        }
    }
    paths
}

fn gamehub_steamapps(home: &Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let shared = home.join("GameHub/steamapps");
    if shared.join("common").is_dir() {
        dirs.push(shared);
    }
    let containers = home.join(
        "Library/Application Support/com.gamemac.www/wine-engine/containers/virtual_containers",
    );
    let Ok(entries) = fs::read_dir(&containers) else {
        return dirs;
    };
    for entry in entries.flatten().take(32) {
        if dirs.len() >= 16 {
            break;
        }
        let steamapps = entry
            .path()
            .join("drive_c/Program Files (x86)/Steam/steamapps");
        if steamapps.join("common").is_dir() {
            dirs.push(steamapps);
        }
    }
    dirs
}

pub fn executable_in_libraries(
    app_id: &str,
    library_paths: &[String],
    orbit_dirs: &[PathBuf],
) -> Option<PathBuf> {
    for dir in orbit_dirs {
        if let Some(exe) = find_game_executable(dir) {
            return Some(exe);
        }
    }
    steam_library_paths::index(library_paths)
        .by_id
        .get(app_id)
        .and_then(|install| find_game_executable(&install.install_dir))
}

/// The game's folder in a library, named by a manifest kept elsewhere (the
/// game container's own Steam). Used when the library lost its manifest.
pub fn executable_from_manifest(
    app_id: &str,
    library_paths: &[String],
    manifest: &Path,
) -> Option<PathBuf> {
    let installdir = crate::services::steam_manifest::installdir_in(manifest, app_id)?;
    library_paths.iter().find_map(|common| {
        let dir = Path::new(common).join(&installdir);
        dir.is_dir().then(|| find_game_executable(&dir)).flatten()
    })
}

const APPINFO_LIMIT: u64 = 128 * 1024 * 1024;

/// Install folder names Steam's client cached for these apps
/// (`appcache/appinfo.vdf`), for libraries that lost an app's manifest.
pub fn install_dirs(steam_root: &Path, app_ids: &[String]) -> HashMap<String, String> {
    let wanted: HashSet<u32> = app_ids.iter().filter_map(|id| id.parse().ok()).collect();
    let path = steam_root.join("appcache/appinfo.vdf");
    let readable = path
        .symlink_metadata()
        .is_ok_and(|meta| meta.is_file() && meta.len() <= APPINFO_LIMIT);
    if wanted.is_empty() || !readable {
        return HashMap::new();
    }
    let Ok(bytes) = fs::read(&path) else {
        return HashMap::new();
    };
    orbit_steam::appinfo::install_dirs(&bytes, &wanted)
        .into_iter()
        .map(|(id, dir)| (id.to_string(), dir))
        .collect()
}

/// The game folder named `installdir` in one of the libraries, with a game
/// executable in it. Exact name first, then ignoring case and repeated spaces
/// (Steam names RE2's folder with two spaces; copies often have one).
pub fn executable_by_installdir(installdir: &str, library_paths: &[String]) -> Option<PathBuf> {
    find_game_executable(&folder_by_installdir(installdir, library_paths)?)
}

/// The library folder named `installdir` that holds a game executable.
pub fn folder_by_installdir(installdir: &str, library_paths: &[String]) -> Option<PathBuf> {
    let single_component = Path::new(installdir).components().count() == 1
        && !installdir.contains(['/', '\\'])
        && !matches!(installdir, "" | "." | "..");
    if !single_component {
        return None;
    }
    let wanted = folded(installdir);
    library_paths.iter().take(16).find_map(|common| {
        let common = Path::new(common);
        let exact = common.join(installdir);
        if exact.is_dir() && find_game_executable(&exact).is_some() {
            return Some(exact);
        }
        fs::read_dir(common)
            .ok()?
            .flatten()
            .take(DIR_CAP)
            .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
            .filter(|entry| {
                entry
                    .file_name()
                    .to_str()
                    .is_some_and(|name| folded(name) == wanted)
            })
            .map(|entry| entry.path())
            .find(|dir| find_game_executable(dir).is_some())
    })
}

fn folded(name: &str) -> String {
    name.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

pub fn folders_from_steam_root(root: &Path) -> Vec<String> {
    let mut paths = Vec::new();
    push_library(&mut paths, &root.join("steamapps/common"));
    let vdf = root.join("steamapps/libraryfolders.vdf");
    let Ok(text) = fs::read_to_string(&vdf) else {
        return paths;
    };
    if text.len() > 1024 * 1024 {
        return paths;
    }
    for path in library_folder_paths(&text).into_iter().take(16) {
        push_library(&mut paths, &path);
    }
    paths
}

pub fn discover(
    library_paths: &[String],
    container_games: &Path,
    legacy_games: &Path,
) -> HashSet<String> {
    let mut ids = HashSet::new();
    for install in steam_library_paths::discover(library_paths) {
        ids.insert(install.app_id);
    }
    collect_named_installs(container_games, true, &mut ids);
    collect_named_installs(legacy_games, false, &mut ids);
    ids
}

fn push_library(paths: &mut Vec<String>, candidate: &Path) {
    let Ok(common) = steam_library_paths::normalize(candidate) else {
        return;
    };
    let value = common.to_string_lossy().into_owned();
    if !paths.contains(&value) {
        paths.push(value);
    }
}

fn library_folder_paths(content: &str) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let mut rest = content;
    while let Some(start) = rest.find("\"path\"") {
        rest = &rest[start + "\"path\"".len()..];
        let Some(open) = rest.find('"') else {
            break;
        };
        rest = &rest[open + 1..];
        let Some(close) = rest.find('"') else {
            break;
        };
        let path = rest[..close].replace("\\\\", "\\");
        if !path.is_empty() && path.len() <= 4096 && !path.contains('\0') {
            paths.push(PathBuf::from(path));
        }
        rest = &rest[close + 1..];
        if paths.len() >= 16 {
            break;
        }
    }
    paths
}

fn collect_named_installs(parent: &Path, container: bool, ids: &mut HashSet<String>) {
    let Ok(entries) = fs::read_dir(parent) else {
        return;
    };
    for entry in entries.take(DIR_CAP).flatten() {
        if !entry.file_type().is_ok_and(|kind| kind.is_dir()) {
            continue;
        }
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        let id = if container {
            name.strip_prefix("steam-").unwrap_or("")
        } else {
            name
        };
        if !valid_app_id(id) {
            continue;
        }
        let dir = if container {
            entry.path().join("install")
        } else {
            entry.path()
        };
        if installed_tree(&dir, id) {
            ids.insert(id.to_string());
        }
    }
}

fn installed_tree(dir: &Path, app_id: &str) -> bool {
    dir.join(format!("steamapps/appmanifest_{app_id}.acf"))
        .is_file()
        || dir.join(format!("appmanifest_{app_id}.acf")).is_file()
        || find_game_executable(dir).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discovers_library_container_and_legacy_installs_without_steam_exe() {
        let root = std::env::temp_dir().join(format!("orbit-installed-{}", uuid::Uuid::new_v4()));
        let library = root.join("library/steamapps");
        fs::create_dir_all(library.join("common/Demo")).unwrap();
        fs::write(library.join("common/Demo/Game.exe"), b"MZ").unwrap();
        fs::write(
            library.join("appmanifest_10.acf"),
            r#""appid" "10" "name" "Demo" "installdir" "Demo""#,
        )
        .unwrap();
        let container = root.join("containers/games/steam-20/install");
        fs::create_dir_all(&container).unwrap();
        fs::write(container.join("Title.exe"), b"MZ").unwrap();
        let legacy = root.join("steam-windows/games/30");
        fs::create_dir_all(&legacy).unwrap();
        fs::write(legacy.join("Old.exe"), b"MZ").unwrap();
        fs::create_dir_all(root.join("containers/games/steam-20/prefix")).unwrap();
        assert!(!root.join("steam.exe").exists());

        let ids = discover(
            &[library.join("common").to_string_lossy().into_owned()],
            &root.join("containers/games"),
            &root.join("steam-windows/games"),
        );
        assert!(ids.contains("10"));
        assert!(ids.contains("20"));
        assert!(ids.contains("30"));
        assert!(!ids.contains("steam"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn reads_extra_library_folders_from_a_steam_root() {
        let root = std::env::temp_dir().join(format!("orbit-steam-root-{}", uuid::Uuid::new_v4()));
        let extra = root.join("Extra");
        fs::create_dir_all(extra.join("steamapps/common/Game")).unwrap();
        fs::write(extra.join("steamapps/common/Game/Game.exe"), b"MZ").unwrap();
        fs::create_dir_all(root.join("Steam/steamapps")).unwrap();
        fs::write(
            root.join("Steam/steamapps/libraryfolders.vdf"),
            format!(
                "\"libraryfolders\" {{ \"1\" {{ \"path\" \"{}\" }} }}",
                extra.display()
            ),
        )
        .unwrap();
        let folders = folders_from_steam_root(&root.join("Steam"));
        assert_eq!(folders.len(), 1);
        assert!(folders[0].ends_with("steamapps/common"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn play_finds_a_gamehub_install_without_an_orbit_download() {
        let home =
            std::env::temp_dir().join(format!("orbit-gamehub-home-{}", uuid::Uuid::new_v4()));
        let common = home.join("GameHub/steamapps/common/Demo");
        fs::create_dir_all(&common).unwrap();
        fs::write(common.join("Game.exe"), b"MZ").unwrap();
        fs::write(
            home.join("GameHub/steamapps/appmanifest_10.acf"),
            r#""appid" "10" "name" "Demo" "installdir" "Demo""#,
        )
        .unwrap();
        let container = home.join(
            "Library/Application Support/com.gamemac.www/wine-engine/containers/virtual_containers/2/drive_c/Program Files (x86)/Steam/steamapps",
        );
        fs::create_dir_all(container.join("common/Other")).unwrap();
        fs::write(container.join("common/Other/Other.exe"), b"MZ").unwrap();
        fs::write(
            container.join("appmanifest_20.acf"),
            r#""appid" "20" "name" "Other" "installdir" "Other""#,
        )
        .unwrap();
        let paths = library_paths(Some(&home), None, &[]);
        assert_eq!(
            executable_in_libraries("10", &paths, &[])
                .unwrap()
                .file_name()
                .unwrap(),
            "Game.exe"
        );
        assert_eq!(
            executable_in_libraries("20", &paths, &[])
                .unwrap()
                .file_name()
                .unwrap(),
            "Other.exe"
        );
        assert!(executable_in_libraries("11", &paths, &[]).is_none());
        let _ = fs::remove_dir_all(home);
    }

    #[test]
    fn a_containers_manifest_finds_a_library_game_whose_manifest_is_gone() {
        let root = std::env::temp_dir().join(format!("orbit-cm-{}", uuid::Uuid::new_v4()));
        let common = root.join("Library/steamapps/common");
        let game = common.join("RESIDENT EVIL 2 BIOHAZARD RE2");
        fs::create_dir_all(&game).unwrap();
        fs::write(game.join("re2.exe"), b"MZ").unwrap();
        let manifest = root.join("container/appmanifest_883710.acf");
        fs::create_dir_all(manifest.parent().unwrap()).unwrap();
        fs::write(
            &manifest,
            "\"AppState\"\n{\n\t\"appid\"\t\t\"883710\"\n\t\"name\"\t\t\"Resident Evil 2\"\n\t\"installdir\"\t\t\"RESIDENT EVIL 2 BIOHAZARD RE2\"\n}\n",
        )
        .unwrap();
        let libraries = vec![common.to_string_lossy().into_owned()];
        assert_eq!(
            executable_from_manifest("883710", &libraries, &manifest),
            Some(game.join("re2.exe"))
        );
        // A manifest for another app, or a missing one, finds nothing.
        assert_eq!(
            executable_from_manifest("1593500", &libraries, &manifest),
            None
        );
        assert_eq!(
            executable_from_manifest("883710", &libraries, &root.join("missing.acf")),
            None
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_library_install_without_a_manifest_is_found_by_its_folder() {
        // Regression: God of War sat in ~/GameHub/steamapps/common/GodOfWar
        // without appmanifest_1593500.acf and never showed as installed.
        let root = std::env::temp_dir().join(format!("orbit-installdir-{}", uuid::Uuid::new_v4()));
        let common = root.join("steamapps/common");
        for (dir, exe) in [
            ("GodOfWar", "GoW.exe"),
            ("RESIDENT EVIL 2 BIOHAZARD RE2", "re2.exe"),
        ] {
            fs::create_dir_all(common.join(dir)).unwrap();
            fs::write(common.join(dir).join(exe), vec![0u8; 2 * 1024 * 1024]).unwrap();
        }
        let libraries = vec![common.to_string_lossy().into_owned()];
        assert!(executable_by_installdir("GodOfWar", &libraries)
            .is_some_and(|exe| exe.ends_with("GodOfWar/GoW.exe")));
        assert!(
            executable_by_installdir("RESIDENT EVIL 2  BIOHAZARD RE2", &libraries)
                .is_some_and(|exe| exe.ends_with("re2.exe"))
        );
        assert!(executable_by_installdir("Missing", &libraries).is_none());
        for unsafe_name in ["..", "../GodOfWar", "a/b", ""] {
            assert!(executable_by_installdir(unsafe_name, &libraries).is_none());
        }
        let _ = fs::remove_dir_all(root);
    }
}
