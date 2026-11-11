use std::path::Path;
use std::time::Duration;

use chrono::Utc;

use crate::database::{CachedMetadataRow, GameRepository, MetadataCacheRepository};
use crate::models::{Game, GameArtwork, GameProvider, LaunchConfiguration, UpdateGameRequest};
use crate::services::artwork::{cache_artwork_bytes, mime_from_bytes, path_to_string};
use crate::services::http::fetch_bytes;
use crate::services::metadata_merge::is_placeholder_description;
use crate::services::steamgrid::fetch_matching_assets;
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

        let mut notes: Vec<String> = Vec::new();
        let tgdb_key = thegamesdb_api_key(repo);
        let platform_ids = thegamesdb::platform_ids(&game.provider, &game.platform);
        let tgdb_match = if let Some(key) = tgdb_key.as_deref() {
            match resolve_tgdb_match(cache, key, &game, &platform_ids).await {
                Ok(found) => found,
                Err(_) => {
                    notes.push("TheGamesDB unavailable".into());
                    None
                }
            }
        } else {
            None
        };
        let mut title = game.title.clone();
        let mut description = game.description.clone();
        let mut artwork = game.artwork.clone();
        if let Some(details) = &tgdb_match {
            if should_update_title(&game) && details.title != title {
                title = details.title.clone();
            }
            if is_placeholder_description(description.as_deref()) {
                description = details.overview.clone().or(description);
            }
        }
        let steam_app_id = resolve_steam_app_id(&game);
        if let Some(key) = steamgriddb_api_key(repo) {
            match fetch_matching_assets(&key, &title, steam_app_id.as_deref()).await {
                Ok(Some((canonical_title, assets))) => {
                    if should_update_title(&game) {
                        title = canonical_title;
                    }
                    let incoming = download_sgdb_artwork(game_id, &assets, &artwork).await?;
                    artwork = crate::services::metadata_merge::merge_artwork(&artwork, &incoming);
                    notes.push("SteamGridDB".into());
                }
                Ok(None) => {}
                Err(_) => notes.push("SteamGridDB unavailable".into()),
            }
        }
        if crate::services::import_artwork::needs_artwork(&artwork) {
            if let (Some(key), Some(details)) = (tgdb_key.as_deref(), tgdb_match.as_ref()) {
                if let Ok(images) = thegamesdb::fetch_images(key, details.id).await {
                    let incoming = download_tgdb_artwork(game_id, &images, &artwork).await?;
                    artwork = crate::services::metadata_merge::merge_artwork(&artwork, &incoming);
                    notes.push("TheGamesDB".into());
                }
            }
        }
        if crate::services::import_artwork::needs_artwork(&artwork) {
            if let Some(app_id) = steam_app_id.as_deref() {
                if let Ok(hits) =
                    crate::services::steam_store_artwork::search(app_id, "cover").await
                {
                    if should_update_title(&game) {
                        if let Some(hit) = hits.first() {
                            title = hit.title.clone();
                        }
                    }
                    for hit in hits {
                        if let Some(path) = download_slot(
                            game_id,
                            "cover",
                            Some(&hit.image_url),
                            artwork.cover.as_deref(),
                        )
                        .await
                        {
                            artwork.cover = Some(path);
                            break;
                        }
                    }
                }
            }
            if let Ok(Some(value)) = repo.get_setting("rawgApiKey") {
                if let Some(key) = value.as_str().filter(|key| !key.trim().is_empty()) {
                    if let Ok(hits) =
                        crate::services::public_artwork::search_rawg(&title, key, 5).await
                    {
                        for hit in hits.into_iter().filter(|hit| {
                            thegamesdb::normalize_title(&hit.title)
                                == thegamesdb::normalize_title(&title)
                        }) {
                            if let Some(path) = download_slot(
                                game_id,
                                "hero",
                                Some(&hit.image_url),
                                artwork.hero.as_deref(),
                            )
                            .await
                            {
                                artwork.hero = Some(path);
                                break;
                            }
                        }
                    }
                }
            }
        }
        // A valid imported/local image can serve as a fallback for another slot.
        crate::services::import_artwork::complete_artwork(game_id, &mut artwork)?;
        let changed = title != game.title
            || description != game.description
            || artwork_changed(&game.artwork, &artwork);
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

        if let Some(tgdb_match) = &tgdb_match {
            persist_metadata_cache(
                cache,
                game_id,
                tgdb_match,
                &title,
                description.as_deref(),
                &artwork,
                steam_app_id.as_deref(),
            )?;
        }

        Ok(EnrichmentResult {
            enriched: true,
            message: if notes.is_empty() {
                "Artwork completed locally; configure provider keys in Settings for game-specific artwork.".into()
            } else {
                format!("Updated {}", notes.join(" · "))
            },
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
                if thegamesdb::score_match(&game.title, &details, platform_ids) >= 85 {
                    return Ok(Some(details));
                }
            }
        }
    }

    let candidates = thegamesdb::search_by_name(api_key, &game.title, platform_ids).await?;
    if candidates.is_empty() {
        return Ok(None);
    }

    let mut ranked = candidates;
    ranked.sort_by(|a, b| {
        thegamesdb::score_match(&game.title, b, platform_ids).cmp(&thegamesdb::score_match(
            &game.title,
            a,
            platform_ids,
        ))
    });

    let best = ranked.into_iter().next();
    Ok(
        best.filter(|candidate| {
            thegamesdb::score_match(&game.title, candidate, platform_ids) >= 85
        }),
    )
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
            summary: summary
                .map(str::to_string)
                .or_else(|| tgdb.overview.clone()),
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

