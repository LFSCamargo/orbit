use serde::Serialize;
use tauri::State;

use crate::services::metadata_enrichment::MetadataEnrichmentService;
use crate::services::thegamesdb;
use crate::utils::api_keys::{steamgriddb_api_key, thegamesdb_api_key};
use crate::utils::paths::metadata_cache_path;
use crate::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnrichGameResult {
    pub enriched: bool,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnrichGamesResult {
    pub enriched: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataCacheStats {
    pub game_count: usize,
    pub db_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataApiTestResult {
    pub thegamesdb_ok: bool,
    pub steamgriddb_ok: bool,
    pub message: String,
}

#[tauri::command]
pub async fn enrich_game_metadata(
    state: State<'_, AppState>,
    game_id: String,
) -> Result<EnrichGameResult, String> {
    let result =
        MetadataEnrichmentService::enrich_game(&state.repo, &state.metadata_cache, &game_id).await?;
    Ok(EnrichGameResult {
        enriched: result.enriched,
        message: result.message,
    })
}

#[tauri::command]
pub async fn enrich_games_metadata(
    state: State<'_, AppState>,
    game_ids: Vec<String>,
) -> Result<EnrichGamesResult, String> {
    let enriched =
        MetadataEnrichmentService::enrich_games(&state.repo, &state.metadata_cache, &game_ids)
            .await?;
    Ok(EnrichGamesResult { enriched })
}

#[tauri::command]
pub fn get_metadata_cache_stats(state: State<'_, AppState>) -> Result<MetadataCacheStats, String> {
    Ok(MetadataCacheStats {
        game_count: state.metadata_cache.count().unwrap_or(0),
        db_path: metadata_cache_path().to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub async fn test_metadata_api_keys(
    state: State<'_, AppState>,
) -> Result<MetadataApiTestResult, String> {
    let mut thegamesdb_ok = false;
    let mut steamgriddb_ok = false;
    let mut messages: Vec<String> = Vec::new();

    if let Some(key) = thegamesdb_api_key(&state.repo) {
        match thegamesdb::search_by_name(&key, "Portal", &[1]).await {
            Ok(results) if !results.is_empty() => {
                thegamesdb_ok = true;
                messages.push("TheGamesDB connected".into());
            }
            Ok(_) => messages.push("TheGamesDB key valid but test search returned no results".into()),
            Err(err) => messages.push(format!("TheGamesDB: {err}")),
        }
    } else {
        messages.push("TheGamesDB key not configured".into());
    }

    if let Some(key) = steamgriddb_api_key(&state.repo) {
        match crate::services::steamgrid::fetch_steamgrid_assets(&key, "620").await {
            Ok(_) => {
                steamgriddb_ok = true;
                messages.push("SteamGridDB connected".into());
            }
            Err(err) => messages.push(format!("SteamGridDB: {err}")),
        }
    } else {
        messages.push("SteamGridDB key not configured".into());
    }

    Ok(MetadataApiTestResult {
        thegamesdb_ok,
        steamgriddb_ok,
        message: messages.join(" · "),
    })
}
