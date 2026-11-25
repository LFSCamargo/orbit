//! Where Orbit installs each Steam game. "This Mac" is the game container's
//! own Steam library. Any other location is a folder the person picked, often
//! on an external drive: Orbit keeps games in its `Orbit Games` subfolder
//! there, which the game's container mounts as a Wine drive and registers as
//! a Steam library, so Steam checks free space and writes on that volume.
//! A subfolder keeps a Mac Steam library the person picked untouched.
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::database::GameRepository;
use crate::services::steam_download::valid_app_id;

pub const THIS_MAC: &str = "this-mac";
pub const LIBRARY_FOLDER: &str = "Orbit Games";
const STATE_KEY: &str = "steam-install-locations-v1";
const LOCATION_LIMIT: usize = 8;

/// One place a game can be installed, as the install picker shows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallLocation {
    /// `this-mac`, or the folder's path.
    pub id: String,
    pub label: String,
    pub path: Option<String>,
    /// The folder (its drive) is connected and writable.
    pub available: bool,
    pub free_bytes: Option<u64>,
    pub total_bytes: Option<u64>,
    /// Chosen for the last download.
    pub is_default: bool,
    /// Games installed or downloading there; such a location cannot be removed.
    pub game_count: usize,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Saved {
    /// Folders the person added, canonical, in the order added.
    #[serde(default)]
    pub roots: Vec<String>,
    /// App id → folder for games not on This Mac.
    #[serde(default)]
    pub by_app: HashMap<String, String>,
    /// The location the last download used.
    #[serde(default)]
    pub last: Option<String>,
}

impl Saved {
    /// Keeps only entries that still make sense; a damaged row cannot grow.
    fn sanitized(mut self) -> Self {
        self.roots.truncate(LOCATION_LIMIT);
        let roots = self.roots.clone();
        self.by_app
            .retain(|app_id, root| valid_app_id(app_id) && roots.contains(root));
        if self.last.as_ref().is_some_and(|last| !roots.contains(last)) {
            self.last = None;
        }
        self
    }

    fn game_count(&self, root: &str) -> usize {
        self.by_app.values().filter(|value| *value == root).count()
    }

    /// The folder for a new download: the app's own folder when Steam already
    /// has its files there (a paused or installed copy), else the request,
    /// else the last one used. `None` is This Mac. O(roots).
    pub fn choose(
        &mut self,
        app_id: &str,
        requested: Option<&str>,
        has_files: impl Fn(&Path) -> bool,
    ) -> Result<Option<String>, String> {
        if let Some(current) = self.by_app.get(app_id) {
            if has_files(&library_dir(Path::new(current))) {
                return Ok(Some(current.clone()));
            }
        }
        let wanted = match requested {
            Some(THIS_MAC) => None,
            Some(root) => Some(
                self.roots
                    .iter()
                    .find(|known| known.as_str() == root)
                    .cloned()
                    .ok_or("Choose an install location from the list")?,
            ),
            None => self.last.clone(),
        };
        match &wanted {
            Some(root) => {
                self.by_app.insert(app_id.to_string(), root.clone());
            }
            None => {
                self.by_app.remove(app_id);
            }
        }
        self.last = wanted.clone();
        Ok(wanted)
    }
}

static STATE: Mutex<Option<Saved>> = Mutex::new(None);

/// `<folder>/Orbit Games`, the Steam library inside a picked folder.
pub fn library_dir(root: &Path) -> PathBuf {
    root.join(LIBRARY_FOLDER)
}

/// Loads the saved locations once at startup.
pub fn restore(repo: &GameRepository) {
    let saved = repo
        .get_setting(STATE_KEY)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value::<Saved>(value).ok())
        .unwrap_or_default()
        .sanitized();
    *STATE.lock() = Some(saved);
}

