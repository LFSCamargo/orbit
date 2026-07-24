use std::path::Path;
use std::time::Duration;

use chrono::Utc;

use crate::database::{CachedMetadataRow, GameRepository, MetadataCacheRepository};
use crate::models::{Game, GameArtwork, GameProvider, LaunchConfiguration, UpdateGameRequest};
use crate::services::artwork::{cache_artwork_bytes, mime_from_bytes, path_to_string};
use crate::services::http::fetch_bytes;
use crate::services::metadata_merge::is_placeholder_description;
use crate::services::steamgrid::fetch_steamgrid_assets;
use crate::services::thegamesdb::{self, TgdbGameDetails};
use crate::utils::api_keys::{steamgriddb_api_key, thegamesdb_api_key};
use crate::utils::gamehub_shortcut::inspect_gamehub_shortcut;
use crate::utils::steam_app_id::{steam_app_id_from_launch, steam_app_id_from_url};

#[derive(Debug, Clone, Default)]
pub struct EnrichmentResult {
    pub enriched: bool,
    pub message: String,
}

/// Orchestrates metadata + artwork enrichment via TheGamesDB and SteamGridDB.
pub struct MetadataEnrichmentService;

impl MetadataEnrichmentService {
    pub async fn enrich_game(
        repo: &GameRepository,
        cache: &MetadataCacheRepository,
        game_id: &str,
    ) -> Result<EnrichmentResult, String> {
        let game = repo
            .get_game(game_id)
            .map_err(|err| err.to_string())?
            .ok_or_else(|| "Game not found".to_string())?;

        let tgdb_key = thegamesdb_api_key(repo)
            .ok_or_else(|| "TheGamesDB API key not configured (.env or Settings)".to_string())?;

        let platform_ids = thegamesdb::platform_ids(&game.provider, &game.platform);
        let tgdb_match = resolve_tgdb_match(cache, &tgdb_key, &game, &platform_ids).await?;
        let Some(tgdb_match) = tgdb_match else {
            return Ok(EnrichmentResult {
                enriched: false,
                message: "No TheGamesDB match found for this title".into(),
            });
        };

        let mut title = game.title.clone();
        let mut description = game.description.clone();
        let mut artwork = game.artwork.clone();
        let mut changed = false;
        let mut notes: Vec<String> = vec!["TheGamesDB metadata".into()];

        if should_update_title(&game) {
            title = tgdb_match.title.clone();
            changed = true;
        }

        if is_placeholder_description(description.as_deref()) {
            if let Some(overview) = tgdb_match.overview.clone() {
                description = Some(overview);
                changed = true;
            }
        }

        let steam_app_id = resolve_steam_app_id(&game);
        let sgdb_key = steamgriddb_api_key(repo);

        if let (Some(app_id), Some(key)) = (steam_app_id.as_deref(), sgdb_key.as_deref()) {
            match fetch_steamgrid_assets(key, app_id).await {
                Ok(assets) => {
                    let downloaded = download_sgdb_artwork(game_id, &assets).await?;
                    let before = artwork.clone();
                    artwork = crate::services::metadata_merge::merge_artwork(&artwork, &downloaded);
                    if artwork_changed(&before, &artwork) {
                        changed = true;
                        notes.push("SteamGridDB artwork".into());
                    }
                }
                Err(err) => notes.push(err),
            }
        } else if steam_app_id.is_some() {
            notes.push("SteamGridDB key not configured".into());
        }

        if artwork.cover.is_none() || artwork.hero.is_none() || artwork.icon.is_none() {
            match thegamesdb::fetch_images(&tgdb_key, tgdb_match.id).await {
                Ok(images) => {
                    let downloaded = download_tgdb_artwork(game_id, &images).await?;
                    let before = artwork.clone();
                    artwork = crate::services::metadata_merge::merge_artwork(&artwork, &downloaded);
                    if artwork_changed(&before, &artwork) {
                        changed = true;
                        notes.push("TheGamesDB artwork".into());
                    }
                }
                Err(err) => notes.push(err),
            }
        }

        if !changed {
            return Ok(EnrichmentResult {
                enriched: false,
                message: if notes.len() <= 1 {
                    "Nothing to update".into()
                } else {
                    format!("No changes applied ({})", notes.join(", "))
                },
            });
        }

        repo.update_game(
            game_id,
            UpdateGameRequest {
                title: Some(title.clone()),
                description: description.clone(),
                artwork: Some(artwork.clone()),
                launch_config: None,
                install_size_bytes: None,
            },
        )
        .map_err(|err| err.to_string())?;

        persist_metadata_cache(
            cache,
            game_id,
            &tgdb_match,
            &title,
            description.as_deref(),
            &artwork,
            steam_app_id.as_deref(),
        )?;

        Ok(EnrichmentResult {
            enriched: true,
            message: format!("Updated {}", notes.join(" · ")),
        })
    }

    pub async fn enrich_games(
        repo: &GameRepository,
        cache: &MetadataCacheRepository,
        game_ids: &[String],
    ) -> Result<usize, String> {
        let mut enriched = 0usize;
        for (index, game_id) in game_ids.iter().enumerate() {
            if index > 0 {
                tokio::time::sleep(Duration::from_millis(150)).await;
            }
            match Self::enrich_game(repo, cache, game_id).await {
                Ok(result) if result.enriched => enriched += 1,
                Ok(_) => {}
                Err(err) => {
                    eprintln!("[orbit] enrich_game {game_id} failed: {err}");
                }
            }
        }
        Ok(enriched)
    }

