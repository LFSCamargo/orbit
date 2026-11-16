//! GameHub wine-engine integration.
//!
//! GameHub (`com.gamemac.www`) ships a complete Windows-gaming stack on disk:
//! Proton-based Wine installations, per-game overlay containers, and graphics
//! components (D3DMetal/GPTK, DXMT, vkd3d-proton, zink). Orbit treats all of it
//! as *external, read-only state*: registries are parsed defensively, nothing is
//! written back, and GameHub's secrets (account tokens) are never read — only
//! the plain account name, and only when Orbit does not already know it.
//!
//! Launching inside a GameHub container reproduces the recipe GameHub itself
//! uses (verified against its per-launch logs): the container's Wine build, the
//! base-container overlay via `libsandboxfs.dylib` + a layer manifest, the
//! container's graphics-stack environment, and the in-container `steam.exe`
//! (GameHub's SteamAgent) with `--applaunch`. The GameHub application itself is
//! never started and its host RPC service is not required.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use anyhow::{bail, Context, Result};
use serde::Deserialize;

use crate::database::GameRepository;
use crate::models::{GameArtwork, GamePlatform, GameProvider, ImportedGame, LaunchConfiguration};
use crate::runtimes::detection::{probe, WineInstallation};
use crate::runtimes::{prefix, process, WineProfile};
use crate::services::steam_catalog;

/// Hard cap for every external registry read; these files are kilobytes in
/// practice and a runaway file must not be loaded.
const MAX_REGISTRY_BYTES: u64 = 8 * 1024 * 1024;
/// Layer manifests are tiny binaries; bound the scan used to pick one.
const MAX_MANIFEST_BYTES: u64 = 256 * 1024;
const MAX_MANIFEST_FILES: usize = 32;

// ---------------------------------------------------------------------------
// External registry shapes (untrusted: unknown fields ignored, all defaulted)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
struct InstallationsFile {
    #[serde(default)]
    wine_installations: BTreeMap<String, WineInstallationRecord>,
}

#[derive(Debug, Clone, Deserialize)]
struct WineInstallationRecord {
    #[serde(default)]
    version: String,
    #[serde(default)]
    install_status: String,
    #[serde(default)]
    install_path: String,
}

#[derive(Debug, Clone, Deserialize)]
struct BaseContainersFile {
    #[serde(default)]
    containers: BTreeMap<String, BaseContainerRecord>,
}

#[derive(Debug, Clone, Deserialize)]
struct BaseContainerRecord {
    #[serde(default)]
    prefix_path: String,
    #[serde(default)]
    wine_installation_id: String,
}

#[derive(Debug, Clone, Deserialize)]
struct VirtualContainersFile {
    #[serde(default)]
    virtual_containers: BTreeMap<String, VirtualContainerRecord>,
}

#[derive(Debug, Clone, Deserialize)]
struct VirtualContainerRecord {
    #[serde(default)]
    prefix_path: String,
    #[serde(default)]
    base_container_id: Option<String>,
    #[serde(default)]
    environment: BTreeMap<String, String>,
    #[serde(default)]
    graphics_stack_config: Option<GraphicsStackConfig>,
    #[serde(default)]
    moltenvk_config: Option<ComponentConfig>,
    #[serde(default)]
    sync_backend: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct GraphicsStackConfig {
    #[serde(default)]
    install_path: String,
    #[serde(default)]
    environment_template: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Deserialize)]
struct ComponentConfig {
    #[serde(default)]
    install_path: String,
    #[serde(default)]
    environment_template: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Deserialize)]
struct ContainerStoreFile {
    #[serde(default)]
    bindings: Vec<GameBindingRecord>,
}

#[derive(Debug, Clone, Deserialize)]
struct GameBindingRecord {
    #[serde(default)]
    game_name: String,
    #[serde(default)]
    platform: String,
    #[serde(default)]
    platform_app_id: Option<String>,
    #[serde(default)]
    virtual_container_id: String,
    #[serde(default)]
    base_container_id: Option<String>,
}

/// Only the account name is ever read from GameHub's account file. The token
/// fields are deliberately absent from this shape so they cannot be retained,
/// logged, or forwarded.
#[derive(Debug, Clone, Deserialize)]
struct GamehubAccountsFile {
    #[serde(default)]
    accounts: Vec<GamehubAccountEntry>,
}

