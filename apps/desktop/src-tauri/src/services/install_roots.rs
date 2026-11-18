//! The real folder behind each installed game, and how much disk it takes.
//! Installations store the file Orbit launches; sizes are measured from the
//! game's own folder (Steam `common/<game>`, an Orbit container `install/`,
//! a `.app` bundle), following a symlinked folder to where the files live.
use std::collections::HashMap;
use std::os::unix::fs::MetadataExt;
use std::path::{Component, Path, PathBuf};

use parking_lot::Mutex;
use serde::Serialize;

use crate::services::library::LibraryEntry;

/// Walk budget for one game folder.
const MEASURE_LIMIT: usize = 1_500_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallSize {
    pub installation_id: String,
    /// The game folder the size was measured from, symlinks resolved.
    pub root: String,
    pub size_bytes: u64,
    /// True when the walk hit its budget, so the size is a lower bound.
    pub truncated: bool,
}

/// Game folder for one launch path, found from the path alone (no I/O).
/// Falls back to the launch file's folder unless that folder is a broad
/// location such as the home folder or Downloads, then to the file itself.
pub fn lexical_root(path: &Path) -> Option<PathBuf> {
    if !path.is_absolute()
        || path
            .components()
            .any(|part| matches!(part, Component::ParentDir))
    {
        return None;
    }
    let name = |p: &Path| p.file_name().and_then(|n| n.to_str()).map(str::to_owned);
    let mut bundle = None;
    for ancestor in path.ancestors() {
        let parent = ancestor.parent();
        let grand = parent.and_then(Path::parent);
        let (own, up, top) = (
            name(ancestor).unwrap_or_default(),
            parent.and_then(name).unwrap_or_default(),
            grand.and_then(name).unwrap_or_default(),
        );
        if up == "common" && top.eq_ignore_ascii_case("steamapps") {
            return Some(ancestor.to_path_buf());
        }
        if own == "install" && up.starts_with("steam-") && top == "games" {
            return Some(ancestor.to_path_buf());
        }
        if up == "games"
            && top == "steam-windows"
            && !own.is_empty()
            && own.chars().all(|c| c.is_ascii_digit())
        {
            return Some(ancestor.to_path_buf());
        }
        if own.ends_with(".app") {
            bundle = Some(ancestor.to_path_buf());
        }
    }
    if bundle.is_some() {
        return bundle;
    }
    let folder = path.parent()?;
    Some(if is_broad(folder) {
        path.to_path_buf()
    } else {
        folder.to_path_buf()
    })
}

/// Folders that hold many unrelated things, so a loose game file's size is
/// never measured as the whole folder.
fn is_broad(folder: &Path) -> bool {
    let depth = folder.components().count();
    if depth <= 3 {
        return true; // `/`, `/Users/me`, `/Volumes/Drive`, `/Applications`
    }
    let leaf = folder
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default();
    matches!(
        leaf,
        "Downloads" | "Desktop" | "Documents" | "Applications" | "Games" | "bin"
    ) && depth <= 5
}

/// Allocated bytes under `root`, not following symlinks below it, skipping
/// `excluded` folders. O(f) over files walked, capped by `budget`.
pub fn disk_usage(root: &Path, excluded: &[PathBuf], budget: &mut usize) -> u64 {
    let mut total = 0u64;
    let walk = walkdir::WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| !excluded.iter().any(|skip| skip == entry.path()));
    for entry in walk {
        if *budget == 0 {
            break;
        }
        *budget -= 1;
        let Ok(entry) = entry else {
            continue;
        };
        if let Ok(meta) = entry.metadata() {
            if !meta.is_dir() {
                total = total.saturating_add(meta.blocks().saturating_mul(512));
            }
        }
    }
    total
}

#[derive(Debug, Clone)]
struct Measured {
    root: PathBuf,
    bytes: u64,
    truncated: bool,
}

/// Measurements by lexical root. Cleared when installs change or on Rescan.
static CACHE: Mutex<Option<HashMap<PathBuf, Measured>>> = Mutex::new(None);

pub fn forget_measurements() {
    *CACHE.lock() = None;
}

/// Measures one game folder, reusing a cached result. The folder is resolved
/// to its real location first, so a linked library is counted where it lives.
fn measure(lexical: &Path) -> Option<Measured> {
    if let Some(found) = CACHE.lock().as_ref().and_then(|map| map.get(lexical)) {
        return Some(found.clone());
    }
    let root = lexical.canonicalize().ok()?;
    let mut budget = MEASURE_LIMIT;
    let bytes = if root.is_dir() {
        disk_usage(&root, &[], &mut budget)
    } else {
        std::fs::metadata(&root).ok()?.blocks().saturating_mul(512)
    };
    let measured = Measured {
        root,
        bytes,
        truncated: budget == 0,
    };
    CACHE
        .lock()
        .get_or_insert_with(HashMap::new)
        .insert(lexical.to_path_buf(), measured.clone());
    Some(measured)
}

/// Measures every available installation of one entry. O(i · f).
pub fn measure_entry(entry: &LibraryEntry) -> Vec<InstallSize> {
    entry
        .installations
        .iter()
        .filter(|install| install.available)
        .filter_map(|install| {
            let root = lexical_root(Path::new(install.path.as_deref()?))?;
            let measured = measure(&root)?;
            Some(InstallSize {
                installation_id: install.id.clone(),
                root: measured.root.to_string_lossy().into_owned(),
                size_bytes: measured.bytes,
                truncated: measured.truncated,
            })
        })
        .collect()
}

