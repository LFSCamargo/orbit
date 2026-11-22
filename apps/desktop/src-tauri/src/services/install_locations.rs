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
    /// App id → folder for Steam games not on This Mac.
    #[serde(default)]
    pub by_app: HashMap<String, String>,
    /// Product id → folder for Microsoft Store games not on This Mac.
    #[serde(default)]
    pub by_msstore: HashMap<String, String>,
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
        self.by_msstore
            .retain(|pid, root| orbit_msstore::valid_product_id(pid) && roots.contains(root));
        if self.last.as_ref().is_some_and(|last| !roots.contains(last)) {
            self.last = None;
        }
        self
    }

    fn game_count(&self, root: &str) -> usize {
        self.by_app.values().filter(|value| *value == root).count()
            + self
                .by_msstore
                .values()
                .filter(|value| *value == root)
                .count()
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

/// A picked folder, canonical. Orbit's own data folder and the system root
/// are refused: games there would mix with containers or need admin rights.
pub fn validate_root(path: &Path, orbit_data: &Path) -> Result<PathBuf, String> {
    if path.as_os_str().len() > 1024
        || !path.is_absolute()
        || path
            .components()
            .any(|part| matches!(part, Component::ParentDir))
    {
        return Err("Choose a folder by its full path".into());
    }
    let root = path
        .canonicalize()
        .map_err(|_| "That folder is not accessible")?;
    if !root.is_dir() {
        return Err("Choose a folder, not a file".into());
    }
    if root.parent().is_none() {
        return Err("Choose a folder, not the whole disk".into());
    }
    let data = orbit_data
        .canonicalize()
        .unwrap_or(orbit_data.to_path_buf());
    if root.starts_with(&data) || data.starts_with(&root) {
        return Err("Choose a folder outside Orbit's own data".into());
    }
    if root
        .to_str()
        .is_none_or(|text| text.chars().any(char::is_control))
    {
        return Err("Choose a folder whose name has no special characters".into());
    }
    Ok(root)
}

/// Adds a picked folder and prepares its `Orbit Games/steamapps/common`,
/// which also proves the drive is writable.
pub fn add(repo: &GameRepository, path: &Path) -> Result<InstallLocation, String> {
    let root = validate_root(path, &crate::utils::paths::app_data_dir())?;
    std::fs::create_dir_all(library_dir(&root).join("steamapps/common"))
        .map_err(|_| "Orbit cannot write to that folder. Check the drive's permissions.")?;
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

/// The Orbit Games folder holding a Microsoft Store game when not on This Mac.
pub fn library_for_msstore(product_id: &str) -> Option<PathBuf> {
    let pid = product_id.to_ascii_uppercase();
    let root = snapshot().by_msstore.get(&pid).cloned()?;
    Some(library_dir(Path::new(&root)))
}

/// Records where a Microsoft Store download goes and returns that library (None is This Mac).
pub fn choose_for_msstore_download(
    repo: &GameRepository,
    product_id: &str,
    requested: Option<&str>,
) -> Result<Option<PathBuf>, String> {
    if !orbit_msstore::valid_product_id(product_id) {
        return Err("Microsoft Store product id must be 12 alphanumeric characters".into());
    }
    let pid = product_id.to_ascii_uppercase();
    let root = with_state(repo, |saved| -> Result<Option<String>, String> {
        if let Some(current) = saved.by_msstore.get(&pid) {
            if library_dir(Path::new(current))
                .join("msstore")
                .join(&pid)
                .is_dir()
            {
                return Ok(Some(current.clone()));
            }
        }
        let wanted = match requested {
            Some(THIS_MAC) => None,
            Some(root) => Some(
                saved
                    .roots
                    .iter()
                    .find(|known| known.as_str() == root)
                    .cloned()
                    .ok_or_else(|| "Choose an install location from the list".to_string())?,
            ),
            None => saved.last.clone(),
        };
        match &wanted {
            Some(root) => {
                saved.by_msstore.insert(pid.clone(), root.clone());
            }
            None => {
                saved.by_msstore.remove(&pid);
            }
        }
        saved.last = wanted.clone();
        Ok(wanted)
    })?;
    Ok(root.map(|root| library_dir(Path::new(&root))))
}

/// After an uninstall, the Microsoft Store game no longer holds its location.
pub fn forget_msstore(repo: &GameRepository, product_id: &str) {
    let pid = product_id.to_ascii_uppercase();
    with_state(repo, |saved| {
        saved.by_msstore.remove(&pid);
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
}
