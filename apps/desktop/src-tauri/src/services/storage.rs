//! Disk usage of everything Orbit keeps under Application Support: games it
//! downloaded, compatibility tools, graphics runtimes and caches, plus every
//! connected drive's capacity and free space. Users own everything Orbit
//! creates and can remove any Orbit-managed item from Settings → Storage.
use std::collections::{HashMap, HashSet};
use std::fs;
use std::os::unix::fs::MetadataExt;
use std::path::{Component, Path, PathBuf};

use parking_lot::Mutex;
use serde::Serialize;

use crate::runtimes::components::{ComponentKind, InstalledComponent};
use crate::services::install_roots::{self, GameRoot};

/// Walk budget per scan. Large enough for many installed games, small enough
/// that a pathological tree cannot stall the scan thread.
const WALK_LIMIT: usize = 3_000_000;
pub const THIS_MAC_DRIVE_ID: &str = "this-mac";

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
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "type"
)]
pub enum StorageRemoval {
    None,
    Game {
        app_id: String,
    },
    Component {
        id: String,
        version: String,
    },
    /// One or more files/folders created by Orbit inside its data directory.
    OrbitData {
        paths: Vec<String>,
    },
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
    /// Identifier of the drive holding this item (matches `StorageDrive::id`).
    pub drive_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageTotals {
    pub games: u64,
    pub tools: u64,
    pub runtimes: u64,
    pub other: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageDrive {
    pub id: String,
    pub name: String,
    pub mount_path: String,
    pub is_data_volume: bool,
    pub total_bytes: u64,
    pub free_bytes: u64,
    pub orbit_bytes: u64,
    pub totals: StorageTotals,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageOverview {
    /// Sum of total capacity across all connected drives.
    pub volume_total_bytes: u64,
    /// Sum of free space across all connected drives.
    pub volume_free_bytes: u64,
    pub orbit_bytes: u64,
    pub totals: StorageTotals,
    pub drives: Vec<StorageDrive>,
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
        other => other.into(),
    }
}

struct Scan<'a> {
    context: &'a ScanContext<'a>,
    budget: usize,
    items: Vec<StorageItem>,
    excluded: Vec<PathBuf>,
}

fn orbit_data_removal(path: &Path) -> StorageRemoval {
    StorageRemoval::OrbitData {
        paths: vec![path.to_string_lossy().into_owned()],
    }
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
            drive_id: THIS_MAC_DRIVE_ID.into(),
        });
    }

    /// Library games, measured from their real folders. Orbit-downloaded
    /// ones can be uninstalled here; any other folder inside Orbit's data
    /// directory can also be removed directly.
    fn library_games(&mut self, data_dir: &Path) {
        let data_device = device_of(data_dir);
        for game in self.context.games {
            if game.bytes == 0 {
                continue;
            }
            let removal = match (&game.steam_app_id, game.removable) {
                (Some(app_id), true) => StorageRemoval::Game {
                    app_id: app_id.clone(),
                },
                _ if game.root.starts_with(data_dir) => orbit_data_removal(&game.root),
                _ => StorageRemoval::None,
            };
            let on_data_volume = data_device.is_some() && device_of(&game.root) == data_device;
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
                on_data_volume,
                drive_id: if on_data_volume {
                    THIS_MAC_DRIVE_ID.into()
                } else {
                    String::new()
                },
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
            orbit_data_removal(path),
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
                let Some(app_id) = folder
                    .strip_prefix("steam-")
                    .filter(|id| crate::services::steam_download::valid_app_id(id))
                else {
                    self.other(&container, &format!("container:{folder}"), "Game container");
                    continue;
                };
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
                            &format!("{title} · container & saves"),
                        );
                    }
                }
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
                        orbit_data_removal(&version_dir),
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
                    orbit_data_removal(&child),
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
                    orbit_data_removal(&child),
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
                    orbit_data_removal(&child),
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

