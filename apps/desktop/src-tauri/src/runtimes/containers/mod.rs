//! Orbit-owned Wine containers: one base prefix per Wine install, then a
//! cheap per-game clone. Live steam-windows data is never deleted.
use anyhow::{bail, Context, Result};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{atomic::AtomicBool, Arc, Mutex},
};

use super::{detection::WineInstallation, prefix};

pub mod clone;
pub mod graphics;
pub mod layout;
pub mod manifest;
pub mod recipes;
pub mod steam;

use layout::{directory, prefix_ready, wine_key};
use manifest::ContainerManifest;

pub struct Container {
    pub prefix: PathBuf,
    pub dir: PathBuf,
    pub manifest: ContainerManifest,
}

pub fn root_in(runtimes_root: &Path) -> PathBuf {
    runtimes_root.join("containers")
}

/// Prepare a per-game container. `seed` is an existing ready prefix (a previous
/// per-game bottle or the signed-in steam-windows prefix). When it is missing,
/// the base container is winebooted once and cloned.
pub fn prepare_game(
    runtimes_root: &Path,
    game_id: &str,
    runtime: &WineInstallation,
    seed: Option<&Path>,
    cancel: &AtomicBool,
    log: &Arc<Mutex<fs::File>>,
) -> Result<Container> {
    layout::validate_id(game_id)?;
    let root = root_in(runtimes_root);
    let key = wine_key(runtime);
    let dir = directory(&root, "games", game_id)?;
    let prefix_path = dir.join("prefix");
    if prefix_path
        .symlink_metadata()
        .is_ok_and(|meta| meta.file_type().is_symlink())
    {
        bail!("Managed prefix cannot be a symlink");
    }
    if prefix_ready(&prefix_path) {
        drop_outside_links(&prefix_path)?;
        // A ready prefix holds the player's saves and settings, so it is kept
        // when the Wine changes: Wine updates an existing prefix on its next
        // start. Only the manifest follows the new Wine.
        let manifest = match ContainerManifest::read(&dir)? {
            Some(existing) if existing.wine_key == key => existing,
            existing => {
                let manifest = ContainerManifest {
                    game_id: game_id.to_string(),
                    wine_key: key,
                    wine_version: runtime.version.clone(),
                    steam_seeded: existing.map_or_else(
                        || steam::has_steam(&prefix_path),
                        |existing| existing.steam_seeded,
                    ),
                };
                manifest.write(&dir)?;
                manifest
            }
        };
        return Ok(Container {
            prefix: prefix_path,
            dir,
            manifest,
        });
    }
    let source = resolve_source(&root, runtime, seed, cancel, log)?;
    if prefix_path.exists() {
        let _ = super::wine::stop_prefix(runtime, &prefix_path);
        fs::remove_dir_all(&prefix_path)
            .context("Could not replace the previous Windows environment")?;
    }
    clone::clone_tree(&source, &prefix_path)?;
    if !prefix_ready(&prefix_path) {
        bail!("Wine environment setup failed. See runtime diagnostics");
    }
    let manifest = ContainerManifest {
        game_id: game_id.to_string(),
        wine_key: key,
        wine_version: runtime.version.clone(),
        steam_seeded: steam::has_steam(&prefix_path),
    };
    manifest.write(&dir)?;
    Ok(Container {
        prefix: prefix_path,
        dir,
        manifest,
    })
}

/// Remove system DLL symlinks that leave the prefix. Earlier builds linked
/// graphics DLLs from shared components, and Wine's prefix update writes
/// through such links into the component. Graphics re-copy them before play.
fn drop_outside_links(prefix: &Path) -> Result<()> {
    for dir in ["drive_c/windows/system32", "drive_c/windows/syswow64"] {
        let Ok(entries) = fs::read_dir(prefix.join(dir)) else {
            continue;
        };
        for entry in entries.flatten().take(8192) {
            let path = entry.path();
            let is_link = entry.file_type().is_ok_and(|kind| kind.is_symlink());
            if is_link && fs::read_link(&path).is_ok_and(|target| !target.starts_with(prefix)) {
                fs::remove_file(&path)
                    .with_context(|| format!("Could not detach {}", path.display()))?;
            }
        }
    }
    Ok(())
}

/// Whether the base container for this Wine (the prefix new game containers
/// are cloned from) is ready.
pub fn base_ready(runtimes_root: &Path, runtime: &WineInstallation) -> bool {
    directory(&root_in(runtimes_root), "bases", &wine_key(runtime))
        .is_ok_and(|base| prefix_ready(&base.join("prefix")))
}

