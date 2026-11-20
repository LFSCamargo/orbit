//! Launching Xbox Cloud Gaming titles in Orbit's Xbox window. A title joins
//! the library only after its first successful launch dispatch; browsing the
//! catalog never adds one. Opening the URL does not confirm that the user is
//! signed in or that a stream started.

use anyhow::{bail, Result};

use crate::database::GameRepository;
use crate::models::{
    Game, GameArtwork, GamePlatform, GameProvider, ImportedGame, LaunchConfiguration,
};
use crate::services::xcloud_catalog::{valid_product_id, XcloudCatalogEntry};

const LAUNCH_PREFIX: &str = "https://www.xbox.com/";

pub fn stable_key(product_id: &str) -> String {
    format!("xcloud:{product_id}")
}

/// Only xbox.com play links may be opened for cloud games.
pub fn valid_launch_url(url: &str) -> bool {
    url.starts_with(LAUNCH_PREFIX)
        && url.contains("/play/launch/")
        && !url.chars().any(|c| c.is_whitespace() || c.is_control())
}

fn imported_game(entry: &XcloudCatalogEntry) -> ImportedGame {
    ImportedGame {
        stable_key: stable_key(&entry.product_id),
        title: entry.title.clone(),
        sort_title: entry.title.to_lowercase(),
        description: None,
        provider: GameProvider::Xcloud,
        platform: GamePlatform::Cloud,
        source_id: Some(entry.product_id.clone()),
        launch_config: LaunchConfiguration::OpenUrl {
            url: entry.launch_url.clone(),
        },
        artwork: GameArtwork {
            cover: entry.cover_url.clone(),
            hero: entry.hero_url.clone(),
            logo: entry.logo_url.clone(),
            icon: entry.square_url.clone(),
        },
        total_playtime_seconds: 0,
        install_size_bytes: None,
        achievements: Vec::new(),
    }
}

/// Saves a catalog title to the library (Installed) without launching it.
pub fn save_catalog_entry(repo: &GameRepository, entry: &XcloudCatalogEntry) -> Result<Game> {
    if !valid_product_id(&entry.product_id) || !valid_launch_url(&entry.launch_url) {
        bail!("This Xbox Cloud Gaming title has no valid launch link");
    }
    let result = repo.upsert_imported(&[imported_game(entry)])?;
    let Some(game_id) = result.game_ids.first() else {
        bail!("The game could not be added to your library");
    };
    repo.get_game(game_id)?
        .ok_or_else(|| anyhow::anyhow!("The game could not be added to your library"))
}

/// Opens a catalog title and, once the browser accepted the URL, records it
/// as played: the library row is created or refreshed and a launch is logged.
pub fn launch_catalog_entry(
    repo: &GameRepository,
    entry: &XcloudCatalogEntry,
    dispatch: impl FnOnce(&str) -> Result<()>,
) -> Result<Game> {
    if !valid_product_id(&entry.product_id) || !valid_launch_url(&entry.launch_url) {
        bail!("This Xbox Cloud Gaming title has no valid launch link");
    }
    dispatch(&entry.launch_url)?;
    let game = save_catalog_entry(repo, entry)?;
    repo.record_cloud_launch(&game.id, &GameProvider::Xcloud, &now())?;
    repo.get_game(&game.id)?
        .ok_or_else(|| anyhow::anyhow!("The game could not be added to your library"))
}