/// Fills installation sizes from measurements already taken. Lexical root
/// lookups only, no disk access. O(n · i).
pub fn apply_measured(entries: &mut [LibraryEntry]) {
    let cache = CACHE.lock();
    let Some(map) = cache.as_ref() else {
        return;
    };
    for install in entries
        .iter_mut()
        .flat_map(|entry| &mut entry.installations)
    {
        let Some(root) = install
            .path
            .as_deref()
            .and_then(|path| lexical_root(Path::new(path)))
        else {
            continue;
        };
        if let Some(measured) = map.get(&root) {
            install.size_bytes = Some(i64::try_from(measured.bytes).unwrap_or(i64::MAX));
        }
    }
}

/// A distinct installed game folder for the Storage screen.
#[derive(Debug, Clone)]
pub struct GameRoot {
    pub entry_id: String,
    pub title: String,
    pub steam_app_id: Option<String>,
    pub cover: Option<String>,
    pub root: PathBuf,
    pub bytes: u64,
    /// Orbit may uninstall it: an Orbit download or a Windows game in a Steam library.
    pub removable: bool,
}

/// One measured folder per installed game, deduplicated by real location so
/// two library rows pointing at the same files count once. O(n · f).
pub fn game_roots(entries: &[LibraryEntry]) -> Vec<GameRoot> {
    let mut seen = std::collections::HashSet::new();
    let mut roots = Vec::new();
    for entry in entries {
        for install in entry.installations.iter().filter(|item| item.available) {
            let Some(path) = install.path.as_deref() else {
                continue;
            };
            let Some(lexical) = lexical_root(Path::new(path)) else {
                continue;
            };
            let Some(measured) = measure(&lexical) else {
                continue;
            };
            if !seen.insert(measured.root.clone()) {
                continue;
            }
            roots.push(GameRoot {
                entry_id: entry.id.clone(),
                title: entry.game.title.clone(),
                steam_app_id: entry.steam_app_id.clone(),
                cover: entry
                    .game
                    .artwork
                    .cover
                    .clone()
                    .filter(|url| url.starts_with("https://")),
                removable: install.launch_type == "wine"
                    && crate::services::library::is_uninstallable(Some(path)),
                root: measured.root,
                bytes: measured.bytes,
            });
        }
    }
    roots
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn root(path: &str) -> Option<String> {
        lexical_root(Path::new(path)).map(|p| p.to_string_lossy().into_owned())
    }

    #[test]
    fn finds_the_game_folder_behind_the_launch_file() {
        assert_eq!(
            root("/Volumes/Games/SteamLibrary/steamapps/common/ELDEN RING/Game/eldenring.exe")
                .as_deref(),
            Some("/Volumes/Games/SteamLibrary/steamapps/common/ELDEN RING")
        );
        assert_eq!(
            root("/Orbit/runtimes/containers/games/steam-570/install/game/bin/win64/dota2.exe")
                .as_deref(),
            Some("/Orbit/runtimes/containers/games/steam-570/install")
        );
        assert_eq!(
            root("/Orbit/steam-windows/games/730/cs2.exe").as_deref(),
            Some("/Orbit/steam-windows/games/730")
        );
        assert_eq!(
            root("/Applications/Baldur's Gate 3.app/Contents/MacOS/Baldur's Gate 3").as_deref(),
            Some("/Applications/Baldur's Gate 3.app")
        );
        assert_eq!(
            root("/Users/me/Games/Celeste/Celeste.exe").as_deref(),
            Some("/Users/me/Games/Celeste")
        );
    }

    #[test]
    fn never_measures_a_broad_folder_for_a_loose_file() {
        assert_eq!(
            root("/Users/me/Downloads/setup.exe").as_deref(),
            Some("/Users/me/Downloads/setup.exe")
        );
        assert_eq!(
            root("/Users/me/game.exe").as_deref(),
            Some("/Users/me/game.exe")
        );
        assert!(root("relative/game.exe").is_none());
        assert!(root("/Users/me/../other/game.exe").is_none());
    }

    #[test]
    fn measures_through_a_linked_library_and_skips_excluded_folders() {
        let base = std::env::temp_dir().join(format!("orbit-roots-{}", uuid::Uuid::new_v4()));
        let shared = base.join("shared/steamapps/common/Game");
        fs::create_dir_all(shared.join("data")).unwrap();
        fs::write(shared.join("game.exe"), vec![1u8; 8_192]).unwrap();
        fs::write(shared.join("data/pak.bin"), vec![1u8; 8_192]).unwrap();
        let library = base.join("lib/steamapps/common");
        fs::create_dir_all(&library).unwrap();
        std::os::unix::fs::symlink(&shared, library.join("Game")).unwrap();

        let lexical = lexical_root(&library.join("Game/game.exe")).unwrap();
        let measured = measure(&lexical).unwrap();
        assert_eq!(measured.root, shared.canonicalize().unwrap());
        assert!(measured.bytes >= 16_384);

        let mut budget = 100;
        let skipped = disk_usage(&measured.root, &[measured.root.join("data")], &mut budget);
        assert!(skipped < measured.bytes);
        let _ = fs::remove_dir_all(base);
    }
}