#[derive(Debug, Clone, Deserialize)]
struct GamehubAccountEntry {
    #[serde(default)]
    account_name: Option<String>,
}

// ---------------------------------------------------------------------------
// Public model
// ---------------------------------------------------------------------------

/// A discovered GameHub wine-engine. All paths are absolute.
#[derive(Debug, Clone)]
pub struct GamehubEngine {
    /// `~/Library/Application Support/com.gamemac.www`
    pub support_root: PathBuf,
    /// `…/com.gamemac.www/wine-engine`
    pub root: PathBuf,
    /// GameHub.app's overlay library, loaded by path. The app is never run.
    pub sandboxfs: Option<PathBuf>,
}

/// A game bound to a GameHub container.
#[derive(Debug, Clone)]
pub struct GameBinding {
    pub game_name: String,
    pub platform_app_id: String,
    pub virtual_container_id: String,
    pub base_container_id: Option<String>,
}

/// Everything needed to spawn one launch inside a GameHub container.
#[derive(Debug, Clone)]
pub struct ContainerLaunchPlan {
    pub runtime: WineInstallation,
    pub prefix: PathBuf,
    pub base_prefix: Option<PathBuf>,
    /// Windows-side Steam directory inside the container, as a macOS path.
    pub steam_dir: PathBuf,
    /// Resolved launch environment (the verified GameHub recipe).
    pub env: BTreeMap<String, String>,
    /// Whether the copy-on-write overlay (sandboxfs + manifest) is active.
    pub overlay: bool,
}

impl GamehubEngine {
    /// Locate the engine. Returns `None` when GameHub is not installed or its
    /// engine directory is absent — a normal state, not an error.
    pub fn discover() -> Option<Self> {
        let support_root = dirs::data_dir()?.join("com.gamemac.www");
        let root = support_root.join("wine-engine");
        if !root.join("container/wine_installations.json").is_file() {
            return None;
        }
        Some(Self {
            support_root,
            root,
            sandboxfs: find_sandboxfs(),
        })
    }

    /// Discover against an explicit support root (tests and diagnostics).
    pub fn discover_in(support_root: &Path) -> Option<Self> {
        let root = support_root.join("wine-engine");
        if !root.join("container/wine_installations.json").is_file() {
            return None;
        }
        Some(Self {
            support_root: support_root.to_path_buf(),
            root,
            sandboxfs: find_sandboxfs(),
        })
    }

    fn store_path(&self) -> PathBuf {
        self.support_root.join("gamehub/game_container_store.json")
    }

    /// The Steam binding for one app id, if GameHub manages that game.
    pub fn binding_for_app_id(&self, app_id: &str) -> Option<GameBinding> {
        let file: ContainerStoreFile = read_json(&self.store_path()).ok()?;
        file.bindings.into_iter().find_map(|binding| {
            let id = binding.platform_app_id?;
            if id == app_id && binding.platform == "steam" {
                Some(GameBinding {
                    game_name: binding.game_name,
                    platform_app_id: id,
                    virtual_container_id: binding.virtual_container_id,
                    base_container_id: binding.base_container_id,
                })
            } else {
                None
            }
        })
    }

