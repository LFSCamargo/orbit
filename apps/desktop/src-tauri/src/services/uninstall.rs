//! Removes Steam games Orbit downloaded. Only Orbit's own install folders are
//! touched: the per-game container `install/` (and, on request, its `prefix/`)
//! plus the legacy `steam-windows/games/<appid>/`. The shared Steam client
//! prefix and any prefix holding a Steam sign-in are never deleted.
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::database::GameRepository;
use crate::models::LaunchConfiguration;
use crate::services::steam_download::valid_app_id;

#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UninstallReport {
    pub removed_bytes: i64,
    /// True when saves were asked to go but the prefix holds a Steam sign-in.
    pub kept_prefix: bool,
}

/// Folders one uninstall may delete, each paired with the root it must stay inside.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemovalPlan {
    pub installs: Vec<(PathBuf, PathBuf)>,
    pub prefix: Option<(PathBuf, PathBuf)>,
    /// Steam appmanifests to drop with a library install, each with its `steamapps`.
    pub manifests: Vec<(PathBuf, PathBuf)>,
}

impl RemovalPlan {
    /// True when at least one game folder in the plan is on disk.
    pub fn finds_game_files(&self) -> bool {
        self.installs
            .iter()
            .any(|(target, _)| fs::symlink_metadata(target).is_ok())
    }
}

pub fn removal_plan(
    runtimes_root: &Path,
    steam_session: &Path,
    app_id: &str,
    delete_prefix: bool,
) -> Result<RemovalPlan, String> {
    if !valid_app_id(app_id) {
        return Err("Steam app id must be a number".into());
    }
    let games = crate::runtimes::containers::root_in(runtimes_root).join("games");
    let container = games.join(format!("steam-{app_id}"));
    let legacy_root = steam_session.join("games");
    Ok(RemovalPlan {
        installs: vec![
            (container.join("install"), games.clone()),
            (legacy_root.join(app_id), legacy_root),
        ],
        prefix: delete_prefix.then(|| (container.join("prefix"), games)),
        manifests: Vec::new(),
    })
}

/// Adds a Windows game installed in a Steam library folder Orbit reads
/// (`<library>/steamapps/common`). The folder comes from the app's own
/// appmanifest and must hold a Windows executable, so a Mac Steam game or an
/// unrelated folder is never chosen. Libraries inside `steam-windows` stay
/// untouched (preserve-user-data). O(l) over libraries.
pub fn add_library_installs(
    plan: &mut RemovalPlan,
    libraries: &[String],
    steam_session: &Path,
    app_id: &str,
) {
    let protected = steam_session.canonicalize().ok();
    for library in libraries {
        let common = Path::new(library);
        let Ok(common) = common.canonicalize() else {
            continue;
        };
        if protected
            .as_ref()
            .is_some_and(|root| common.starts_with(root))
        {
            continue;
        }
        let Some(steamapps) = common.parent() else {
            continue;
        };
        let manifest = steamapps.join(format!("appmanifest_{app_id}.acf"));
        let Some(installdir) = crate::services::steam_manifest::installdir_in(&manifest, app_id)
        else {
            continue;
        };
        let target = common.join(&installdir);
        let windows_game = target
            .canonicalize()
            .ok()
            .and_then(|dir| crate::services::steam_download::find_game_executable(&dir))
            .is_some();
        if !windows_game || plan.installs.iter().any(|(known, _)| *known == target) {
            continue;
        }
        plan.installs.push((target, common.clone()));
        plan.manifests.push((manifest, steamapps.to_path_buf()));
    }
}