/// Merges rows that share a label (e.g. several launch-cache or library-data
/// entries) so the table shows one line per thing a person would recognise,
/// collecting all underlying Orbit paths so deleting the row removes them all.
/// O(n) with a map.
fn merge_items(items: Vec<StorageItem>) -> Vec<StorageItem> {
    let mut merged: Vec<StorageItem> = Vec::new();
    let mut index: HashMap<(StorageKind, String), usize> = HashMap::new();
    for item in items {
        let key = match &item.removal {
            StorageRemoval::None | StorageRemoval::OrbitData { .. }
                if item.kind != StorageKind::Game =>
            {
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
                if let (
                    StorageRemoval::OrbitData { paths: existing },
                    StorageRemoval::OrbitData { paths: incoming },
                ) = (&mut merged[at].removal, item.removal)
                {
                    for path in incoming {
                        if !existing.contains(&path) {
                            existing.push(path);
                        }
                    }
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

#[derive(Debug, Clone)]
struct VolumeEntry {
    dev: u64,
    drive: StorageDrive,
}

/// Discovers the primary volume holding `data_dir` plus every connected
/// external/secondary volume under `volumes_root` (and any extra game roots),
/// deduplicated by POSIX device id. O(v + r) over mounts and extra roots.
fn discover_drives(
    data_dir: &Path,
    volumes_root: &Path,
    extra_roots: &[PathBuf],
) -> Vec<VolumeEntry> {
    let mut seen: HashSet<u64> = HashSet::new();
    let mut entries: Vec<VolumeEntry> = Vec::new();
    let data_dev = device_of(data_dir).unwrap_or(0);
    let (data_total, data_free) = volume(data_dir).unwrap_or((0, 0));
    seen.insert(data_dev);
    entries.push(VolumeEntry {
        dev: data_dev,
        drive: StorageDrive {
            id: THIS_MAC_DRIVE_ID.into(),
            name: "This Mac".into(),
            mount_path: "/".into(),
            is_data_volume: true,
            total_bytes: data_total,
            free_bytes: data_free,
            orbit_bytes: 0,
            totals: StorageTotals::default(),
        },
    });

    for child in children(volumes_root) {
        let name = name_of(&child);
        if name.is_empty() || name.starts_with('.') || is_ignored_volume(&child, &name) {
            continue;
        }
        let Ok(meta) = fs::symlink_metadata(&child) else {
            continue;
        };
        if meta.file_type().is_symlink() || !meta.is_dir() {
            continue;
        }
        let Some(dev) = device_of(&child) else {
            continue;
        };
        if !seen.insert(dev) {
            continue;
        }
        let Some((total_bytes, free_bytes)) = volume(&child) else {
            continue;
        };
        if total_bytes == 0 {
            continue;
        }
        let mount = child.to_string_lossy().into_owned();
        entries.push(VolumeEntry {
            dev,
            drive: StorageDrive {
                id: mount.clone(),
                name,
                mount_path: mount,
                is_data_volume: false,
                total_bytes,
                free_bytes,
                orbit_bytes: 0,
                totals: StorageTotals::default(),
            },
        });
    }

    for root in extra_roots {
        let Some(dev) = device_of(root) else {
            continue;
        };
        if !seen.insert(dev) {
            continue;
        }
        let Some((total_bytes, free_bytes)) = volume(root) else {
            continue;
        };
        if total_bytes == 0 {
            continue;
        }
        let mount = root.to_string_lossy().into_owned();
        entries.push(VolumeEntry {
            dev,
            drive: StorageDrive {
                id: mount.clone(),
                name: crate::services::install_locations::label_for(root),
                mount_path: mount,
                is_data_volume: false,
                total_bytes,
                free_bytes,
                orbit_bytes: 0,
                totals: StorageTotals::default(),
            },
        });
    }

    if entries.len() > 1 {
        entries[1..].sort_by(|a, b| {
            a.drive
                .name
                .to_lowercase()
                .cmp(&b.drive.name.to_lowercase())
        });
    }
    entries
}

/// Attributes each scanned item to its drive and accumulates per-drive Orbit
/// category totals. O(d + n) using a device-id map.
fn assign_items_to_drives(
    drives: &mut [VolumeEntry],
    items: &mut [StorageItem],
    dev_of_item: impl Fn(&StorageItem) -> Option<u64>,
) {
    let by_dev: HashMap<u64, usize> = drives
        .iter()
        .enumerate()
        .map(|(index, entry)| (entry.dev, index))
        .collect();
    for item in items.iter_mut() {
        let target = if item.on_data_volume {
            Some(0)
        } else {
            dev_of_item(item).and_then(|dev| by_dev.get(&dev).copied())
        };
        if let Some(index) = target {
            let drive = &mut drives[index].drive;
            item.drive_id = drive.id.clone();
            let slot = match item.kind {
                StorageKind::Game => &mut drive.totals.games,
                StorageKind::Tool => &mut drive.totals.tools,
                StorageKind::Runtime => &mut drive.totals.runtimes,
                StorageKind::Other => &mut drive.totals.other,
            };
            *slot = slot.saturating_add(item.size_bytes);
            drive.orbit_bytes = drive.orbit_bytes.saturating_add(item.size_bytes);
        }
    }
}

/// Scans Orbit's data folder, each library game's real folder, and connected
/// drives under `/Volumes`. O(f), capped by `WALK_LIMIT`.
pub fn scan(data_dir: &Path, context: &ScanContext) -> StorageOverview {
    scan_with_volumes(data_dir, Path::new("/Volumes"), context)
}

fn scan_with_volumes(
    data_dir: &Path,
    volumes_root: &Path,
    context: &ScanContext,
) -> StorageOverview {
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
    let mut items = merge_items(scan.items);
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

    let mut extra_roots: Vec<PathBuf> =
        context.games.iter().map(|game| game.root.clone()).collect();
    extra_roots.extend(crate::services::install_locations::libraries());
    let mut volume_entries = discover_drives(data_dir, volumes_root, &extra_roots);
    assign_items_to_drives(&mut volume_entries, &mut items, |item| {
        device_of(Path::new(&item.path))
    });
    let drives: Vec<StorageDrive> = volume_entries
        .into_iter()
        .map(|entry| entry.drive)
        .collect();
    let volume_total_bytes = drives
        .iter()
        .fold(0u64, |acc, drive| acc.saturating_add(drive.total_bytes));
    let volume_free_bytes = drives
        .iter()
        .fold(0u64, |acc, drive| acc.saturating_add(drive.free_bytes));

    StorageOverview {
        volume_total_bytes,
        volume_free_bytes,
        orbit_bytes: totals.games + totals.tools + totals.runtimes + totals.other,
        totals,
        drives,
        items,
        truncated,
        scanned_at: chrono::Utc::now().to_rfc3339(),
    }
}

/// Deletes one or more files or folders created by Orbit strictly inside
/// `data_dir`. Symlinks are unlinked without following. Returns freed bytes.
/// O(p + f) over paths and deleted files.
pub fn remove_orbit_paths(paths: &[String], data_dir: &Path) -> Result<u64, String> {
    if paths.is_empty() {
        return Err("Nothing to remove".into());
    }
    let root = data_dir
        .canonicalize()
        .map_err(|_| "Orbit's data folder is missing".to_string())?;
    let mut removed = 0u64;
    for raw in paths {
        let target = Path::new(raw);
        if !target.is_absolute()
            || target
                .components()
                .any(|part| matches!(part, Component::ParentDir))
        {
            return Err("Refusing to delete a path outside Orbit's data folder".into());
        }
        let Ok(meta) = fs::symlink_metadata(target) else {
            continue;
        };
        let parent = target
            .parent()
            .and_then(|parent| parent.canonicalize().ok())
            .ok_or("The item's folder could not be resolved")?;
        let name = target.file_name().ok_or("The item has no name")?;
        let resolved = parent.join(name);
        if !resolved.starts_with(&root) || resolved == root {
            return Err("Refusing to delete a path outside Orbit's data folder".into());
        }
        if meta.file_type().is_symlink() {
            fs::remove_file(&resolved).map_err(|err| err.to_string())?;
            continue;
        }
        if meta.is_dir() {
            let bytes = crate::utils::size::path_size_bytes(&resolved).unwrap_or(0);
            fs::remove_dir_all(&resolved).map_err(|err| err.to_string())?;
            removed = removed.saturating_add(u64::try_from(bytes).unwrap_or(0));
        } else {
            let bytes = meta.blocks().saturating_mul(512).max(meta.len());
            fs::remove_file(&resolved).map_err(|err| err.to_string())?;
            removed = removed.saturating_add(bytes);
        }
    }
    Ok(removed)
}

/// System, recovery, and non-browsable mounts (such as `/Volumes/Recovery`
/// with `MNT_DONTBROWSE`) are excluded so only real user drives appear and
/// contribute to summed free space.
fn is_ignored_volume(path: &Path, name: &str) -> bool {
    is_system_volume_name(name) || is_nobrowse_mount(path)
}

fn is_system_volume_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    matches!(
        lower.as_str(),
        "recovery"
            | "preboot"
            | "vm"
            | "update"
            | "xart"
            | "xarts"
            | "iscpreboot"
            | "hardware"
            | "base system"
            | "macos base system"
            | "os x base system"
    ) || lower.starts_with("recovery ")
        || lower.ends_with(" recovery")
        || lower.starts_with("com.apple.timemachine")
}

#[cfg(target_os = "macos")]
fn is_nobrowse_mount(path: &Path) -> bool {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;
    let Ok(c_path) = CString::new(path.as_os_str().as_bytes()) else {
        return false;
    };
    let mut stats: libc::statfs = unsafe { std::mem::zeroed() };
    // SAFETY: `c_path` is a valid NUL-terminated string and `stats` is a
    // writable statfs struct filled in by the kernel.
    if unsafe { libc::statfs(c_path.as_ptr(), &mut stats) } != 0 {
        return false;
    }
    (stats.f_flags & libc::MNT_DONTBROWSE as u32) != 0
}

#[cfg(not(target_os = "macos"))]
fn is_nobrowse_mount(_path: &Path) -> bool {
    false
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
        assert!(matches!(
            find("tool:steam-windows:prefix").removal,
            StorageRemoval::OrbitData { ref paths } if paths.len() == 1
        ));
        assert!(matches!(
            find("game-data:570:prefix").removal,
            StorageRemoval::OrbitData { ref paths } if paths.len() == 1
        ));
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
        assert!(!overview.drives.is_empty());
        assert_eq!(overview.drives[0].id, THIS_MAC_DRIVE_ID);
        assert!(overview.drives[0].is_data_volume);
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
        let overview = scan_with_volumes(
            &root,
            &root.join("empty-volumes"),
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
        let overview = scan_with_volumes(
            &root,
            &root.join("empty-volumes"),
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
        assert!(matches!(
            hades.removal,
            StorageRemoval::OrbitData { ref paths } if paths.len() == 1
        ));
        let client = find("tool:steam-windows:prefix");
        assert!(
            client.size_bytes < 40_000,
            "the game is not counted as Steam"
        );
        let celeste = find("game:steam:504230");
        assert_eq!(celeste.source, "Steam library");
        assert_eq!(celeste.removal, StorageRemoval::None);
        assert_eq!(overview.totals.games, 40_960 + 32_768);
        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(outside);
    }

    #[test]
    fn merges_orbit_data_paths_and_deletes_only_inside_data_dir() {
        let root = std::env::temp_dir().join(format!("orbit-storage-del-{}", uuid::Uuid::new_v4()));
        let outside =
            std::env::temp_dir().join(format!("orbit-storage-ext-{}", uuid::Uuid::new_v4()));
        write(&root.join("orbit.sqlite3"), 4_096);
        write(&root.join("metadata.sqlite"), 2_048);
        write(&root.join("artwork-cache/img.png"), 8_192);
        write(&outside.join("keep.txt"), 1_024);
        std::os::unix::fs::symlink(&outside, root.join("linked-dir")).unwrap();

        let titles = HashMap::new();
        let overview = scan_with_volumes(
            &root,
            &root.join("empty-volumes"),
            &ScanContext {
                titles: &titles,
                components: &[],
                games: &[],
            },
        );
        let lib = overview
            .items
            .iter()
            .find(|item| item.id == "other:library-data")
            .unwrap();
        let StorageRemoval::OrbitData { paths } = &lib.removal else {
            panic!("library data must be removable as OrbitData");
        };
        assert_eq!(paths.len(), 2, "merged row collects every underlying file");

        let freed = remove_orbit_paths(paths, &root).unwrap();
        assert!(freed >= 6_144);
        assert!(!root.join("orbit.sqlite3").exists());
        assert!(!root.join("metadata.sqlite").exists());

        let cache_path = root.join("artwork-cache").to_string_lossy().into_owned();
        assert!(remove_orbit_paths(&[cache_path], &root).unwrap() >= 8_192);
        assert!(!root.join("artwork-cache").exists());

        let link_path = root.join("linked-dir").to_string_lossy().into_owned();
        assert_eq!(remove_orbit_paths(&[link_path], &root).unwrap(), 0);
        assert!(
            outside.join("keep.txt").exists(),
            "symlink target untouched"
        );

        assert!(remove_orbit_paths(&[outside.to_string_lossy().into_owned()], &root).is_err());
        assert!(remove_orbit_paths(&[root.to_string_lossy().into_owned()], &root).is_err());
        assert!(remove_orbit_paths(
            &[root.join("../outside").to_string_lossy().into_owned()],
            &root
        )
        .is_err());
        assert!(remove_orbit_paths(&[], &root).is_err());
        assert!(outside.join("keep.txt").exists());

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(outside);
    }

    #[test]
    fn attributes_items_to_multiple_drives_and_sums_drive_totals() {
        let mut drives = vec![
            VolumeEntry {
                dev: 1,
                drive: StorageDrive {
                    id: THIS_MAC_DRIVE_ID.into(),
                    name: "This Mac".into(),
                    mount_path: "/".into(),
                    is_data_volume: true,
                    total_bytes: 500_000,
                    free_bytes: 100_000,
                    orbit_bytes: 0,
                    totals: StorageTotals::default(),
                },
            },
            VolumeEntry {
                dev: 2,
                drive: StorageDrive {
                    id: "/Volumes/T7".into(),
                    name: "T7".into(),
                    mount_path: "/Volumes/T7".into(),
                    is_data_volume: false,
                    total_bytes: 2_000_000,
                    free_bytes: 1_500_000,
                    orbit_bytes: 0,
                    totals: StorageTotals::default(),
                },
            },
        ];
        let mut items = vec![
            StorageItem {
                id: "tool:wine".into(),
                name: "Wine".into(),
                kind: StorageKind::Tool,
                size_bytes: 10_000,
                installed_at: None,
                path: "/Orbit/runtimes/wine".into(),
                artwork: None,
                removal: StorageRemoval::OrbitData {
                    paths: vec!["/Orbit/runtimes/wine".into()],
                },
                entry_id: None,
                source: "Orbit".into(),
                on_data_volume: true,
                drive_id: String::new(),
            },
            StorageItem {
                id: "game:ext".into(),
                name: "Cyberpunk 2077".into(),
                kind: StorageKind::Game,
                size_bytes: 70_000,
                installed_at: None,
                path: "/Volumes/T7/Orbit Games/steamapps/common/Cyberpunk 2077".into(),
                artwork: None,
                removal: StorageRemoval::Game {
                    app_id: "1091500".into(),
                },
                entry_id: Some("steam:1091500".into()),
                source: "Steam library".into(),
                on_data_volume: false,
                drive_id: String::new(),
            },
        ];
        assign_items_to_drives(&mut drives, &mut items, |item| {
            if item.path.starts_with("/Volumes/T7") {
                Some(2)
            } else {
                Some(1)
            }
        });
        assert_eq!(items[0].drive_id, THIS_MAC_DRIVE_ID);
        assert_eq!(items[1].drive_id, "/Volumes/T7");
        assert_eq!(drives[0].drive.totals.tools, 10_000);
        assert_eq!(drives[0].drive.orbit_bytes, 10_000);
        assert_eq!(drives[1].drive.totals.games, 70_000);
        assert_eq!(drives[1].drive.orbit_bytes, 70_000);
        let total_capacity: u64 = drives.iter().map(|d| d.drive.total_bytes).sum();
        let total_free: u64 = drives.iter().map(|d| d.drive.free_bytes).sum();
        assert_eq!(total_capacity, 2_500_000);
        assert_eq!(total_free, 1_600_000);
    }

    #[test]
    fn ignores_recovery_and_system_partitions() {
        for name in [
            "Recovery",
            "recovery",
            "Preboot",
            "VM",
            "Update",
            "macOS Base System",
            "Macintosh HD Recovery",
            "com.apple.TimeMachine.localsnapshots",
        ] {
            assert!(is_system_volume_name(name), "{name} should be ignored");
        }
        for name in ["SlowDrive", "Fast Drive", "T7", "Games SSD"] {
            assert!(!is_system_volume_name(name), "{name} should be shown");
        }
    }

    #[test]
    fn serializes_storage_removal_variants_and_fields_in_camel_case() {
        let game = serde_json::to_value(StorageRemoval::Game {
            app_id: "220440".into(),
        })
        .unwrap();
        assert_eq!(
            game,
            serde_json::json!({ "type": "game", "appId": "220440" })
        );

        let component = serde_json::to_value(StorageRemoval::Component {
            id: "dxvk".into(),
            version: "2.3".into(),
        })
        .unwrap();
        assert_eq!(
            component,
            serde_json::json!({ "type": "component", "id": "dxvk", "version": "2.3" })
        );

        let orbit_data = serde_json::to_value(StorageRemoval::OrbitData {
            paths: vec!["/Orbit/artwork-cache".into()],
        })
        .unwrap();
        assert_eq!(
            orbit_data,
            serde_json::json!({ "type": "orbitData", "paths": ["/Orbit/artwork-cache"] })
        );
    }
}
