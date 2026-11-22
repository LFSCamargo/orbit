//! Disk usage of everything Orbit keeps under Application Support: games it
//! downloaded, compatibility tools, graphics runtimes and caches. Read-only,
//! except for removing an unused component; games go through `uninstall`.
use std::collections::HashMap;
use std::fs;
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};

use parking_lot::Mutex;
use serde::Serialize;

use crate::runtimes::components::{ComponentKind, InstalledComponent};
use crate::services::install_roots::{self, GameRoot};

/// Walk budget per scan. Large enough for many installed games, small enough
/// that a pathological tree cannot stall the scan thread.
const WALK_LIMIT: usize = 3_000_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum StorageKind {
    Game,
    Tool,
    Runtime,
    Other,
}

/// What the Storage screen may offer to remove for one item.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum StorageRemoval {
    None,
    Game { app_id: String },
    MsStoreGame { product_id: String },
    Component { id: String, version: String },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageItem {
    pub id: String,
    pub name: String,
    pub kind: StorageKind,
    pub size_bytes: u64,
    pub installed_at: Option<String>,
    pub path: String,
    pub artwork: Option<String>,
    pub removal: StorageRemoval,
    /// Library entry to open for a game, when the folder belongs to one.
    pub entry_id: Option<String>,
    /// Where the files live: `Orbit`, `Steam library` or `This Mac`.
    pub source: String,
    /// False for folders on another drive than Orbit's data folder.
    pub on_data_volume: bool,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageTotals {
    pub games: u64,
    pub tools: u64,
    pub runtimes: u64,
    pub other: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageOverview {
    pub volume_total_bytes: u64,
    pub volume_free_bytes: u64,
    pub orbit_bytes: u64,
    pub totals: StorageTotals,
    pub items: Vec<StorageItem>,
    /// True when a walk hit `WALK_LIMIT`, so sizes are lower bounds.
    pub truncated: bool,
    pub scanned_at: String,
}

/// Inputs a scan needs that come from settings, not the disk.
pub struct ScanContext<'a> {
    pub titles: &'a HashMap<String, String>,
    pub components: &'a [InstalledComponent],
    /// Measured game folders from the library, wherever they live.
    pub games: &'a [GameRoot],
}

static CACHE: Mutex<Option<StorageOverview>> = Mutex::new(None);

pub fn cached() -> Option<StorageOverview> {
    CACHE.lock().clone()
}

pub fn store(overview: &StorageOverview) {
    *CACHE.lock() = Some(overview.clone());
}

/// Called after anything that changes disk usage.
pub fn invalidate() {
    *CACHE.lock() = None;
}

/// Allocated bytes of a file or folder, without following symlinks and
/// without the game folders listed on their own. O(f), bounded by `budget`.
fn disk_usage(path: &Path, excluded: &[PathBuf], budget: &mut usize) -> u64 {
    // WalkDir follows a symlinked root; a linked folder is not Orbit's bytes.
    if fs::symlink_metadata(path).map_or(true, |meta| meta.file_type().is_symlink()) {
        return 0;
    }
    install_roots::disk_usage(path, excluded, budget)
}

fn device_of(path: &Path) -> Option<u64> {
    fs::metadata(path).ok().map(|meta| meta.dev())
}

fn game_source(root: &Path, data_dir: &Path) -> &'static str {
    if root.starts_with(data_dir) {
        "Orbit"
    } else if root
        .components()
        .any(|part| part.as_os_str().eq_ignore_ascii_case("steamapps"))
    {
        "Steam library"
    } else {
        "This Mac"
    }
}

fn modified_at(path: &Path) -> Option<String> {
    let meta = fs::symlink_metadata(path).ok()?;
    let time = meta.created().or_else(|_| meta.modified()).ok()?;
    Some(chrono::DateTime::<chrono::Utc>::from(time).to_rfc3339())
}

fn children(path: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(path) else {
        return Vec::new();
    };
    let mut paths: Vec<PathBuf> = entries.flatten().map(|entry| entry.path()).collect();
    paths.sort();
    paths
}

