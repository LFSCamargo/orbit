use std::path::Path;
use std::time::Duration;

use chrono::Utc;

use crate::database::{CachedMetadataRow, GameRepository, MetadataCacheRepository};
use crate::models::{Game, GameArtwork, GameProvider, LaunchConfiguration};
use crate::services::artwork::{cache_artwork_bytes, mime_from_bytes, path_to_string};
use crate::services::http::fetch_bytes;
use crate::services::metadata_merge::is_placeholder_description;
use crate::services::steamgrid::fetch_matching_assets;
use crate::services::thegamesdb::{self, TgdbGameDetails};
use crate::utils::api_keys::{steamgriddb_api_key, thegamesdb_api_key};
use crate::utils::steam_app_id::steam_app_id_from_launch;

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
        Self::enrich_game_with(repo, cache, game_id, true).await
    }

    async fn enrich_game_with(
        repo: &GameRepository,
        cache: &MetadataCacheRepository,
        game_id: &str,
        replace_copy: bool,
    ) -> Result<EnrichmentResult, String> {
        let game = repo
            .get_game(game_id)
            .map_err(|err| err.to_string())?
            .ok_or_else(|| "Game not found".to_string())?;

        let mut notes: Vec<String> = Vec::new();
        let steam_app_id = resolve_steam_app_id(&game);
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
        let mut store_description = None;
        if let Some(app_id) = steam_app_id.as_deref() {
            if replace_copy || is_placeholder_description(game.description.as_deref()) {
                match crate::services::steam_catalog::fetch_store_catalog(app_id).await {
                    Ok(value) => {
                        if let Some((store_title, store_desc)) =
                            crate::services::steam_catalog::parse_store_details(app_id, &value)
                        {
                            if should_update_title(&game) && store_title != title {
                                title = store_title;
                            }
                            store_description = store_desc;
                            if store_description
                                .as_deref()
                                .is_some_and(|text| !is_placeholder_description(Some(text)))
                            {
                                notes.push("Steam store".into());
                            }
                        }
                    }
                    Err(_) => notes.push("Steam store unavailable".into()),
                }
            }
        }
        if let Some(details) = &tgdb_match {
            if should_update_title(&game) && details.title != title {
                title = details.title.clone();
            }
        }
        let mut description = crate::services::metadata_merge::pick_description(
            game.description.as_deref(),
            store_description,
            tgdb_match
                .as_ref()
                .and_then(|details| details.overview.clone()),
            replace_copy,
        );
        if description.is_none()
            && game.description.as_deref().is_some_and(|text| {
                is_placeholder_description(Some(text)) && !text.trim().is_empty()
            })
        {
            description = Some(String::new());
        }
        let mut artwork = game.artwork.clone();
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
        if let Some(app_id) = steam_app_id.as_deref() {
            if needs_steam_square(&game) {
                artwork.icon = Some(crate::services::steam_catalog::cover_url(app_id));
                if let Some(key) = steamgriddb_api_key(repo) {
                    match crate::services::steamgrid::fetch_square_cover(&key, app_id).await {
                        Ok(square) => {
                            if let Some(url) = square.cover_url {
                                if let Some(path) =
                                    download_steam_square(game_id, app_id, &url).await
                                {
                                    artwork.icon = Some(path);
                                    notes.push("SteamGridDB square (exact Steam AppID)".into());
                                }
                            }
                        }
                        Err(_) => notes.push("SteamGridDB square unavailable".into()),
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

        repo.update_fetched_metadata(
            game_id,
            Some(title.clone()),
            description.clone(),
            Some(artwork.clone()),
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
            match Self::enrich_game_with(repo, cache, game_id, false).await {
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

/// Dedicated cache filename records that automatic square art used the exact AppID.
pub fn needs_steam_square(game: &Game) -> bool {
    let Some(app_id) = resolve_steam_app_id(game) else {
        return false;
    };
    !game.artwork.icon.as_deref().is_some_and(|path| {
        Path::new(path)
            .file_stem()
            .is_some_and(|stem| stem == format!("steam-square-{app_id}").as_str())
            && Path::new(path).is_file()
    })
}

async fn download_steam_square(game_id: &str, app_id: &str, url: &str) -> Option<String> {
    let bytes = fetch_bytes(url).await.ok()?;
    let image = image::load_from_memory(&bytes).ok()?;
    if image.width() != image.height() || ![512, 1024].contains(&image.width()) {
        return None;
    }
    let mime = mime_from_bytes(&bytes, url);
    cache_artwork_bytes(game_id, &format!("steam-square-{app_id}"), &bytes, &mime)
        .ok()
        .map(|path| path_to_string(&path))
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

    if game.provider != GameProvider::Steam
        && !(game.provider == GameProvider::Manual
            && matches!(game.launch_config, LaunchConfiguration::Wine { .. }))
    {
        return None;
    }
    game.source_id
        .as_deref()
        .filter(|id| crate::services::steam_download::valid_app_id(id))
        .map(str::to_string)
}

fn should_update_title(game: &Game) -> bool {
    match game.provider {
        GameProvider::Astris | GameProvider::Manual => true,
        GameProvider::Steam => {
            let lower = game.title.trim().to_ascii_lowercase();
            lower.is_empty()
                || lower.starts_with("steam app ")
                || game.source_id.as_deref().is_some_and(|id| {
                    crate::services::steam_catalog::is_placeholder_title(&game.title, id)
                })
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
    fn manual_windows_manifest_identity_is_used_for_exact_steam_artwork() {
        let game: Game = serde_json::from_value(serde_json::json!({
            "id": "windows-gow", "title": "GodOfWar", "sortTitle": "godofwar",
            "provider": "manual", "platform": "windows", "sourceId": "1593500",
            "launchConfig": {"type": "wine", "profile": {"executable": "/games/GoW.exe", "runtimePath": "/wine", "arguments": [], "environment": {}}},
            "artwork": {}, "favorite": false, "hidden": false, "dateAdded": "2026-11-14",
            "totalPlaytimeSeconds": 0, "achievements": []
        })).unwrap();
        assert_eq!(resolve_steam_app_id(&game).as_deref(), Some("1593500"));
    }

    #[test]
    fn wine_steam_installs_keep_the_app_id_for_store_refresh() {
        let game: Game = serde_json::from_value(serde_json::json!({
            "id": "watch-dogs-2", "title": "Watch_Dogs 2", "sortTitle": "watch_dogs 2",
            "provider": "steam", "platform": "windows", "sourceId": "447040",
            "description": "Imported from a GameHub Steam install (AppID 447040). Play uses Orbit’s compatibility layer.",
            "launchConfig": {"type": "wine", "profile": {"executable": "/games/Watch_Dogs2/EAC.exe", "runtimePath": "/wine", "arguments": [], "environment": {}}},
            "artwork": {}, "favorite": false, "hidden": false, "dateAdded": "2026-11-14",
            "totalPlaytimeSeconds": 0, "achievements": []
        })).unwrap();
        assert_eq!(resolve_steam_app_id(&game).as_deref(), Some("447040"));
        assert!(is_placeholder_description(game.description.as_deref()));
    }

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