/// Replays a cloud game already in the library.
pub fn launch_library_game(
    repo: &GameRepository,
    game: &Game,
    dispatch: impl FnOnce(&str) -> Result<()>,
) -> Result<Game> {
    let LaunchConfiguration::OpenUrl { url } = &game.launch_config else {
        bail!("This Xbox Cloud Gaming title has no valid launch link");
    };
    if game.provider != GameProvider::Xcloud || !valid_launch_url(url) {
        bail!("This Xbox Cloud Gaming title has no valid launch link");
    }
    dispatch(url)?;
    repo.record_cloud_launch(&game.id, &GameProvider::Xcloud, &now())?;
    repo.get_game(&game.id)?
        .ok_or_else(|| anyhow::anyhow!("Game not found"))
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry() -> XcloudCatalogEntry {
        XcloudCatalogEntry {
            product_id: "9P8LR42PTRGJ".into(),
            title: "33 Immortals".into(),
            xbox_title_id: Some("2141212892".into()),
            cover_url: Some("https://store-images.s-microsoft.com/poster".into()),
            square_url: None,
            hero_url: None,
            logo_url: None,
            launch_url: "https://www.xbox.com/en-US/play/launch/33-immortals/9P8LR42PTRGJ".into(),
        }
    }

    fn xcloud_games(repo: &GameRepository) -> Vec<Game> {
        repo.list_games()
            .unwrap()
            .into_iter()
            .filter(|g| g.provider == GameProvider::Xcloud)
            .collect()
    }

    #[test]
    fn first_launch_creates_a_cloud_library_entry() {
        let repo = GameRepository::open_in_memory().unwrap();
        let mut opened = None;
        let game = launch_catalog_entry(&repo, &entry(), |url| {
            opened = Some(url.to_string());
            Ok(())
        })
        .unwrap();
        assert_eq!(opened.as_deref(), Some(entry().launch_url.as_str()));
        assert_eq!(game.platform, GamePlatform::Cloud);
        assert_eq!(game.source_id.as_deref(), Some("9P8LR42PTRGJ"));
        assert_eq!(game.install_size_bytes, None);
        assert!(game.last_played_at.is_some());
        assert!(matches!(
            game.launch_config,
            LaunchConfiguration::OpenUrl { .. }
        ));
        assert_eq!(
            repo.cloud_launch_stats(&game.id)
                .unwrap()
                .unwrap()
                .launch_count,
            1
        );
    }

    #[test]
    fn repeat_launches_update_the_same_entry() {
        let repo = GameRepository::open_in_memory().unwrap();
        let first = launch_catalog_entry(&repo, &entry(), |_| Ok(())).unwrap();
        let again = launch_catalog_entry(&repo, &entry(), |_| Ok(())).unwrap();
        let replay = launch_library_game(&repo, &again, |_| Ok(())).unwrap();
        assert_eq!(first.id, again.id);
        assert_eq!(first.id, replay.id);
        assert_eq!(xcloud_games(&repo).len(), 1);
        let stats = repo.cloud_launch_stats(&first.id).unwrap().unwrap();
        assert_eq!(stats.launch_count, 3);
        assert!(stats.last_launched_at >= stats.first_launched_at);
    }

    #[test]
    fn failed_dispatch_does_not_add_the_game() {
        let repo = GameRepository::open_in_memory().unwrap();
        let result = launch_catalog_entry(&repo, &entry(), |_| bail!("no browser"));
        assert!(result.is_err());
        assert!(xcloud_games(&repo).is_empty());
    }

    #[test]
    fn invalid_launch_url_is_never_dispatched() {
        let repo = GameRepository::open_in_memory().unwrap();
        let mut bad = entry();
        bad.launch_url = "file:///Applications/Calculator.app".into();
        let mut dispatched = false;
        let result = launch_catalog_entry(&repo, &bad, |_| {
            dispatched = true;
            Ok(())
        });
        assert!(result.is_err());
        assert!(!dispatched);
        assert!(xcloud_games(&repo).is_empty());
    }

    #[test]
    fn saving_adds_an_entry_without_a_launch() {
        let repo = GameRepository::open_in_memory().unwrap();
        let game = save_catalog_entry(&repo, &entry()).unwrap();
        assert_eq!(xcloud_games(&repo).len(), 1);
        assert!(game.last_played_at.is_none());
        assert!(repo.cloud_launch_stats(&game.id).unwrap().is_none());
        let again = save_catalog_entry(&repo, &entry()).unwrap();
        assert_eq!(again.id, game.id);
        assert_eq!(xcloud_games(&repo).len(), 1);
    }

    #[test]
    fn library_replay_rejects_non_cloud_games() {
        let repo = GameRepository::open_in_memory().unwrap();
        let mut game = launch_catalog_entry(&repo, &entry(), |_| Ok(())).unwrap();
        game.provider = GameProvider::Steam;
        assert!(launch_library_game(&repo, &game, |_| Ok(())).is_err());
    }

    #[test]
    fn cloud_entries_survive_reopening_the_database() {
        let dir = std::env::temp_dir().join(format!("orbit-xcloud-{}", uuid::Uuid::new_v4()));
        let path = dir.join("orbit.sqlite3");
        {
            let repo = GameRepository::open(&path).unwrap();
            launch_catalog_entry(&repo, &entry(), |_| Ok(())).unwrap();
        }
        let repo = GameRepository::open(&path).unwrap();
        let games = xcloud_games(&repo);
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].title, "33 Immortals");
    }
}