pub(crate) fn resolve_steam_app_id(game: &Game) -> Option<String> {
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

    if game.provider != GameProvider::Steam {
        return None;
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
    existing: &GameArtwork,
) -> Result<GameArtwork, String> {
    let mut artwork = GameArtwork::default();
    artwork.cover = download_slot(
        game_id,
        "cover",
        assets.cover_url.as_deref(),
        existing.cover.as_deref(),
    )
    .await;
    artwork.hero = download_slot(
        game_id,
        "hero",
        assets.hero_url.as_deref(),
        existing.hero.as_deref(),
    )
    .await;
    artwork.logo = download_slot(
        game_id,
        "logo",
        assets.logo_url.as_deref(),
        existing.logo.as_deref(),
    )
    .await;

    let cover_url = assets.cover_url.as_deref();
    let icon_url = assets.icon_url.as_deref();
    if icon_url.is_some() && icon_url != cover_url {
        artwork.icon = download_slot(game_id, "icon", icon_url, existing.icon.as_deref()).await;
    }
    if artwork.icon.is_none() {
        artwork.icon = artwork.cover.clone();
    }
    Ok(artwork)
}

async fn download_tgdb_artwork(
    game_id: &str,
    images: &thegamesdb::TgdbGameImages,
    existing: &GameArtwork,
) -> Result<GameArtwork, String> {
    let mut artwork = GameArtwork::default();
    artwork.cover = download_slot(
        game_id,
        "cover",
        images.cover_url.as_deref(),
        existing.cover.as_deref(),
    )
    .await;
    artwork.hero = download_slot(
        game_id,
        "hero",
        images.hero_url.as_deref(),
        existing.hero.as_deref(),
    )
    .await;
    if artwork.icon.is_none() {
        artwork.icon = artwork.cover.clone();
    }
    Ok(artwork)
}

async fn download_slot(
    game_id: &str,
    slot: &str,
    url: Option<&str>,
    existing: Option<&str>,
) -> Option<String> {
    if existing.is_some_and(crate::services::import_artwork::is_real_artwork) {
        return None;
    }
    let url = url.filter(|u| !u.is_empty())?;
    let bytes = fetch_bytes(url).await.ok()?;
    // Do not persist an HTML error page as an image.
    image::load_from_memory(&bytes).ok()?;
    let mime = mime_from_bytes(&bytes, url);
    cache_artwork_bytes(game_id, slot, &bytes, &mime)
        .ok()
        .map(|path| path_to_string(&path))
}

fn artwork_changed(before: &GameArtwork, after: &GameArtwork) -> bool {
    before.cover != after.cover
        || before.hero != after.hero
        || before.logo != after.logo
        || before.icon != after.icon
}

#[cfg(test)]
mod identity_tests {
    use super::*;
    #[test]
    fn never_treats_numeric_emulator_identity_as_steam() {
        let mut game: Game = serde_json::from_value(serde_json::json!({
            "id": "switch-test", "title": "Portal 2", "sortTitle": "portal 2",
            "provider": "astris", "platform": "nintendo-switch", "sourceId": "0100000000010000",
            "launchConfig": {"type": "open-file", "filePath": "/games/test.nsp"},
            "artwork": {}, "favorite": false, "hidden": false, "dateAdded": "2026-11-09",
            "totalPlaytimeSeconds": 0, "achievements": []
        }))
        .unwrap();
        assert_eq!(resolve_steam_app_id(&game), None);
        game.launch_config = LaunchConfiguration::Steam {
            app_id: "620".into(),
        };
        assert_eq!(resolve_steam_app_id(&game).as_deref(), Some("620"));
    }
}