    /// Build the verified launch recipe for one bound game. Fails with a
    /// user-facing reason when the container, its Wine build, or the overlay
    /// pieces are missing.
    pub fn launch_plan(&self, binding: &GameBinding) -> Result<ContainerLaunchPlan> {
        let containers: VirtualContainersFile =
            read_json(&self.root.join("container/wine_virtual_containers.json"))
                .context("GameHub's container registry is unreadable")?;
        let container = containers
            .virtual_containers
            .get(&binding.virtual_container_id)
            .with_context(|| {
                format!(
                    "GameHub container {} for {} is missing",
                    binding.virtual_container_id, binding.game_name
                )
            })?;
        let prefix = PathBuf::from(&container.prefix_path);
        if !prefix.is_dir() {
            bail!(
                "GameHub's container for {} no longer exists",
                binding.game_name
            );
        }

        let bases: BaseContainersFile =
            read_json(&self.root.join("container/wine_containers.json"))
                .context("GameHub's base-container registry is unreadable")?;
        let installations: InstallationsFile =
            read_json(&self.root.join("container/wine_installations.json"))
                .context("GameHub's Wine registry is unreadable")?;

        // binding.base_container_id wins; the container record is the fallback.
        let base_id = binding
            .base_container_id
            .clone()
            .or_else(|| container.base_container_id.clone());
        let base = base_id
            .as_ref()
            .and_then(|id| bases.containers.get(id))
            .context("GameHub's base container for this game is missing")?;
        let installation = installations
            .wine_installations
            .get(&base.wine_installation_id)
            .context("GameHub's Wine installation for this game is missing")?;
        if installation.install_status != "completed" {
            bail!(
                "GameHub's Wine installation for {} is still {}",
                binding.game_name,
                installation.install_status
            );
        }
        let wine = PathBuf::from(&installation.install_path).join("bin/wine");
        let runtime = probe(&wine).with_context(|| {
            format!(
                "GameHub's Wine build at {} cannot run (Rosetta 2 may be missing)",
                installation.install_path
            )
        })?;

        let steam_dir = prefix.join("drive_c/Program Files (x86)/Steam");
        if !steam_dir.join("steam.exe").exists() {
            bail!(
                "GameHub's container for {} has no Steam client",
                binding.game_name
            );
        }

        let base_prefix = (!base.prefix_path.is_empty()).then(|| PathBuf::from(&base.prefix_path));
        let mut env = BTreeMap::new();

        // Container-level environment (${WINE_PATH} → the Wine installation).
        for (key, value) in &container.environment {
            env.insert(
                key.clone(),
                value.replace("${WINE_PATH}", &installation.install_path),
            );
        }
        // Graphics stack (GPTK/DXMT): WINEDLLPATH, libd3dshared, …
        if let Some(graphics) = &container.graphics_stack_config {
            for (key, value) in &graphics.environment_template {
                env.insert(
                    key.clone(),
                    value.replace("${COMPONENT_PATH}", &graphics.install_path),
                );
            }
        }
        // MoltenVK ICD for Vulkan titles.
        if let Some(moltenvk) = &container.moltenvk_config {
            for (key, value) in &moltenvk.environment_template {
                env.insert(
                    key.clone(),
                    value.replace("${COMPONENT_PATH}", &moltenvk.install_path),
                );
            }
        }
        // zink (OpenGL over Vulkan) when the engine ships the provider.
        if let Some(zink) = self.zink_component() {
            let lib = zink.join("external/lib");
            if lib.join("libwine_mesa_zink.dylib").is_file() {
                env.insert("WINE_MAC_OPENGL_BACKEND".into(), "zink".into());
                env.insert(
                    "WINE_MAC_ZINK_PROVIDER".into(),
                    lib.join("libwine_mesa_zink.dylib")
                        .to_string_lossy()
                        .into_owned(),
                );
                if lib.join("libvulkan.1.dylib").is_file() {
                    env.insert(
                        "WINE_SONAME_LIBVULKAN".into(),
                        lib.join("libvulkan.1.dylib").to_string_lossy().into_owned(),
                    );
                }
                env.insert("GALLIUM_DRIVER".into(), "zink".into());
                env.insert("MESA_LOADER_DRIVER_OVERRIDE".into(), "zink".into());
            }
        }

        // Fixed pieces of the verified recipe.
        env.insert("WINEARCH".into(), "win64".into());
        if container
            .sync_backend
            .as_deref()
            .is_some_and(|backend| backend.eq_ignore_ascii_case("MSYNC"))
        {
            env.insert("WINEMSYNC".into(), "1".into());
        }
        env.insert("D3DM_MTL4".into(), "1".into());
        env.insert("D3DM_SUPPORT_DXR".into(), "0".into());
        env.insert("ROSETTA_ADVERTISE_AVX".into(), "1".into());
        env.insert(
            "DYLD_FALLBACK_LIBRARY_PATH".into(),
            format!(
                "{0}/lib:{0}/lib/wine/x86_64-unix",
                installation.install_path
            ),
        );

        // Copy-on-write overlay: without it the container is missing every file
        // that lives only in the base container.
        let overlay = match (&self.sandboxfs, &base_prefix) {
            (Some(sandboxfs), Some(base)) => match select_layer_manifest(&prefix, base) {
                Some(manifest) => {
                    env.insert(
                        "DYLD_INSERT_LIBRARIES".into(),
                        sandboxfs.to_string_lossy().into_owned(),
                    );
                    env.insert(
                        "SANDBOXFS_LIB_PATH".into(),
                        sandboxfs.to_string_lossy().into_owned(),
                    );
                    env.insert(
                        "SANDBOXFS_LAYER_MANIFEST".into(),
                        manifest.to_string_lossy().into_owned(),
                    );
                    true
                }
                None => false,
            },
            _ => false,
        };
        if !overlay {
            bail!(
                "GameHub's container overlay for {} is unavailable. Open the game once in GameHub, or keep GameHub.app installed",
                binding.game_name
            );
        }

        Ok(ContainerLaunchPlan {
            runtime,
            prefix,
            base_prefix,
            steam_dir,
            env,
            overlay,
        })
    }