/// Prepares the base container for this Wine ahead of a game's first Play.
pub fn prepare_base(
    runtimes_root: &Path,
    runtime: &WineInstallation,
    cancel: &AtomicBool,
    log: &Arc<Mutex<fs::File>>,
) -> Result<PathBuf> {
    resolve_source(&root_in(runtimes_root), runtime, None, cancel, log)
}

fn resolve_source(
    root: &Path,
    runtime: &WineInstallation,
    seed: Option<&Path>,
    cancel: &AtomicBool,
    log: &Arc<Mutex<fs::File>>,
) -> Result<PathBuf> {
    if let Some(seed) = seed.filter(|path| prefix_ready(path)) {
        return Ok(seed.to_path_buf());
    }
    let base = directory(root, "bases", &wine_key(runtime))?;
    if prefix_ready(&base.join("prefix")) {
        return Ok(base.join("prefix"));
    }
    prefix::prepare(&base, runtime, cancel, log)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtimes::process;

    fn fake_prefix(path: &Path) {
        fs::create_dir_all(path.join("drive_c")).unwrap();
        fs::write(path.join("system.reg"), b"reg").unwrap();
    }

    #[test]
    fn clones_a_seed_prefix_and_reuses_it_on_the_next_prepare() {
        let root = std::env::temp_dir().join(format!("orbit-container-{}", uuid::Uuid::new_v4()));
        let seed = root.join("seed");
        fake_prefix(&seed);
        let runtime = WineInstallation {
            path: "/wine/bin/wine".into(),
            server_path: "/wine/bin/wineserver".into(),
            version: "wine-10.0".into(),
        };
        let log = process::log_file(&root.join("latest.log")).unwrap();
        let first = prepare_game(
            &root,
            "game-1",
            &runtime,
            Some(&seed),
            &AtomicBool::new(false),
            &log,
        )
        .unwrap();
        assert!(first.prefix.join("system.reg").is_file());
        assert_eq!(fs::read(seed.join("system.reg")).unwrap(), b"reg");
        fs::write(first.prefix.join("system.reg"), b"game").unwrap();
        let second = prepare_game(
            &root,
            "game-1",
            &runtime,
            Some(&seed),
            &AtomicBool::new(false),
            &log,
        )
        .unwrap();
        assert_eq!(second.prefix, first.prefix);
        assert_eq!(fs::read(second.prefix.join("system.reg")).unwrap(), b"game");
        // Regression: Wine's update wrote through a system32 link into a
        // shared component (GPTK's DLLs became Wine stubs).
        let component = root.join("component-d3d11.dll");
        fs::write(&component, b"PE").unwrap();
        let system32 = first.prefix.join("drive_c/windows/system32");
        fs::create_dir_all(&system32).unwrap();
        std::os::unix::fs::symlink(&component, system32.join("d3d11.dll")).unwrap();
        // Regression: a Wine change deleted this prefix and the saves in it.
        let save = first
            .prefix
            .join("drive_c/users/player/Saved Games/slot.bin");
        fs::create_dir_all(save.parent().unwrap()).unwrap();
        fs::write(&save, b"progress").unwrap();
        let newer = WineInstallation {
            path: "/orbit-wine/bin/wine".into(),
            server_path: "/orbit-wine/bin/wineserver".into(),
            version: "wine-11.0".into(),
        };
        let switched = prepare_game(
            &root,
            "game-1",
            &newer,
            Some(&seed),
            &AtomicBool::new(false),
            &log,
        )
        .unwrap();
        assert_eq!(fs::read(&save).unwrap(), b"progress");
        assert!(system32.join("d3d11.dll").symlink_metadata().is_err());
        assert_eq!(fs::read(&component).unwrap(), b"PE");
        assert_eq!(switched.manifest.wine_key, wine_key(&newer));
        assert_eq!(
            ContainerManifest::read(&switched.dir)
                .unwrap()
                .unwrap()
                .wine_key,
            wine_key(&newer)
        );
        let other = prepare_game(
            &root,
            "game-2",
            &runtime,
            Some(&seed),
            &AtomicBool::new(false),
            &log,
        )
        .unwrap();
        assert_eq!(fs::read(other.prefix.join("system.reg")).unwrap(), b"reg");
        let _ = fs::remove_dir_all(root);
    }
}
