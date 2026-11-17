//! Native download planner. SteamCMD remains the executor until a depot HTTP
//! client ships; this module is the only assembly point for that plan.
//! Installs land in the per-game container, not the shared steam-windows prefix.
use std::path::{Path, PathBuf};

use orbit_steam::DepotPlan;

use crate::services::steam_download;

pub fn container_id(app_id: &str) -> Result<String, String> {
    if !steam_download::valid_app_id(app_id) {
        return Err("Steam app id must be a number".into());
    }
    Ok(format!("steam-{app_id}"))
}

pub fn install_dir(runtimes_root: &Path, app_id: &str) -> Result<PathBuf, String> {
    let id = container_id(app_id)?;
    crate::runtimes::containers::layout::validate_id(&id).map_err(|err| format!("{err:#}"))?;
    let install = crate::runtimes::containers::root_in(runtimes_root)
        .join("games")
        .join(id)
        .join("install");
    if install
        .components()
        .any(|part| matches!(part, std::path::Component::ParentDir))
    {
        return Err("Install directory escapes the game container".into());
    }
    Ok(install)
}

pub fn prepare_install_dir(runtimes_root: &Path, app_id: &str) -> Result<PathBuf, String> {
    let dest = install_dir(runtimes_root, app_id)?;
    std::fs::create_dir_all(&dest).map_err(|err| err.to_string())?;
    Ok(dest)
}

pub fn plan(
    account_name: &str,
    app_id: &str,
    install_dir: &Path,
    offline: bool,
    verify: bool,
) -> Result<DepotPlan, String> {
    DepotPlan::parse(
        account_name,
        app_id,
        &install_dir.to_string_lossy(),
        offline,
        verify,
    )
}

pub fn steamcmd_arguments(plan: &DepotPlan) -> Vec<String> {
    plan.steamcmd_arguments()
}

/// Download through the native plan. SteamCMD is the hidden executor.
pub fn download_owned(
    app: &tauri::AppHandle,
    repo: &crate::database::GameRepository,
    app_id: &str,
) -> Result<(), String> {
    crate::services::steam_windows::download(app, repo, app_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_plan_matches_the_headless_windows_client() {
        let dest = std::env::temp_dir()
            .join(format!("orbit-native-dl-{}", uuid::Uuid::new_v4()))
            .join("install");
        let plan = plan("orbit_user", "480", &dest, true, true).unwrap();
        let args = steamcmd_arguments(&plan);
        let expected =
            steam_download::steamcmd_arguments("orbit_user", "480", &dest, true, true).unwrap();
        assert_eq!(args, expected);
        assert!(plan.offline);
        assert!(plan.verify);
        let _ = std::fs::remove_dir_all(dest.parent().unwrap());
    }

    #[test]
    fn windows_downloads_land_in_the_per_game_container() {
        let root = std::env::temp_dir().join(format!("orbit-ct-dl-{}", uuid::Uuid::new_v4()));
        let dest = install_dir(&root, "883710").unwrap();
        assert_eq!(container_id("883710").unwrap(), "steam-883710");
        assert!(dest.ends_with("games/steam-883710/install"));
        assert!(!dest
            .to_string_lossy()
            .contains("steam-windows/games/883710"));
        assert!(install_dir(&root, "re2").is_err());
        let _ = std::fs::remove_dir_all(root);
    }
}