    pub fn auto_enrich_enabled(repo: &GameRepository) -> bool {
        match repo.get_setting("autoEnrichOnImport") {
            Ok(Some(value)) => value.as_bool().unwrap_or(true),
            _ => true,
        }
    }
}

async fn resolve_tgdb_match(
    cache: &MetadataCacheRepository,
    api_key: &str,
    game: &Game,
    platform_ids: &[i64],
) -> Result<Option<TgdbGameDetails>, String> {
    if let Ok(Some(cached)) = cache.get(&game.id) {
        if let Some(tgdb_id) = cached.tgdb_id {
            if let Ok(Some(details)) = thegamesdb::get_by_id(api_key, tgdb_id).await {
                return Ok(Some(details));
            }
        }
    }

    let candidates = thegamesdb::search_by_name(api_key, &game.title, platform_ids).await?;
    if candidates.is_empty() {
        return Ok(None);
    }

    let mut ranked = candidates;
    ranked.sort_by(|a, b| {
        thegamesdb::score_match(&game.title, b, platform_ids)
            .cmp(&thegamesdb::score_match(&game.title, a, platform_ids))
    });

    let best = ranked.into_iter().next();
    Ok(best.filter(|candidate| thegamesdb::score_match(&game.title, candidate, platform_ids) >= 65))
}

fn persist_metadata_cache(
    cache: &MetadataCacheRepository,
    game_id: &str,
    tgdb: &TgdbGameDetails,
    title: &str,
    summary: Option<&str>,
    artwork: &GameArtwork,
    steam_app_id: Option<&str>,
) -> Result<(), String> {
    let updated_at = Utc::now().to_rfc3339();
    cache
        .upsert(&CachedMetadataRow {
            game_id: game_id.to_string(),
            tgdb_id: Some(tgdb.id),
            title: title.to_string(),
            summary: summary.map(str::to_string).or_else(|| tgdb.overview.clone()),
            release_date: tgdb.release_date.clone(),
            developer: tgdb.developer.clone(),
            publisher: tgdb.publisher.clone(),
            cover_path: artwork.cover.clone(),
            background_path: artwork.hero.clone(),
            icon_path: artwork.icon.clone(),
            updated_at,
        })
        .map_err(|err| err.to_string())?;

    cache
        .upsert_external_id(game_id, "thegamesdb", &tgdb.id.to_string())
        .map_err(|err| err.to_string())?;

    if let Some(app_id) = steam_app_id {
        cache
            .upsert_external_id(game_id, "steam", app_id)
            .map_err(|err| err.to_string())?;
    }

    Ok(())
}

fn resolve_steam_app_id(game: &Game) -> Option<String> {
    if let Some(id) = steam_app_id_from_launch(&game.launch_config) {
        return Some(id);
    }

    if let LaunchConfiguration::Gamehub {
        shortcut_app_path, ..
    } = &game.launch_config
    {
        if let Some(info) = inspect_gamehub_shortcut(Path::new(shortcut_app_path)) {
            if let Some(link) = info.deep_link.as_deref() {
                return steam_app_id_from_url(link);
            }
        }
    }

    game.source_id
        .as_deref()
        .filter(|id| id.chars().all(|c| c.is_ascii_digit()))
        .map(str::to_string)
}

fn should_update_title(game: &Game) -> bool {
    match game.provider {
        GameProvider::Gamehub | GameProvider::Astris | GameProvider::Manual => true,
        GameProvider::Steam => {
            let lower = game.title.trim().to_ascii_lowercase();
            lower.is_empty() || lower.starts_with("steam app ")
        }
        _ => false,
    }
}

async fn download_sgdb_artwork(
    game_id: &str,
    assets: &crate::services::steamgrid::SteamGridAssets,
) -> Result<GameArtwork, String> {
    let mut artwork = GameArtwork::default();
    artwork.cover = download_slot(game_id, "cover", assets.cover_url.as_deref()).await?;
    artwork.hero = download_slot(game_id, "hero", assets.hero_url.as_deref()).await?;
    artwork.logo = download_slot(game_id, "logo", assets.logo_url.as_deref()).await?;

    let cover_url = assets.cover_url.as_deref();
    let icon_url = assets.icon_url.as_deref();
    if icon_url.is_some() && icon_url != cover_url {
        artwork.icon = download_slot(game_id, "icon", icon_url).await?;
    }
    if artwork.icon.is_none() {
        artwork.icon = artwork.cover.clone();
    }
    Ok(artwork)
}

async fn download_tgdb_artwork(
    game_id: &str,
    images: &thegamesdb::TgdbGameImages,
) -> Result<GameArtwork, String> {
    let mut artwork = GameArtwork::default();
    artwork.cover = download_slot(game_id, "cover", images.cover_url.as_deref()).await?;
    artwork.hero = download_slot(game_id, "hero", images.hero_url.as_deref()).await?;
    if artwork.icon.is_none() {
        artwork.icon = artwork.cover.clone();
    }
    Ok(artwork)
}

async fn download_slot(
    game_id: &str,
    slot: &str,
    url: Option<&str>,
) -> Result<Option<String>, String> {
    let Some(url) = url.filter(|u| !u.is_empty()) else {
        return Ok(None);
    };
    let bytes = fetch_bytes(url).await?;
    let mime = mime_from_bytes(&bytes, url);
    let path = cache_artwork_bytes(game_id, slot, &bytes, &mime)?;
    Ok(Some(path_to_string(&path)))
}

fn artwork_changed(before: &GameArtwork, after: &GameArtwork) -> bool {
    before.cover != after.cover
        || before.hero != after.hero
        || before.logo != after.logo
        || before.icon != after.icon
}