fn name_of(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn component_kind(kind: ComponentKind) -> StorageKind {
    match kind {
        ComponentKind::Wine => StorageKind::Tool,
        _ => StorageKind::Runtime,
    }
}

fn component_label(id: &str) -> String {
    match id {
        "wine-stable" => "Wine (stable)".into(),
        "wine-devel" => "Wine (development)".into(),
        "wine-staging" => "Wine (staging)".into(),
        "dxvk" => "DXVK".into(),
        "dxmt" => "DXMT".into(),
        "moltenvk" => "MoltenVK".into(),
        "gptk" => "Game Porting Toolkit".into(),
        "vkd3d-proton" => "VKD3D-Proton".into(),
        "zink" => "Zink".into(),
        "xgameruntime" => "Xbox GDK Runtime (xgameruntime)".into(),
        other => other.into(),
    }
}

struct Scan<'a> {
    context: &'a ScanContext<'a>,
    budget: usize,
    items: Vec<StorageItem>,
    excluded: Vec<PathBuf>,
}

impl Scan<'_> {
    fn push(
        &mut self,
        path: &Path,
        id: String,
        name: String,
        kind: StorageKind,
        removal: StorageRemoval,
        artwork: Option<String>,
    ) {
        let size_bytes = disk_usage(path, &self.excluded, &mut self.budget);
        if size_bytes == 0 {
            return;
        }
        self.items.push(StorageItem {
            id,
            name,
            kind,
            size_bytes,
            installed_at: modified_at(path),
            path: path.to_string_lossy().into_owned(),
            artwork,
            removal,
            entry_id: None,
            source: "Orbit".into(),
            on_data_volume: true,
        });
    }

    /// Library games, measured from their real folders. Orbit-downloaded
    /// ones can be uninstalled here; others only shown.
    fn library_games(&mut self, data_dir: &Path) {
        let data_device = device_of(data_dir);
        for game in self.context.games {
            if game.bytes == 0 {
                continue;
            }
            let removal = match (&game.steam_app_id, &game.msstore_product_id, game.removable) {
                (Some(app_id), _, true) => StorageRemoval::Game {
                    app_id: app_id.clone(),
                },
                (_, Some(product_id), true) => StorageRemoval::MsStoreGame {
                    product_id: product_id.clone(),
                },
                _ => StorageRemoval::None,
            };
            self.items.push(StorageItem {
                id: format!("game:{}", game.entry_id),
                name: game.title.clone(),
                kind: StorageKind::Game,
                size_bytes: game.bytes,
                installed_at: modified_at(&game.root),
                path: game.root.to_string_lossy().into_owned(),
                artwork: game.cover.clone(),
                removal,
                entry_id: Some(game.entry_id.clone()),
                source: game_source(&game.root, data_dir).into(),
                on_data_volume: data_device.is_some() && device_of(&game.root) == data_device,
            });
        }
    }

    fn game(&mut self, path: &Path, app_id: &str) {
        let name = self
            .context
            .titles
            .get(app_id)
            .cloned()
            .unwrap_or_else(|| format!("Steam {app_id}"));
        self.push(
            path,
            format!("game:{app_id}"),
            name,
            StorageKind::Game,
            StorageRemoval::Game {
                app_id: app_id.to_string(),
            },
            Some(crate::services::steam_catalog::cover_url(app_id)),
        );
    }

    fn other(&mut self, path: &Path, id: &str, name: &str) {
        self.push(
            path,
            id.into(),
            name.into(),
            StorageKind::Other,
            StorageRemoval::None,
            None,
        );
    }

    fn containers(&mut self, containers: &Path) {
        for kind in children(containers) {
            if name_of(&kind) != "games" {
                self.other(
                    &kind,
                    &format!("containers:{}", name_of(&kind)),
                    "Compatibility containers",
                );
                continue;
            }
            for container in children(&kind) {
                let folder = name_of(&container);
                if let Some(app_id) = folder
                    .strip_prefix("steam-")
                    .filter(|id| crate::services::steam_download::valid_app_id(id))
                {
                    for part in children(&container) {
                        if name_of(&part) == "install" {
                            self.game(&part, app_id);
                        } else {
                            let title = self
                                .context
                                .titles
                                .get(app_id)
                                .cloned()
                                .unwrap_or_else(|| format!("Steam {app_id}"));
                            self.other(
                                &part,
                                &format!("game-data:{app_id}:{}", name_of(&part)),
                                &format!("{title} · saves & settings"),
                            );
                        }
                    }
                    continue;
                }
                if let Some(product_id) = folder
                    .strip_prefix("msstore-")
                    .filter(|id| orbit_msstore::valid_product_id(id))
                {
                    let pid = product_id.to_ascii_uppercase();
                    for part in children(&container) {
                        if name_of(&part) == "install" {
                            let name = self
                                .context
                                .titles
                                .get(&pid)
                                .cloned()
                                .unwrap_or_else(|| format!("Microsoft Store {pid}"));
                            self.push(
                                &part,
                                format!("game:msstore:{pid}"),
                                name,
                                StorageKind::Game,
                                StorageRemoval::MsStoreGame {
                                    product_id: pid.clone(),
                                },
                                None,
                            );
                        } else {
                            let title = self
                                .context
                                .titles
                                .get(&pid)
                                .cloned()
                                .unwrap_or_else(|| format!("Microsoft Store {pid}"));
                            self.other(
                                &part,
                                &format!("game-data:msstore:{pid}:{}", name_of(&part)),
                                &format!("{title} · saves & settings"),
                            );
                        }
                    }
                    continue;
                }
                self.other(&container, &format!("container:{folder}"), "Game container");
            }
        }
    }

    fn components(&mut self, root: &Path) {
        let known: HashMap<PathBuf, &InstalledComponent> = self
            .context
            .components
            .iter()
            .map(|component| (PathBuf::from(&component.path), component))
            .collect();
        for id_dir in children(root) {
            for version_dir in children(&id_dir) {
                match known.get(&version_dir) {
                    Some(component) => self.push(
                        &version_dir,
                        format!("component:{}:{}", component.id, component.version),
                        format!("{} {}", component_label(&component.id), component.version),
                        component_kind(component.kind),
                        StorageRemoval::Component {
                            id: component.id.clone(),
                            version: component.version.clone(),
                        },
                        None,
                    ),
                    None => self.push(
                        &version_dir,
                        format!("component:{}:{}", name_of(&id_dir), name_of(&version_dir)),
                        format!(
                            "{} {}",
                            component_label(&name_of(&id_dir)),
                            name_of(&version_dir)
                        ),
                        StorageKind::Runtime,
                        StorageRemoval::None,
                        None,
                    ),
                }
            }
        }
    }

    fn runtimes(&mut self, runtimes: &Path) {
        for child in children(runtimes) {
            match name_of(&child).as_str() {
                "components" => self.components(&child),
                "containers" => self.containers(&child),
                "steam-client" => self.push(
                    &child,
                    "tool:steam-client".into(),
                    "Steam client runtime".into(),
                    StorageKind::Tool,
                    StorageRemoval::None,
                    None,
                ),
                "game-bundles" => self.other(&child, "other:game-bundles", "Game bundles"),
                "layers" => self.other(&child, "other:layers", "Runtime layers"),
                name if name.starts_with("wine-") => self.push(
                    &child,
                    format!("tool:{name}"),
                    format!(
                        "Wine {}",
                        name.trim_start_matches("wine-").replace('_', " ")
                    ),
                    StorageKind::Tool,
                    StorageRemoval::None,
                    None,
                ),
                name => self.other(&child, &format!("other:runtimes:{name}"), "Launch caches"),
            }
        }
    }

    fn steam_windows(&mut self, steam: &Path) {
        for child in children(steam) {
            if name_of(&child) != "games" {
                self.push(
                    &child,
                    format!("tool:steam-windows:{}", name_of(&child)),
                    "Steam for Windows".into(),
                    StorageKind::Tool,
                    StorageRemoval::None,
                    None,
                );
                continue;
            }
            for game in children(&child) {
                let folder = name_of(&game);
                if crate::services::steam_download::valid_app_id(&folder) {
                    self.game(&game, &folder);
                } else {
                    self.other(
                        &game,
                        &format!("other:steam-games:{folder}"),
                        "Steam downloads",
                    );
                }
            }
        }
    }
}