/// Adds Wine installations recorded for `app_id` in the library when their
/// folder is uninstallable (Orbit-managed or inside a `steamapps/common`
/// library outside `steam-windows`), even if the library is no longer listed in
/// preferences or has no `appmanifest_<app_id>.acf`. O(e · i).
pub fn add_entry_installs(
    plan: &mut RemovalPlan,
    entries: &[crate::services::library::LibraryEntry],
    steam_session: &Path,
    app_id: &str,
) {
    let protected = steam_session.canonicalize().ok();
    for entry in entries
        .iter()
        .filter(|entry| entry.steam_app_id.as_deref() == Some(app_id))
    {
        for install in entry
            .installations
            .iter()
            .filter(|install| install.launch_type == "wine")
        {
            let Some(path) = install.path.as_deref() else {
                continue;
            };
            if !crate::services::library::is_uninstallable(Some(path)) {
                continue;
            }
            let Some(lexical) = crate::services::install_roots::lexical_root(Path::new(path))
            else {
                continue;
            };
            let Ok(target) = lexical.canonicalize() else {
                continue;
            };
            if protected
                .as_ref()
                .is_some_and(|root| target.starts_with(root))
            {
                continue;
            }
            let Some(parent) = target.parent().map(Path::to_path_buf) else {
                continue;
            };
            if target == parent {
                continue;
            }
            if !plan.installs.iter().any(|(known, _)| *known == target) {
                plan.installs.push((target.clone(), parent.clone()));
            }
            let is_common = parent
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name == "common");
            if is_common {
                if let Some(steamapps) = parent.parent() {
                    if steamapps
                        .file_name()
                        .and_then(|name| name.to_str())
                        .is_some_and(|name| name.eq_ignore_ascii_case("steamapps"))
                    {
                        let manifest = steamapps.join(format!("appmanifest_{app_id}.acf"));
                        if manifest.is_file()
                            && !plan.manifests.iter().any(|(known, _)| *known == manifest)
                        {
                            plan.manifests.push((manifest, steamapps.to_path_buf()));
                        }
                    }
                }
            }
        }
    }
}

/// Deletes one appmanifest only when it is the file in that `steamapps`.
fn remove_manifest(manifest: &Path, steamapps: &Path) -> Result<(), String> {
    let (Some(parent), Ok(steamapps)) = (manifest.parent(), steamapps.canonicalize()) else {
        return Ok(());
    };
    if !manifest.is_file() {
        return Ok(());
    }
    let is_manifest = manifest
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.starts_with("appmanifest_") && name.ends_with(".acf"));
    if !is_manifest || parent.canonicalize().ok().as_ref() != Some(&steamapps) {
        return Err("Refusing to delete a file outside the Steam library".into());
    }
    fs::remove_file(manifest).map_err(|err| err.to_string())
}

/// A prefix with Steam or a saved login stays, per preserve-user-data.
pub fn prefix_holds_steam_login(prefix: &Path) -> bool {
    let steam = crate::runtimes::containers::steam::steam_root(prefix);
    steam.join("steam.exe").is_file() || steam.join("config/loginusers.vdf").is_file()
}

/// Deletes `target` only when it resolves strictly inside `root`. A symlinked
/// target is unlinked, never followed. Returns the bytes freed.
pub fn remove_within(target: &Path, root: &Path) -> Result<i64, String> {
    let Ok(meta) = fs::symlink_metadata(target) else {
        return Ok(0);
    };
    let root = root
        .canonicalize()
        .map_err(|_| "Orbit's install folder is missing".to_string())?;
    let parent = target
        .parent()
        .and_then(|parent| parent.canonicalize().ok())
        .ok_or("The install folder could not be resolved")?;
    let name = target.file_name().ok_or("The install folder has no name")?;
    let resolved = parent.join(name);
    if !resolved.starts_with(&root) || resolved == root {
        return Err("Refusing to delete a folder outside Orbit's game installs".into());
    }
    if meta.file_type().is_symlink() {
        fs::remove_file(&resolved).map_err(|err| err.to_string())?;
        return Ok(0);
    }
    let bytes = crate::utils::size::path_size_bytes(&resolved).unwrap_or(0);
    fs::remove_dir_all(&resolved).map_err(|err| err.to_string())?;
    Ok(bytes)
}

/// Runs a removal plan. O(f) over the files deleted.
pub fn execute(plan: &RemovalPlan) -> Result<UninstallReport, String> {
    let mut report = UninstallReport::default();
    for (target, root) in &plan.installs {
        report.removed_bytes += remove_within(target, root)?;
    }
    for (manifest, steamapps) in &plan.manifests {
        remove_manifest(manifest, steamapps)?;
    }
    if let Some((prefix, root)) = &plan.prefix {
        if prefix_holds_steam_login(prefix) {
            report.kept_prefix = true;
        } else {
            report.removed_bytes += remove_within(prefix, root)?;
        }
    }
    Ok(report)
}