fn with_state<T>(repo: &GameRepository, change: impl FnOnce(&mut Saved) -> T) -> T {
    let mut guard = STATE.lock();
    let saved = guard.get_or_insert_with(Saved::default);
    let before = saved.clone();
    let result = change(saved);
    if *saved != before {
        let _ = repo.set_setting(STATE_KEY, &json!(saved));
    }
    result
}

fn snapshot() -> Saved {
    STATE.lock().clone().unwrap_or_default()
}

/// The Steam library a game lives in when it is not on This Mac.
pub fn library_for_app(app_id: &str) -> Option<PathBuf> {
    let root = snapshot().by_app.get(app_id).cloned()?;
    Some(library_dir(Path::new(&root)))
}

/// Every Orbit library in picked folders, for keeping them registered.
pub fn libraries() -> Vec<PathBuf> {
    snapshot()
        .roots
        .iter()
        .map(|root| library_dir(Path::new(root)))
        .collect()
}

/// Connected `steamapps/common` folders across picked install locations,
/// so scans and play lookups find games installed on external drives.
pub fn library_common_paths() -> Vec<String> {
    libraries()
        .into_iter()
        .map(|library| library.join("steamapps/common"))
        .filter(|common| common.is_dir())
        .map(|common| common.to_string_lossy().into_owned())
        .collect()
}

/// Appends connected install-location `steamapps/common` paths to `paths`
/// without duplicates.
pub fn merge_library_paths(paths: &[String]) -> Vec<String> {
    let mut merged = paths.to_vec();
    for extra in library_common_paths() {
        if !merged.contains(&extra) {
            merged.push(extra);
        }
    }
    merged
}

/// This Mac first, then each picked folder with its drive's free space.
pub fn list() -> Vec<InstallLocation> {
    let saved = snapshot();
    let mac = crate::runtimes::root();
    let (total, free) = crate::services::storage::volume(&mac).unzip();
    let mut locations = vec![InstallLocation {
        id: THIS_MAC.into(),
        label: "This Mac".into(),
        path: None,
        available: true,
        free_bytes: free,
        total_bytes: total,
        is_default: saved.last.is_none(),
        game_count: 0,
    }];
    for root in &saved.roots {
        let path = Path::new(root);
        let available = library_dir(path).is_dir();
        let (total, free) = available
            .then(|| crate::services::storage::volume(path))
            .flatten()
            .unzip();
        locations.push(InstallLocation {
            id: root.clone(),
            label: label_for(path),
            path: Some(root.clone()),
            available,
            free_bytes: free,
            total_bytes: total,
            is_default: saved.last.as_deref() == Some(root.as_str()),
            game_count: saved.game_count(root),
        });
    }
    locations
}

/// "T7 · Games" for `/Volumes/T7/Games`, the folder name elsewhere.
pub fn label_for(path: &Path) -> String {
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned());
    let mut parts = path.components().skip(1);
    if parts
        .next()
        .is_some_and(|part| part.as_os_str() == "Volumes")
    {
        if let Some(volume) = parts.next() {
            let volume = volume.as_os_str().to_string_lossy();
            return if path.components().count() > 3 {
                format!("{volume} · {name}")
            } else {
                volume.into_owned()
            };
        }
    }
    name
}

/// Normalizes a typed or pasted path (trimming whitespace/trailing slashes and
/// unescaping terminal-escaped spaces like `/Volumes/Fast\ Drive/Orbit` when
/// the literal path does not exist).
pub fn clean_input_path(path: &Path) -> PathBuf {
    let Some(raw) = path.to_str() else {
        return path.to_path_buf();
    };
    let trimmed = raw.trim();
    let stripped = if trimmed.len() > 1 {
        trimmed.trim_end_matches('/')
    } else {
        trimmed
    };
    if Path::new(stripped).exists() || !stripped.contains('\\') {
        return PathBuf::from(stripped);
    }
    let mut unescaped = String::with_capacity(stripped.len());
    let mut chars = stripped.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\\' {
            if let Some(&next) = chars.peek() {
                if next == ' ' || next.is_ascii_punctuation() {
                    unescaped.push(next);
                    chars.next();
                    continue;
                }
            }
        }
        unescaped.push(ch);
    }
    let result = if unescaped.len() > 1 {
        unescaped.trim_end_matches('/')
    } else {
        unescaped.as_str()
    };
    PathBuf::from(result)
}