/// Merges rows that share an id (e.g. several launch-cache folders) so the
/// table shows one line per thing a person would recognise. O(n) with a map.
fn merge_items(items: Vec<StorageItem>) -> Vec<StorageItem> {
    let mut merged: Vec<StorageItem> = Vec::new();
    let mut index: HashMap<(StorageKind, String), usize> = HashMap::new();
    for item in items {
        let key = match item.removal {
            StorageRemoval::None if item.kind != StorageKind::Game => {
                (item.kind, item.name.clone())
            }
            _ => (item.kind, item.id.clone()),
        };
        match index.get(&key) {
            Some(&at) => {
                merged[at].size_bytes += item.size_bytes;
                if item.installed_at > merged[at].installed_at {
                    merged[at].installed_at = item.installed_at;
                }
            }
            None => {
                index.insert(key, merged.len());
                merged.push(item);
            }
        }
    }
    merged.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes).then(a.name.cmp(&b.name)));
    merged
}

/// Scans Orbit's data folder plus each library game's real folder. Game
/// folders inside the data folder (a container install, games the Steam
/// client keeps in its prefix) are counted once, as games. O(f), capped by
/// `WALK_LIMIT`.
pub fn scan(data_dir: &Path, context: &ScanContext) -> StorageOverview {
    let data_dir = data_dir
        .canonicalize()
        .unwrap_or_else(|_| data_dir.to_path_buf());
    let data_dir = data_dir.as_path();
    let mut scan = Scan {
        context,
        budget: WALK_LIMIT,
        items: Vec::new(),
        excluded: context.games.iter().map(|game| game.root.clone()).collect(),
    };
    scan.library_games(data_dir);
    for child in children(data_dir) {
        match name_of(&child).as_str() {
            "runtimes" => scan.runtimes(&child),
            "steam-windows" => scan.steam_windows(&child),
            "artwork-cache" => scan.other(&child, "other:artwork-cache", "Artwork cache"),
            "themes" => scan.other(&child, "other:themes", "Themes"),
            "backups" => scan.other(&child, "other:backups", "Library backups"),
            "runtime-probes" => scan.other(&child, "other:runtime-probes", "Runtime checks"),
            _ => scan.other(&child, "other:library-data", "Library data"),
        }
    }
    let truncated = scan.budget == 0;
    let items = merge_items(scan.items);
    let mut totals = StorageTotals::default();
    for item in &items {
        let slot = match item.kind {
            StorageKind::Game => &mut totals.games,
            StorageKind::Tool => &mut totals.tools,
            StorageKind::Runtime => &mut totals.runtimes,
            StorageKind::Other => &mut totals.other,
        };
        *slot += item.size_bytes;
    }
    let (volume_total_bytes, volume_free_bytes) = volume(data_dir).unwrap_or((0, 0));
    StorageOverview {
        volume_total_bytes,
        volume_free_bytes,
        orbit_bytes: totals.games + totals.tools + totals.runtimes + totals.other,
        totals,
        items,
        truncated,
        scanned_at: chrono::Utc::now().to_rfc3339(),
    }
}