/// Drops library rows that launch from the removed folders, so the owned
/// title shows as not installed instead of as a missing installation.
/// O(g) over saved games, one delete per matching row.
pub fn forget_installs(repo: &GameRepository, plan: &RemovalPlan) -> Result<(), String> {
    let roots: Vec<&PathBuf> = plan.installs.iter().map(|(target, _)| target).collect();
    for game in repo.list_games().map_err(|err| err.to_string())? {
        let LaunchConfiguration::Wine { profile } = &game.launch_config else {
            continue;
        };
        let executable = Path::new(&profile.executable);
        if roots.iter().any(|root| executable.starts_with(root)) {
            repo.delete_game(&game.id).map_err(|err| err.to_string())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root() -> PathBuf {
        let root = std::env::temp_dir().join(format!("orbit-uninstall-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        root.canonicalize().unwrap()
    }

    fn game_files(dir: &Path) {
        fs::create_dir_all(dir.join("bin")).unwrap();
        fs::write(dir.join("bin/game.exe"), vec![0u8; 128]).unwrap();
    }

    #[test]
    fn removes_only_the_game_install_and_keeps_saves_by_default() {
        let root = temp_root();
        let runtimes = root.join("runtimes");
        let session = root.join("steam-windows");
        let plan = removal_plan(&runtimes, &session, "570", false).unwrap();
        let install = &plan.installs[0].0;
        game_files(install);
        let prefix = install.parent().unwrap().join("prefix");
        fs::create_dir_all(prefix.join("drive_c/users")).unwrap();
        fs::create_dir_all(session.join("prefix")).unwrap();

        let report = execute(&plan).unwrap();
        assert_eq!(report.removed_bytes, 128);
        assert!(!install.exists());
        assert!(prefix.exists(), "saves stay unless asked");
        assert!(
            session.join("prefix").exists(),
            "the Steam client is untouched"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn deletes_the_prefix_only_when_asked_and_it_has_no_steam_login() {
        let root = temp_root();
        let runtimes = root.join("runtimes");
        let plan = removal_plan(&runtimes, &root.join("steam-windows"), "570", true).unwrap();
        let (prefix, _) = plan.prefix.clone().unwrap();
        fs::create_dir_all(prefix.join("drive_c/users")).unwrap();
        assert!(!execute(&plan).unwrap().kept_prefix);
        assert!(!prefix.exists());

        let steam = crate::runtimes::containers::steam::steam_root(&prefix);
        fs::create_dir_all(steam.join("config")).unwrap();
        fs::write(steam.join("config/loginusers.vdf"), "users").unwrap();
        assert!(execute(&plan).unwrap().kept_prefix);
        assert!(steam.join("config/loginusers.vdf").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn refuses_targets_outside_the_allowed_root() {
        let root = temp_root();
        let allowed = root.join("games");
        let outside = root.join("elsewhere");
        fs::create_dir_all(&allowed).unwrap();
        game_files(&outside);
        assert!(remove_within(&outside, &allowed).is_err());
        assert!(remove_within(&allowed.join("../elsewhere"), &allowed).is_err());
        assert!(remove_within(&allowed, &allowed).is_err());
        assert!(outside.join("bin/game.exe").exists());
        assert!(removal_plan(&root, &root, "../570", false).is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_symlinked_install_is_unlinked_without_touching_its_target() {
        let root = temp_root();
        let allowed = root.join("games");
        let shared = root.join("shared-library");
        fs::create_dir_all(&allowed).unwrap();
        game_files(&shared);
        std::os::unix::fs::symlink(&shared, allowed.join("install")).unwrap();
        assert_eq!(
            remove_within(&allowed.join("install"), &allowed).unwrap(),
            0
        );
        assert!(!allowed.join("install").exists());
        assert!(shared.join("bin/game.exe").exists());
        let _ = fs::remove_dir_all(root);
    }

    fn library_with(root: &Path, app_id: &str, installdir: &str, exe: bool) -> PathBuf {
        let steamapps = root.join("Library/steamapps");
        let game = steamapps.join("common").join(installdir);
        fs::create_dir_all(&game).unwrap();
        let file = if exe { "Expendabros.exe" } else { "readme.txt" };
        fs::write(game.join(file), vec![0u8; 64]).unwrap();
        fs::write(
            steamapps.join(format!("appmanifest_{app_id}.acf")),
            format!("\"AppState\"\n{{\n\t\"appid\"\t\t\"{app_id}\"\n\t\"name\"\t\t\"Game\"\n\t\"installdir\"\t\t\"{installdir}\"\n}}\n"),
        )
        .unwrap();
        steamapps.join("common")
    }

    #[test]
    fn uninstalls_a_windows_game_from_a_steam_library_folder() {
        let root = temp_root();
        let common = library_with(&root, "312990", "Broforce The Expendables Missions", true);
        let other = common.join("GodOfWar");
        game_files(&other);
        let mut plan = removal_plan(
            &root.join("runtimes"),
            &root.join("steam-windows"),
            "312990",
            false,
        )
        .unwrap();
        add_library_installs(
            &mut plan,
            &[common.to_string_lossy().into_owned()],
            &root.join("steam-windows"),
            "312990",
        );
        assert!(plan.finds_game_files());
        let report = execute(&plan).unwrap();
        assert_eq!(report.removed_bytes, 64);
        assert!(!common.join("Broforce The Expendables Missions").exists());
        assert!(!common
            .parent()
            .unwrap()
            .join("appmanifest_312990.acf")
            .exists());
        assert!(other.join("bin/game.exe").exists(), "other games stay");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn leaves_mac_games_and_the_steam_windows_library_alone() {
        let root = temp_root();
        let common = library_with(&root, "312990", "MacGame", false);
        let session = root.join("steam-windows");
        let mut plan = removal_plan(&root.join("runtimes"), &session, "312990", false).unwrap();
        add_library_installs(
            &mut plan,
            &[common.to_string_lossy().into_owned()],
            &session,
            "312990",
        );
        assert!(!plan.finds_game_files(), "no .exe means not a Windows game");

        let protected = session.join("prefix/drive_c/Steam");
        let client_common = library_with(&protected, "312990", "Expendabros", true);
        let mut plan = removal_plan(&root.join("runtimes"), &session, "312990", false).unwrap();
        add_library_installs(
            &mut plan,
            &[client_common.to_string_lossy().into_owned()],
            &session,
            "312990",
        );
        assert!(!plan.finds_game_files(), "steam-windows is never touched");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn uninstalls_a_recorded_wine_library_entry_even_without_an_appmanifest() {
        let root = temp_root();
        let game_dir = root.join("External/steamapps/common/RESIDENT EVIL 2  BIOHAZARD RE2");
        fs::create_dir_all(&game_dir).unwrap();
        let exe = game_dir.join("re2.exe");
        fs::write(&exe, vec![0u8; 256]).unwrap();
        let session = root.join("steam-windows");
        let mut plan = removal_plan(&root.join("runtimes"), &session, "883710", false).unwrap();
        let entry = crate::services::library::LibraryEntry {
            id: "steam:883710".into(),
            game: crate::models::Game {
                id: "steam-windows-883710".into(),
                title: "Resident Evil 2".into(),
                sort_title: "resident evil 2".into(),
                description: None,
                provider: crate::models::GameProvider::Steam,
                platform: crate::models::GamePlatform::Windows,
                source_id: Some("883710".into()),
                launch_config: LaunchConfiguration::Steam {
                    app_id: "883710".into(),
                },
                artwork: Default::default(),
                favorite: false,
                hidden: false,
                date_added: String::new(),
                last_played_at: None,
                total_playtime_seconds: 0,
                install_size_bytes: Some(256),
                achievements: Vec::new(),
            },
            steam_app_id: Some("883710".into()),
            owned: true,
            installations: vec![crate::services::library::Installation {
                id: "steam-windows-883710".into(),
                game_id: "steam-windows-883710".into(),
                platform: crate::models::GamePlatform::Windows,
                launch_type: "wine".into(),
                available: true,
                path: Some(exe.to_string_lossy().into_owned()),
                size_bytes: Some(256),
                download_size_bytes: None,
            }],
            preferred_installation_id: None,
            run_info: None,
        };
        add_entry_installs(&mut plan, &[entry], &session, "883710");
        assert!(plan.finds_game_files());
        let report = execute(&plan).unwrap();
        assert_eq!(report.removed_bytes, 256);
        assert!(!game_dir.exists());
        let _ = fs::remove_dir_all(root);
    }
}