fn check_lexical_root(path: &Path) -> Result<(), String> {
    if path.as_os_str().len() > 1024
        || !path.is_absolute()
        || path
            .components()
            .any(|part| matches!(part, Component::ParentDir))
    {
        return Err("Choose a folder by its full path".into());
    }
    if path
        .to_str()
        .is_none_or(|text| text.chars().any(char::is_control))
    {
        return Err("Choose a folder whose name has no special characters".into());
    }
    Ok(())
}

fn verify_root_bounds(root: &Path, orbit_data: &Path) -> Result<(), String> {
    if root.parent().is_none() || root == Path::new("/Volumes") {
        return Err("Choose a folder inside a connected drive, not the whole disk".into());
    }
    let data = orbit_data
        .canonicalize()
        .unwrap_or_else(|_| orbit_data.to_path_buf());
    if root.starts_with(&data) || data.starts_with(root) {
        return Err("Choose a folder outside Orbit's own data".into());
    }
    if root
        .to_str()
        .is_none_or(|text| text.chars().any(char::is_control))
    {
        return Err("Choose a folder whose name has no special characters".into());
    }
    Ok(())
}

/// A picked folder, canonical. Orbit's own data folder and the system root
/// are refused: games there would mix with containers or need admin rights.
pub fn validate_root(path: &Path, orbit_data: &Path) -> Result<PathBuf, String> {
    check_lexical_root(path)?;
    let root = path
        .canonicalize()
        .map_err(|_| "That folder is not accessible")?;
    if !root.is_dir() {
        return Err("Choose a folder, not a file".into());
    }
    verify_root_bounds(&root, orbit_data)?;
    Ok(root)
}

/// Validates and creates `path` when its parent folder or mounted volume
/// already exists (for example `/Volumes/Fast Drive/Orbit` on a new SSD).
/// Refuses to create a folder directly under `/Volumes` when a drive is not
/// mounted.
pub fn prepare_root(path: &Path, orbit_data: &Path) -> Result<PathBuf, String> {
    check_lexical_root(path)?;
    if path.exists() || path.symlink_metadata().is_ok() {
        return validate_root(path, orbit_data);
    }
    if path == Path::new("/Volumes") {
        return Err("Choose a folder inside a connected drive".into());
    }
    let mut missing = Vec::new();
    let mut cursor = Some(path);
    while let Some(current) = cursor {
        if current.exists() || current.symlink_metadata().is_ok() {
            break;
        }
        if let Some(name) = current.file_name() {
            missing.push(name.to_os_string());
        }
        cursor = current.parent();
    }
    let existing = cursor.ok_or("That folder is not accessible")?;
    let ancestor = existing
        .canonicalize()
        .map_err(|_| "That folder is not accessible")?;
    if !ancestor.is_dir() {
        return Err("Choose a folder, not a file".into());
    }
    if ancestor.parent().is_none() {
        return Err("Choose a folder inside a connected drive, not the whole disk".into());
    }
    let volumes = Path::new("/Volumes")
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from("/Volumes"));
    if path.starts_with("/Volumes") && ancestor == volumes {
        return Err("That drive is not connected. Connect the drive first.".into());
    }
    let mut candidate = ancestor;
    for part in missing.into_iter().rev() {
        candidate.push(part);
    }
    verify_root_bounds(&candidate, orbit_data)?;
    std::fs::create_dir_all(&candidate)
        .map_err(|_| "Orbit cannot create that folder. Check the drive's permissions.")?;
    validate_root(&candidate, orbit_data)
}

