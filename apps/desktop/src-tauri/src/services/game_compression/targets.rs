//! Which folders compression may touch: installed Steam games, in a
//! `steamapps/common` library or an Orbit container's `install/`. Never
//! `steam-windows`, Orbit's data, or a folder a non-Steam game points at.
use std::collections::HashSet;
use std::path::{Path, PathBuf};

use crate::services::library::LibraryEntry;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Target {
    pub app_id: Option<String>,
    /// Library game ids of this install, to match a running session.
    pub game_ids: Vec<String>,
    pub title: String,
    pub root: PathBuf,
}

/// The game folder for a launch path when compression may touch it.
pub fn root_for(path: &str) -> Option<PathBuf> {
    if !crate::services::library::is_uninstallable(Some(path)) {
        return None;
    }
    let root = crate::services::install_roots::lexical_root(Path::new(path))?;
    let named = root
        .parent()
        .and_then(Path::file_name)
        .and_then(|name| name.to_str())
        .is_some_and(|name| name == "common" || name.starts_with("steam-"));
    named.then_some(root)
}

/// One target per installed game folder, deduplicated by real path. O(e · i).
pub fn all(entries: &[LibraryEntry]) -> Vec<Target> {
    let mut seen = HashSet::new();
    let mut found = Vec::new();
    for entry in entries {
        for install in entry.installations.iter().filter(|item| item.available) {
            let Some(root) = install.path.as_deref().and_then(root_for) else {
                continue;
            };
            let Ok(real) = root.canonicalize() else {
                continue;
            };
            if !seen.insert(real.clone()) {
                continue;
            }
            found.push(Target {
                app_id: entry.steam_app_id.clone(),
                game_ids: vec![entry.id.clone(), install.game_id.clone()],
                title: entry.game.title.clone(),
                root: real,
            });
        }
    }
    found
}

/// The installed folders of one Steam title.
pub fn for_app(entries: &[LibraryEntry], app_id: &str) -> Vec<PathBuf> {
    all(entries)
        .into_iter()
        .filter(|target| target.app_id.as_deref() == Some(app_id))
        .map(|target| target.root)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_steam_game_folders_are_targets() {
        assert_eq!(
            root_for("/Users/me/Orbit/Orbit Games/steamapps/common/God of War Ragnarök/GoWR.exe"),
            Some(PathBuf::from(
                "/Users/me/Orbit/Orbit Games/steamapps/common/God of War Ragnarök"
            ))
        );
        assert_eq!(
            root_for("/Users/me/Library/Application Support/Steam/steamapps/common/Game/Game.app/Contents/MacOS/Game"),
            Some(PathBuf::from("/Users/me/Library/Application Support/Steam/steamapps/common/Game"))
        );
        assert_eq!(
            root_for("/Users/me/Library/Application Support/Orbit/steam-windows/prefix/drive_c/Program Files (x86)/Steam/steamapps/common/Game/game.exe"),
            None,
            "steam-windows is never touched"
        );
        assert_eq!(
            root_for("/Applications/Some Game.app/Contents/MacOS/game"),
            None
        );
        assert_eq!(root_for("/Users/me/Games/game.exe"), None);
    }
}