    /// The zink provider directory shipped inside the engine, when present.
    pub fn zink_component(&self) -> Option<PathBuf> {
        let dir = self.root.join("downloads/opengl-zink");
        dir.is_dir().then_some(dir)
    }

    /// True when any live process references this container prefix. Prevents
    /// fighting a GameHub (or previous Orbit) session over one wineserver.
    pub fn container_busy(prefix: &Path) -> bool {
        container_busy_from(&process_table(), prefix)
    }
}

fn find_sandboxfs() -> Option<PathBuf> {
    for root in [
        PathBuf::from("/Applications"),
        dirs::home_dir()?.join("Applications"),
    ] {
        let candidate = root.join("GameHub.app/Contents/Resources/libsandboxfs.dylib");
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn process_table() -> String {
    let Ok(output) = std::process::Command::new("ps")
        .args(["axeww", "-o", "command="])
        .output()
    else {
        return String::new();
    };
    if output.stdout.len() > 8 * 1024 * 1024 {
        return String::new();
    }
    String::from_utf8_lossy(&output.stdout).into_owned()
}

fn container_busy_from(processes: &str, prefix: &Path) -> bool {
    let needle = prefix.to_string_lossy();
    !needle.is_empty() && processes.contains(needle.as_ref())
}

/// Read a bounded external JSON file. Anything oversized or unparsable is an
/// error the caller turns into a user-facing message; it is never a panic.
fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T> {
    let metadata =
        std::fs::metadata(path).with_context(|| format!("Cannot read {}", path.display()))?;
    if metadata.len() > MAX_REGISTRY_BYTES {
        bail!("{} is larger than Orbit will read", path.display());
    }
    let bytes = std::fs::read(path).with_context(|| format!("Cannot read {}", path.display()))?;
    serde_json::from_slice(&bytes).with_context(|| format!("Cannot parse {}", path.display()))
}

/// Pick the layer manifest GameHub generated for this container + base pair.
/// Manifests embed absolute layer roots, so the right one is the newest file
/// that references the base prefix. Bounded: ≤32 files × ≤256 KiB.
fn select_layer_manifest(prefix: &Path, base: &Path) -> Option<PathBuf> {
    let dir = prefix.join(".gamehub/layer-manifests");
    let entries = std::fs::read_dir(&dir).ok()?;
    let needle = base.to_string_lossy().into_owned();
    let mut candidates: Vec<(std::time::SystemTime, PathBuf)> = Vec::new();
    for entry in entries.flatten().take(MAX_MANIFEST_FILES) {
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("bin") {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let Ok(modified) = metadata.modified() else {
            continue;
        };
        candidates.push((modified, path));
    }
    candidates.sort_by_key(|pair| std::cmp::Reverse(pair.0));
    for (_, path) in &candidates {
        if let Ok(bytes) = std::fs::read(path) {
            if bytes.len() as u64 <= MAX_MANIFEST_BYTES
                && String::from_utf8_lossy(&bytes).contains(&needle)
            {
                return Some(path.clone());
            }
        }
    }
    None
}
/// The Steam account name for `--username`. Orbit's own stored account wins;
/// otherwise only the `account_name` field is read from GameHub's accounts
/// file. Token fields are not part of the parsed shape and are never retained.
pub fn steam_account_name(repo: &GameRepository, engine: &GamehubEngine) -> Option<String> {
    if let Ok(Some(name)) = super::steam_windows::stored_account(repo) {
        if crate::utils::steam_account::valid_account_name(&name) {
            return Some(name);
        }
    }
    let path = engine.support_root.join("steam-client/accounts.json");
    let file: GamehubAccountsFile = read_json(&path).ok()?;
    file.accounts.into_iter().find_map(|account| {
        account.account_name.filter(|name| {
            !name.is_empty()
                && name.len() <= 64
                && name.chars().all(|character| {
                    character.is_ascii_alphanumeric() || matches!(character, '_' | '-' | '.' | '@')
                })
        })
    })
}

/// The exact argument vector verified against GameHub's own launch logs.
pub fn steam_agent_args(app_id: &str, account: &str) -> Vec<String> {
    let mut args = vec!["C:\\Program Files (x86)\\Steam\\steam.exe".to_string()];
    if !account.is_empty() {
        args.push("--username".into());
        args.push(account.into());
    }
    args.extend([
        "--offline".to_string(),
        "--rememberme".to_string(),
        "--launchoption".to_string(),
        "0".to_string(),
        "--runinstallscript".to_string(),
        "--disablecloud".to_string(),
        "--disablesteaminput".to_string(),
        "--skip-appinfo-refresh".to_string(),
        "--applaunch".to_string(),
        app_id.to_string(),
    ]);
    args
}

/// Spawn one launch inside a GameHub container. The returned process tracks the
/// whole container: exit is bounded by the container's wineserver, and stopping
/// terminates every process in that prefix — the same semantics GameHub uses.
pub fn start_title(
    plan: &ContainerLaunchPlan,
    game_id: &str,
    app_id: &str,
    account: &str,
    cancel: &AtomicBool,
    progress: &mut impl FnMut(&str),
) -> Result<Box<dyn crate::runtimes::RuntimeProcess>> {
    if !crate::services::steam_download::valid_app_id(app_id) {
        bail!("This game's Steam id must be a number");
    }
    if account.is_empty() {
        bail!(
            "Orbit needs the Steam account name for GameHub's container. Sign in once in GameHub or in Settings → Steam"
        );
    }
    if cancel.load(Ordering::Relaxed) {
        bail!("Launch cancelled");
    }
    progress("prefix");
    let dir = prefix::game_directory(&crate::runtimes::root(), game_id)?;
    let log = process::log_file(&dir.join("latest.log"))?;

    progress("spawn");
    let mut command = process::base_command(Path::new(&plan.runtime.path));
    command
        .env("WINEPREFIX", &plan.prefix)
        .env("WINEDEBUG", "-all")
        .env("LANG", "en_US.UTF-8")
        .env("LC_ALL", "en_US.UTF-8")
        .env("SteamAppId", app_id)
        .env("SteamGameId", app_id);
    if let Some(base) = &plan.base_prefix {
        command.env("WINEPREFIX_BASE", base);
    }
    if let Some(bin) = Path::new(&plan.runtime.path).parent() {
        let mut path = bin.as_os_str().to_owned();
        path.push(":/usr/bin:/bin:/usr/sbin:/sbin");
        command
            .env("PATH", path)
            .env("WINESERVER", bin.join("wineserver"))
            .env("WINELOADER", &plan.runtime.path);
    }
    for (key, value) in &plan.env {
        command.env(key, value);
    }
    command.args(steam_agent_args(app_id, account));
    command.current_dir(&plan.steam_dir);

    let child = process::spawn_logged(&mut process::detached(&command)?, &log)?;
    Ok(crate::runtimes::wine::foreign_process(
        child,
        plan.runtime.clone(),
        plan.prefix.clone(),
    ))
}

/// The pure routing decision, split out so the matrix is testable without a
/// real engine on disk.
pub(crate) enum RouteDecision {
    /// Launch inside the GameHub container.
    Gamehub,
    /// Use Orbit's own Steam for Windows path.
    Orbit,
    /// GameHub was explicitly requested but cannot serve this game.
    Fail(String),
}

pub(crate) fn route_decision(
    preference: super::steam_windows::PlayEngine,
    engine_available: bool,
    binding_available: bool,
) -> RouteDecision {
    use super::steam_windows::PlayEngine;
    match preference {
        PlayEngine::Orbit => RouteDecision::Orbit,
        PlayEngine::Auto => {
            if engine_available && binding_available {
                RouteDecision::Gamehub
            } else {
                RouteDecision::Orbit
            }
        }
        PlayEngine::Gamehub => {
            if engine_available && binding_available {
                RouteDecision::Gamehub
            } else if !engine_available {
                RouteDecision::Fail(
                    "No GameHub engine was found. Install GameHub or switch Play engine to Orbit"
                        .into(),
                )
            } else {
                RouteDecision::Fail(
                    "GameHub does not manage this game. Install it in GameHub first or switch Play engine to Orbit".into(),
                )
            }
        }
    }
}

/// Cheap health view for the settings UI. Deliberately does NOT probe Wine
/// binaries (that spawns processes); it only checks the filesystem facts the
/// launch plan requires.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GamehubStatus {
    pub available: bool,
    /// GameHub.app's overlay library was found, so container launches work.
    pub overlay_ready: bool,
    pub bindings: Vec<GamehubBindingStatus>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GamehubBindingStatus {
    pub game_name: String,
    pub app_id: String,
    /// Container prefix, its Wine build, and its Steam client all exist.
    pub container_ready: bool,
    /// A live process currently references the container prefix.
    pub busy: bool,
}

impl GamehubEngine {
    /// Enumerate every Steam binding with a cheap readiness check.
    pub fn status(&self) -> GamehubStatus {
        let mut bindings = Vec::new();
        if let Ok(file) = read_json::<ContainerStoreFile>(&self.store_path()) {
            for record in file.bindings.into_iter().take(64) {
                if record.platform != "steam" {
                    continue;
                }
                let Some(app_id) = record.platform_app_id else {
                    continue;
                };
                let binding = GameBinding {
                    game_name: record.game_name.clone(),
                    platform_app_id: app_id.clone(),
                    virtual_container_id: record.virtual_container_id.clone(),
                    base_container_id: record.base_container_id.clone(),
                };
                let (ready, busy) = self.binding_health(&binding);
                bindings.push(GamehubBindingStatus {
                    game_name: record.game_name,
                    app_id,
                    container_ready: ready,
                    busy,
                });
            }
        }
        GamehubStatus {
            available: true,
            overlay_ready: self.sandboxfs.is_some(),
            bindings,
        }
    }

    fn binding_health(&self, binding: &GameBinding) -> (bool, bool) {
        let ready = (|| -> Option<bool> {
            let containers: VirtualContainersFile =
                read_json(&self.root.join("container/wine_virtual_containers.json")).ok()?;
            let container = containers
                .virtual_containers
                .get(&binding.virtual_container_id)?;
            let prefix = Path::new(&container.prefix_path);
            if !prefix
                .join("drive_c/Program Files (x86)/Steam/steam.exe")
                .exists()
            {
                return Some(false);
            }
            let bases: BaseContainersFile =
                read_json(&self.root.join("container/wine_containers.json")).ok()?;
            let base_id = binding
                .base_container_id
                .clone()
                .or_else(|| container.base_container_id.clone())?;
            let base = bases.containers.get(&base_id)?;
            let installations: InstallationsFile =
                read_json(&self.root.join("container/wine_installations.json")).ok()?;
            let installation = installations
                .wine_installations
                .get(&base.wine_installation_id)?;
            Some(
                installation.install_status == "completed"
                    && Path::new(&installation.install_path)
                        .join("bin/wine")
                        .is_file(),
            )
        })()
        .unwrap_or(false);
        let busy = if ready {
            read_json::<VirtualContainersFile>(
                &self.root.join("container/wine_virtual_containers.json"),
            )
            .ok()
            .and_then(|file| {
                file.virtual_containers
                    .get(&binding.virtual_container_id)
                    .map(|container| PathBuf::from(&container.prefix_path))
            })
            .is_some_and(|prefix| Self::container_busy(&prefix))
        } else {
            false
        };
        (ready, busy)
    }
}

/// Why a GameHub library record cannot be created.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GamehubRecordError {
    /// No engine or no binding for this app. `Auto` should fall back to Orbit's
    /// own Steam path instead of failing.
    NotApplicable,
    /// Engine and binding exist but the record cannot be created. Both `Auto`
    /// and `Gamehub` preferences should surface this error.
    Failed(String),
}

/// Ensure a library record exists for a Steam Windows title managed by GameHub.
/// Returns `(game_id, title)` on success. The record uses GameHub's Wine
/// runtime and the in-container Steam executable as placeholders; the launch
/// session overrides them with the full container plan.
pub fn ensure_steam_record(
    repo: &GameRepository,
    app_id: &str,
) -> Result<(String, String), GamehubRecordError> {
    ensure_steam_record_with(GamehubEngine::discover(), repo, app_id)
}

pub(crate) fn ensure_steam_record_with(
    engine: Option<GamehubEngine>,
    repo: &GameRepository,
    app_id: &str,
) -> Result<(String, String), GamehubRecordError> {
    let engine = engine.ok_or(GamehubRecordError::NotApplicable)?;
    let binding = engine
        .binding_for_app_id(app_id)
        .ok_or(GamehubRecordError::NotApplicable)?;
    let plan = engine
        .launch_plan(&binding)
        .map_err(|err| GamehubRecordError::Failed(format!("{err:#}")))?;
    let title = binding.game_name;
    let imported = ImportedGame {
        stable_key: format!("steam-windows:{app_id}"),
        title: title.clone(),
        sort_title: title.to_lowercase(),
        description: None,
        provider: GameProvider::Steam,
        platform: GamePlatform::Windows,
        source_id: Some(app_id.to_string()),
        launch_config: LaunchConfiguration::Wine {
            profile: WineProfile {
                executable: plan
                    .steam_dir
                    .join("steam.exe")
                    .to_string_lossy()
                    .into_owned(),
                runtime_path: plan.runtime.path.clone(),
                ..WineProfile::default()
            },
        },
        artwork: GameArtwork {
            cover: Some(steam_catalog::cover_url(app_id)),
            hero: Some(steam_catalog::hero_url(app_id)),
            logo: Some(steam_catalog::logo_url(app_id)),
            icon: None,
        },
        total_playtime_seconds: 0,
        install_size_bytes: None,
        achievements: Vec::new(),
    };
    let upserted = repo
        .upsert_imported(&[imported])
        .map_err(|err| GamehubRecordError::Failed(err.to_string()))?;
    upserted
        .game_ids
        .into_iter()
        .next()
        .ok_or_else(|| GamehubRecordError::Failed("The game could not be saved".into()))
        .map(|id| (id, title))
}

/// Decide whether a Steam Windows play request should take the GameHub route.
/// `None` means "not applicable — use Orbit's own Steam path".
pub fn play_route(
    repo: &GameRepository,
    app_id: &str,
    preference: super::steam_windows::PlayEngine,
) -> Option<Result<(GamehubEngine, GameBinding, ContainerLaunchPlan, String)>> {
    if preference == super::steam_windows::PlayEngine::Orbit {
        return None;
    }
    let engine = GamehubEngine::discover()?;
    let binding = engine.binding_for_app_id(app_id);
    match route_decision(preference, true, binding.is_some()) {
        RouteDecision::Orbit => return None,
        RouteDecision::Fail(message) => return Some(Err(anyhow::anyhow!(message))),
        RouteDecision::Gamehub => {}
    }
    let binding = binding.expect("route_decision checked binding availability");
    Some(engine.launch_plan(&binding).and_then(
        |plan| -> Result<(GamehubEngine, GameBinding, ContainerLaunchPlan, String)> {
            if GamehubEngine::container_busy(&plan.prefix) {
                bail!(
                    "{} is already running in its GameHub container. Close it first",
                    binding.game_name
                );
            }
            let account = steam_account_name(repo, &engine).unwrap_or_default();
            Ok((engine, binding, plan, account))
        },
    ))
}

#[cfg(test)]
mod tests;