/// Adds a picked or new folder, creates it if needed, and prepares its
/// `Orbit Games/steamapps/common` and `libraryfolder.vdf`, which also proves
/// the drive is writable.
pub fn add(repo: &GameRepository, path: &Path) -> Result<InstallLocation, String> {
    let cleaned = clean_input_path(path);
    let root = prepare_root(&cleaned, &crate::utils::paths::app_data_dir())?;
    let library = library_dir(&root);
    std::fs::create_dir_all(library.join("steamapps/common"))
        .map_err(|_| "Orbit cannot write to that folder. Check the drive's permissions.")?;
    super::steam_client_download::write_library_identity(&library)?;
    let id = root.to_string_lossy().into_owned();
    with_state(repo, |saved| {
        if saved.roots.contains(&id) {
            return Ok(());
        }
        if saved.roots.len() >= LOCATION_LIMIT {
            return Err(format!(
                "Orbit keeps up to {LOCATION_LIMIT} install locations. Remove one first."
            ));
        }
        saved.roots.push(id.clone());
        Ok(())
    })?;
    list()
        .into_iter()
        .find(|location| location.id == id)
        .ok_or_else(|| "The install location could not be added".into())
}

/// Takes a folder off the list. Its files stay; a folder still holding
/// Orbit games is kept so they remain playable.
pub fn remove(repo: &GameRepository, id: &str) -> Result<(), String> {
    with_state(repo, |saved| {
        if saved.game_count(id) > 0 {
            return Err(
                "Games are installed in this location. Uninstall them first, then remove it."
                    .into(),
            );
        }
        saved.roots.retain(|root| root != id);
        if saved.last.as_deref() == Some(id) {
            saved.last = None;
        }
        Ok(())
    })
}

/// Records where a new download goes and returns that library (None is
/// This Mac). A paused or installed copy keeps its location.
pub fn choose_for_download(
    repo: &GameRepository,
    app_id: &str,
    requested: Option<&str>,
) -> Result<Option<PathBuf>, String> {
    let root = with_state(repo, |saved| {
        saved.choose(app_id, requested, |library| {
            library
                .join(format!("steamapps/appmanifest_{app_id}.acf"))
                .is_file()
        })
    })?;
    Ok(root.map(|root| library_dir(Path::new(&root))))
}