/// Total and available bytes of the volume holding `path`.
pub(crate) fn volume(path: &Path) -> Option<(u64, u64)> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;
    let c_path = CString::new(path.as_os_str().as_bytes()).ok()?;
    let mut stats: libc::statvfs = unsafe { std::mem::zeroed() };
    // SAFETY: `c_path` is a valid NUL-terminated string and `stats` is a
    // writable statvfs the call fills in.
    if unsafe { libc::statvfs(c_path.as_ptr(), &mut stats) } != 0 {
        return None;
    }
    let block = stats.f_frsize as u64;
    Some((
        (stats.f_blocks as u64).saturating_mul(block),
        (stats.f_bavail as u64).saturating_mul(block),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(path: &Path, bytes: usize) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, vec![1u8; bytes]).unwrap();
    }

    #[test]
    fn groups_games_tools_runtimes_and_other() {
        let root = std::env::temp_dir().join(format!("orbit-storage-{}", uuid::Uuid::new_v4()));
        write(
            &root.join("runtimes/containers/games/steam-570/install/game.exe"),
            20_000,
        );
        write(
            &root.join("runtimes/containers/games/steam-570/prefix/drive_c/save.dat"),
            5_000,
        );
        write(
            &root.join("runtimes/components/dxvk/2.3/x64/d3d11.dll"),
            8_000,
        );
        write(&root.join("steam-windows/prefix/steam.exe"), 9_000);
        write(&root.join("steam-windows/games/730/csgo.exe"), 7_000);
        write(&root.join("artwork-cache/a.jpg"), 3_000);
        write(&root.join("orbit.sqlite3"), 1_000);
        let dxvk = InstalledComponent {
            id: "dxvk".into(),
            version: "2.3".into(),
            kind: ComponentKind::Dxvk,
            path: root
                .join("runtimes/components/dxvk/2.3")
                .to_string_lossy()
                .into_owned(),
            installed_at: String::new(),
        };
        let titles = HashMap::from([("570".to_string(), "Dota 2".to_string())]);
        let overview = scan(
            &root,
            &ScanContext {
                titles: &titles,
                components: std::slice::from_ref(&dxvk),
                games: &[],
            },
        );
        let find = |id: &str| overview.items.iter().find(|item| item.id == id).unwrap();
        let dota = find("game:570");
        assert_eq!(dota.name, "Dota 2");
        assert_eq!(
            dota.removal,
            StorageRemoval::Game {
                app_id: "570".into()
            }
        );
        assert_eq!(find("game:730").kind, StorageKind::Game);
        assert_eq!(find("component:dxvk:2.3").kind, StorageKind::Runtime);
        assert_eq!(
            find("tool:steam-windows:prefix").removal,
            StorageRemoval::None
        );
        assert_eq!(find("game-data:570:prefix").kind, StorageKind::Other);
        assert!(overview.totals.games >= 27_000);
        assert!(overview.totals.runtimes >= 8_000);
        assert!(overview.totals.tools >= 9_000);
        assert!(overview.totals.other >= 9_000);
        assert_eq!(
            overview.orbit_bytes,
            overview
                .items
                .iter()
                .map(|item| item.size_bytes)
                .sum::<u64>()
        );
        assert!(overview.volume_total_bytes > 0);
        assert!(!overview.truncated);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn does_not_follow_symlinks_out_of_the_data_folder() {
        let root =
            std::env::temp_dir().join(format!("orbit-storage-link-{}", uuid::Uuid::new_v4()));
        let outside =
            std::env::temp_dir().join(format!("orbit-storage-out-{}", uuid::Uuid::new_v4()));
        write(&outside.join("huge.bin"), 50_000);
        fs::create_dir_all(root.join("runtimes/containers/games/steam-570")).unwrap();
        std::os::unix::fs::symlink(
            &outside,
            root.join("runtimes/containers/games/steam-570/install"),
        )
        .unwrap();
        let titles = HashMap::new();
        let overview = scan(
            &root,
            &ScanContext {
                titles: &titles,
                components: &[],
                games: &[],
            },
        );
        assert!(overview.totals.games < 50_000);
        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(outside);
    }

    #[test]
    fn counts_library_games_from_their_real_folders_once() {
        let root =
            std::env::temp_dir().join(format!("orbit-storage-real-{}", uuid::Uuid::new_v4()));
        let outside =
            std::env::temp_dir().join(format!("orbit-storage-lib-{}", uuid::Uuid::new_v4()));
        let client_game = root
            .join("steam-windows/prefix/drive_c/Program Files (x86)/Steam/steamapps/common/Hades");
        write(&client_game.join("Hades.exe"), 40_000);
        write(
            &root.join("steam-windows/prefix/drive_c/Program Files (x86)/Steam/steam.exe"),
            9_000,
        );
        let external = outside.join("steamapps/common/Celeste");
        write(&external.join("Celeste.exe"), 30_000);
        let canonical = |p: &Path| p.canonicalize().unwrap();
        let game = |id: &str, title: &str, dir: &Path, bytes: u64| GameRoot {
            entry_id: id.into(),
            title: title.into(),
            steam_app_id: None,
            msstore_product_id: None,
            cover: None,
            root: canonical(dir),
            bytes,
            removable: false,
        };
        let games = [
            game("steam:1145360", "Hades", &client_game, 40_960),
            game("steam:504230", "Celeste", &external, 32_768),
        ];
        let titles = HashMap::new();
        let overview = scan(
            &root,
            &ScanContext {
                titles: &titles,
                components: &[],
                games: &games,
            },
        );
        let find = |id: &str| overview.items.iter().find(|item| item.id == id).unwrap();
        let hades = find("game:steam:1145360");
        assert_eq!(hades.source, "Orbit");
        assert_eq!(hades.entry_id.as_deref(), Some("steam:1145360"));
        assert_eq!(hades.removal, StorageRemoval::None);
        let client = find("tool:steam-windows:prefix");
        assert!(
            client.size_bytes < 40_000,
            "the game is not counted as Steam"
        );
        let celeste = find("game:steam:504230");
        assert_eq!(celeste.source, "Steam library");
        assert_eq!(overview.totals.games, 40_960 + 32_768);
        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(outside);
    }
}
