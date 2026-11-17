//! First launch of a Windows game: container → compatibility → Steam files →
//! saved login → cloud folder → start. steam-windows is a seed, never a wipe.
//! The container client logs on afterwards, in `container_steam`.
use anyhow::{Context, Result};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{atomic::AtomicBool, Arc, Mutex},
};

use crate::runtimes::{
    containers::{self, layout::prefix_ready, Container},
    detection::WineInstallation,
    settings::GraphicsBackend,
};
use crate::services::steam_native;
use orbit_steam::SteamPresence;

#[derive(Debug, Clone)]
pub struct FirstLaunchRequest {
    pub game_id: String,
    pub app_id: Option<String>,
    pub wine: WineInstallation,
    pub steam_source: Option<PathBuf>,
    pub graphics: GraphicsBackend,
    pub selections: std::collections::BTreeMap<String, String>,
}

pub struct PreparedContainer {
    pub container: Container,
    pub presence: SteamPresence,
    pub graphics: containers::graphics::GraphicsLinks,
    pub cloud_dir: Option<PathBuf>,
}

pub fn prepare(
    runtimes_root: &Path,
    request: &FirstLaunchRequest,
    cancel: &AtomicBool,
    log: &Arc<Mutex<fs::File>>,
    progress: &mut impl FnMut(&str),
) -> Result<PreparedContainer> {
    progress("container");
    let seed = request
        .steam_source
        .as_deref()
        .filter(|path| prefix_ready(path));
    let container = containers::prepare_game(
        runtimes_root,
        &request.game_id,
        &request.wine,
        seed,
        cancel,
        log,
    )?;
    progress("compatibility");
    let graphics =
        containers::graphics::apply(&container.prefix, request.graphics, &request.selections)?;
    let mut steam_seeded = container.manifest.steam_seeded;
    if let Some(source) = seed {
        progress("steam");
        steam_seeded = containers::steam::seed(source, &container.prefix)?;
    }
    let presence = if steam_seeded {
        steam_native::agent::selected(&container.prefix)
    } else {
        SteamPresence::Missing
    };
    progress("login");
    let cloud_dir = match (request.app_id.as_deref(), seed) {
        (Some(app_id), Some(source)) => {
            progress("cloud");
            sync_cloud_dir(&container.prefix, source, app_id)?
        }
        _ => None,
    };
    Ok(PreparedContainer {
        container,
        presence,
        graphics,
        cloud_dir,
    })
}

fn sync_cloud_dir(prefix: &Path, source: &Path, app_id: &str) -> Result<Option<PathBuf>> {
    let Ok(session) = steam_native::session::from_prefix(source) else {
        return Ok(None);
    };
    let app_id = orbit_steam::parse_app_id(app_id).map_err(anyhow::Error::msg)?;
    let dest = steam_native::cloud::destination(prefix, &session.steam_id, app_id)
        .map_err(anyhow::Error::msg)?;
    let source_dir = steam_native::cloud::destination(source, &session.steam_id, app_id)
        .map_err(anyhow::Error::msg)?;
    if source_dir.is_dir() && !dest.exists() {
        containers::clone::clone_tree(&source_dir, &dest)
            .context("Steam Cloud saves could not be copied into the container")?;
    } else {
        fs::create_dir_all(&dest)?;
    }
    Ok(Some(dest))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtimes::process;

    #[test]
    fn first_launch_clones_steam_and_creates_the_cloud_folder() {
        let root = std::env::temp_dir().join(format!("orbit-first-{}", uuid::Uuid::new_v4()));
        let steam = root.join("steam-windows/prefix");
        let steam_root = steam.join("drive_c/Program Files (x86)/Steam");
        fs::create_dir_all(steam_root.join("config")).unwrap();
        fs::write(steam.join("system.reg"), b"reg").unwrap();
        fs::write(steam_root.join("steam.exe"), b"MZ").unwrap();
        fs::write(
            steam_root.join("config/loginusers.vdf"),
            r#"
"users"
{
	"76561198000000000"
	{
		"AccountName"		"orbit_user"
		"MostRecent"		"1"
	}
}
"#,
        )
        .unwrap();
        let runtime = WineInstallation {
            path: "/wine/bin/wine".into(),
            server_path: "/wine/bin/wineserver".into(),
            version: "wine-10.0".into(),
        };
        let log = process::log_file(&root.join("latest.log")).unwrap();
        let mut steps = Vec::new();
        let prepared = prepare(
            &root.join("runtimes"),
            &FirstLaunchRequest {
                game_id: "game-1".into(),
                app_id: Some("480".into()),
                wine: runtime,
                steam_source: Some(steam.clone()),
                graphics: GraphicsBackend::Wine,
                selections: Default::default(),
            },
            &AtomicBool::new(false),
            &log,
            &mut |step| steps.push(step.to_string()),
        )
        .unwrap();
        assert!(prepared.container.prefix.join("system.reg").is_file());
        assert!(steam_root.join("steam.exe").is_file());
        assert_eq!(prepared.presence, SteamPresence::SilentClient);
        assert!(prepared.cloud_dir.is_some());
        assert!(steps.contains(&"container".to_string()));
        assert!(steps.contains(&"steam".to_string()));
        assert!(steps.contains(&"cloud".to_string()));
        let _ = fs::remove_dir_all(root);
    }
}
