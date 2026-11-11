use crate::database::GameRepository;
use crate::services::{
    public_artwork::{self, ArtworkSearchHit},
    steamgrid, thegamesdb,
};
use crate::utils::api_keys::{steamgriddb_api_key, thegamesdb_api_key};
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtworkSearchResults {
    pub hits: Vec<ArtworkSearchHit>,
    pub warnings: Vec<String>,
}

pub const ARTWORK_SLOTS: [&str; 4] = ["cover", "hero", "icon", "logo"];

/// TheGamesDB and public image search return box art or screenshots, never transparent logos.
fn slot_uses_general_providers(slot: &str) -> bool {
    slot != "logo"
}

/// Query every configured provider independently; one provider cannot starve the others.
pub async fn search(
    repo: &GameRepository,
    query: &str,
    slot: &str,
    game_id: Option<&str>,
    source: &str,
) -> Result<ArtworkSearchResults, String> {
    let query = query.trim();
    if query.is_empty() || query.len() > 200 {
        return Err("Enter a game title (up to 200 characters)".into());
    }
    if !ARTWORK_SLOTS.contains(&slot) {
        return Err("Unknown artwork slot".into());
    }
    if !["all", "steamgriddb", "other"].contains(&source) {
        return Err("Unknown artwork source".into());
    }
    let sgdb = steamgriddb_api_key(repo);
    let tgdb = thegamesdb_api_key(repo);
    let rawg = repo
        .get_setting("rawgApiKey")
        .ok()
        .flatten()
        .and_then(|v| v.as_str().map(str::to_string));
    let game = game_id
        .map(|id| repo.get_game(id))
        .transpose()
        .map_err(|e| e.to_string())?
        .flatten();
    let app_id = game
        .as_ref()
        .filter(|g| thegamesdb::normalize_title(&g.title) == thegamesdb::normalize_title(query))
        .and_then(crate::services::metadata_enrichment::resolve_steam_app_id);
    let platform_ids = game
        .as_ref()
        .map(|g| thegamesdb::platform_ids(&g.provider, &g.platform))
        .unwrap_or_default();
    let (steam, database, public, store) = tokio::join!(
        async {
            if source == "other" {
                return Ok(vec![]);
            }
            match sgdb {
                Some(key) => {
                    if source == "steamgriddb" {
                        steamgrid::search_matching_artwork(&key, query, slot, app_id.as_deref())
                            .await
                    } else {
                        steamgrid::search_artwork(&key, query, slot, app_id.as_deref()).await
                    }
                }
                None => Err(
                    "SteamGridDB: add your API key in Settings to browse or randomize artwork"
                        .into(),
                ),
            }
        },
        async {
            if source == "steamgriddb" || !slot_uses_general_providers(slot) {
                return Ok(vec![]);
            }
            match tgdb {
                Some(key) => tgdb_images(&key, query, slot, &platform_ids).await,
                None => Err("TheGamesDB: API key not configured".into()),
            }
        },
        async {
            if source == "steamgriddb" || !slot_uses_general_providers(slot) {
                return Ok(vec![]);
            }
            public_artwork::search_public_artwork(rawg.as_deref(), query, Some(24)).await
        },
        async {
            if source != "steamgriddb" {
                if let Some(id) = app_id.as_deref() {
                    return crate::services::steam_store_artwork::search(id, slot).await;
                }
            }
            Ok(vec![])
        }
    );
    let mut output = ArtworkSearchResults {
        hits: vec![],
        warnings: vec![],
    };
    for result in [steam, database, public, store] {
        match result {
            Ok(mut hits) => output.hits.append(&mut hits),
            Err(message) => output.warnings.push(message),
        }
    }
    let mut seen = std::collections::HashSet::new();
    output.hits.retain(|hit| seen.insert(hit.image_url.clone()));
    Ok(output)
}

async fn tgdb_images(
    key: &str,
    query: &str,
    slot: &str,
    platforms: &[i64],
) -> Result<Vec<ArtworkSearchHit>, String> {
    let games = thegamesdb::search_by_name(key, query, platforms).await?;
    let mut hits = vec![];
    for game in games.into_iter().take(3) {
        let images = thegamesdb::fetch_images(key, game.id).await?;
        let urls = match slot {
            "hero" => vec![images.hero_url, images.cover_url],
            _ => vec![images.cover_url, images.hero_url],
        };
        for (index, url) in urls.into_iter().enumerate() {
            if let Some(url) = url {
                hits.push(ArtworkSearchHit {
                    id: format!("tgdb-{}-{index}", game.id),
                    title: game.title.clone(),
                    preview_url: url.clone(),
                    image_url: url,
                    source: "TheGamesDB".into(),
                });
            }
        }
    }
    Ok(hits)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn logo_slot_only_uses_logo_capable_providers() {
        assert!(ARTWORK_SLOTS.contains(&"logo"));
        assert!(!slot_uses_general_providers("logo"));
        assert!(slot_uses_general_providers("cover"));
        assert!(slot_uses_general_providers("hero"));
    }
}