/// After an uninstall, the game no longer holds its location.
pub fn forget_app(repo: &GameRepository, app_id: &str) {
    with_state(repo, |saved| {
        saved.by_app.remove(app_id);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn saved(roots: &[&str]) -> Saved {
        Saved {
            roots: roots.iter().map(|root| root.to_string()).collect(),
            ..Saved::default()
        }
    }

    #[test]
    fn a_download_goes_where_asked_and_becomes_the_default() {
        let mut state = saved(&["/Volumes/T7/Games"]);
        assert_eq!(
            state.choose("570", Some("/Volumes/T7/Games"), |_| false),
            Ok(Some("/Volumes/T7/Games".into()))
        );
        assert_eq!(state.last.as_deref(), Some("/Volumes/T7/Games"));
        assert_eq!(state.game_count("/Volumes/T7/Games"), 1);
        assert_eq!(
            state.choose("730", None, |_| false),
            Ok(Some("/Volumes/T7/Games".into())),
            "no choice reuses the last location"
        );
        assert_eq!(state.choose("440", Some(THIS_MAC), |_| false), Ok(None));
        assert!(!state.by_app.contains_key("440"));
        assert_eq!(state.last, None);
    }

    #[test]
    fn a_paused_copy_keeps_its_location() {
        let mut state = saved(&["/Volumes/T7/Games"]);
        state
            .choose("570", Some("/Volumes/T7/Games"), |_| false)
            .unwrap();
        assert_eq!(
            state.choose("570", Some(THIS_MAC), |_| true),
            Ok(Some("/Volumes/T7/Games".into())),
            "Steam's partial files stay where they are"
        );
        assert_eq!(state.choose("570", Some(THIS_MAC), |_| false), Ok(None));
    }

    #[test]
    fn only_listed_locations_can_be_chosen() {
        let mut state = saved(&["/Volumes/T7/Games"]);
        assert!(state.choose("570", Some("/etc"), |_| false).is_err());
        assert!(state.by_app.is_empty());
    }

    #[test]
    fn damaged_saved_state_is_trimmed() {
        let mut state = saved(&["/a", "/b", "/c", "/d", "/e", "/f", "/g", "/h", "/i"]);
        state.by_app.insert("../1".into(), "/a".into());
        state.by_app.insert("570".into(), "/gone".into());
        state.by_app.insert("730".into(), "/a".into());
        state.last = Some("/gone".into());
        let clean = state.sanitized();
        assert_eq!(clean.roots.len(), LOCATION_LIMIT);
        assert_eq!(clean.by_app.len(), 1);
        assert_eq!(clean.last, None);
    }

    #[test]
    fn picked_folders_are_canonical_and_outside_orbit() {
        let root = std::env::temp_dir().join(format!("orbit-loc-{}", uuid::Uuid::new_v4()));
        let data = root.join("Orbit");
        let games = root.join("Games");
        std::fs::create_dir_all(&data).unwrap();
        std::fs::create_dir_all(&games).unwrap();
        let ok = validate_root(&games, &data).unwrap();
        assert_eq!(ok, games.canonicalize().unwrap());
        assert!(validate_root(&data.join("."), &data).is_err());
        assert!(validate_root(&data, &data).is_err(), "Orbit's own data");
        assert!(
            validate_root(&root, &data).is_err(),
            "a parent of Orbit's data"
        );
        assert!(validate_root(&games.join("../Games"), &data).is_err());
        assert!(validate_root(Path::new("relative"), &data).is_err());
        assert!(validate_root(Path::new("/"), &data).is_err());
        assert!(validate_root(&root.join("missing"), &data).is_err());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn labels_name_the_drive() {
        assert_eq!(label_for(Path::new("/Volumes/T7")), "T7");
        assert_eq!(label_for(Path::new("/Volumes/T7/Games")), "T7 · Games");
        assert_eq!(label_for(Path::new("/Users/me/Games")), "Games");
        assert_eq!(
            library_dir(Path::new("/Volumes/T7")),
            Path::new("/Volumes/T7/Orbit Games")
        );
    }

    #[test]
    fn clean_input_path_unescapes_shell_spaces_when_literal_missing() {
        let escaped = Path::new("/Volumes/Fast\\ Drive/Orbit/");
        assert_eq!(
            clean_input_path(escaped),
            PathBuf::from("/Volumes/Fast Drive/Orbit")
        );
        let plain = Path::new("  /Volumes/Fast Drive/Orbit  ");
        assert_eq!(
            clean_input_path(plain),
            PathBuf::from("/Volumes/Fast Drive/Orbit")
        );
    }

    #[test]
    fn prepare_root_creates_missing_folder_on_existing_parent_and_rejects_unmounted_volumes() {
        let root = std::env::temp_dir().join(format!("orbit-prep-{}", uuid::Uuid::new_v4()));
        let data = root.join("Data");
        let ssd = root.join("Fast Drive");
        std::fs::create_dir_all(&data).unwrap();
        std::fs::create_dir_all(&ssd).unwrap();

        let target = ssd.join("Orbit");
        let prepared = prepare_root(&target, &data).unwrap();
        assert!(prepared.is_dir());
        assert_eq!(prepared, target.canonicalize().unwrap());

        assert!(prepare_root(&data.join("Child"), &data).is_err());
        assert!(prepare_root(Path::new("/Volumes"), &data).is_err());
        assert!(
            prepare_root(
                Path::new("/Volumes/orbit-unmounted-drive-9999/Orbit"),
                &data
            )
            .is_err(),
            "must never create a phantom drive folder under /Volumes"
        );
        assert!(prepare_root(&ssd.join("../Orbit"), &data).is_err());
        let _ = std::fs::remove_dir_all(root);
    }
}
