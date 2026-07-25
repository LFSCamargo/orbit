use serde::Deserialize;

use crate::models::{GamePlatform, GameProvider};

const BASE_URL_V1: &str = "https://api.thegamesdb.net/v1";
const BASE_URL_V1_1: &str = "https://api.thegamesdb.net/v1.1";

#[derive(Debug, Clone)]
pub struct TgdbGameDetails {
    pub id: i64,
    pub title: String,
    pub overview: Option<String>,
    pub release_date: Option<String>,
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub platform_ids: Vec<i64>,
}

#[derive(Debug, Clone, Default)]
pub struct TgdbGameImages {
    pub cover_url: Option<String>,
    pub hero_url: Option<String>,
}

pub async fn search_by_name(
    api_key: &str,
    name: &str,
    platform_ids: &[i64],
) -> Result<Vec<TgdbGameDetails>, String> {
    for query in search_queries(name) {
        for use_platform_filter in [true, false] {
            let results =
                search_once(api_key, &query, platform_ids, use_platform_filter).await?;
            if !results.is_empty() {
                return Ok(results);
            }
        }
    }
    Ok(vec![])
}

pub async fn get_by_id(api_key: &str, game_id: i64) -> Result<Option<TgdbGameDetails>, String> {
    let url = format!(
        "{BASE_URL_V1}/Games/ByGameID?apikey={api_key}&id={game_id}&fields=players,publishers,genres,platforms,overview,rating,release_date,developers"
    );
    let json = tgdb_get(&url).await?;
    let envelope: TgdbListEnvelope = serde_json::from_value(json).map_err(|err| err.to_string())?;
    Ok(envelope
        .data
        .and_then(|data| data.games)
        .unwrap_or_default()
        .into_iter()
        .filter_map(map_game)
        .next())
}

pub async fn fetch_images(api_key: &str, game_id: i64) -> Result<TgdbGameImages, String> {
    let url = format!("{BASE_URL_V1}/Games/Images?apikey={api_key}&games_id={game_id}");
    let json = tgdb_get(&url).await?;
    let envelope: TgdbImagesEnvelope = serde_json::from_value(json).map_err(|err| err.to_string())?;
    let images_map = envelope.data.and_then(|data| data.images);

    let Some(images_map) = images_map else {
        return Ok(TgdbGameImages::default());
    };

    let Some(images) = images_map.get(&game_id.to_string()) else {
        return Ok(TgdbGameImages::default());
    };

    let cover_url = images
        .boxart
        .as_ref()
        .and_then(|b| b.front.as_deref().or(b.back.as_deref()))
        .map(|value| resolve_image_url("boxart", value));
    let hero_url = images
        .fanart
        .as_ref()
        .and_then(|fanart| fanart.values().next().map(String::as_str))
        .map(|value| resolve_image_url("fanart", value))
        .or_else(|| {
            images
                .screenshots
                .as_ref()
                .and_then(|shots| shots.values().next().map(String::as_str))
                .map(|value| resolve_image_url("screenshot", value))
        });

    Ok(TgdbGameImages {
        cover_url,
        hero_url,
    })
}

pub fn platform_ids(provider: &GameProvider, platform: &GamePlatform) -> Vec<i64> {
    match platform {
        GamePlatform::NintendoSwitch => vec![4971],
        GamePlatform::Macos => vec![2, 1],
        GamePlatform::Windows => vec![1],
        GamePlatform::Linux => vec![3, 1],
        GamePlatform::Unknown => match provider {
            GameProvider::Astris => vec![4971],
            GameProvider::Steam | GameProvider::Gamehub => vec![1, 2],
            _ => vec![1, 2, 4971],
        },
    }
}

pub fn score_match(imported_title: &str, candidate: &TgdbGameDetails, platform_ids: &[i64]) -> u8 {
    let normalized_import = normalize_title(imported_title);
    let normalized_candidate = normalize_title(&candidate.title);
    let platform_match = platform_ids.is_empty()
        || candidate
            .platform_ids
            .iter()
            .any(|id| platform_ids.contains(id));

    if normalized_import == normalized_candidate && platform_match {
        return 95;
    }
    if normalized_import == normalized_candidate {
        return 85;
    }
    if (normalized_import.contains(&normalized_candidate)
        || normalized_candidate.contains(&normalized_import))
        && platform_match
    {
        return 70;
    }
    if normalized_import.contains(&normalized_candidate)
        || normalized_candidate.contains(&normalized_import)
    {
        return 65;
    }
    50
}

fn search_queries(name: &str) -> Vec<String> {
    let trimmed = name.trim();
    let mut queries = vec![trimmed.to_string()];

    if let Some((head, _)) = trimmed.split_once(':') {
        let head = head.trim();
        if !head.is_empty() && head.len() >= 3 {
            queries.push(head.to_string());
        }
    }
    if let Some((head, _)) = trimmed.split_once(" - ") {
        let head = head.trim();
        if !head.is_empty() && !queries.iter().any(|q| q.eq_ignore_ascii_case(head)) {
            queries.push(head.to_string());
        }
    }

    queries.dedup();
    queries
}

async fn search_once(
    api_key: &str,
    name: &str,
    platform_ids: &[i64],
    use_platform_filter: bool,
) -> Result<Vec<TgdbGameDetails>, String> {
    let escaped = urlencoding::encode(name.trim());
    let mut url = format!(
        "{BASE_URL_V1_1}/Games/ByGameName?apikey={api_key}&name={escaped}&fields=players,publishers,genres,platforms,overview,rating,release_date,developers"
    );
    if use_platform_filter {
        if let Some(platform_id) = platform_ids.first() {
            url.push_str(&format!("&filter[platform]={platform_id}"));
        }
    }

    let json = tgdb_get(&url).await?;
    let envelope: TgdbListEnvelope = serde_json::from_value(json).map_err(|err| err.to_string())?;
    Ok(envelope
        .data
        .and_then(|data| data.games)
        .unwrap_or_default()
        .into_iter()
        .filter_map(map_game)
        .collect())
}

fn normalize_title(value: &str) -> String {
    value
        .to_ascii_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || c.is_ascii_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn resolve_image_url(kind: &str, value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return trimmed.to_string();
    }

    let path = if trimmed.contains('/') {
        trimmed.trim_start_matches('/').to_string()
    } else {
        match kind {
            "boxart" => format!("boxart/front/{trimmed}"),
            "fanart" => format!("fanart/{trimmed}"),
            "screenshot" => format!("screenshots/{trimmed}"),
            _ => trimmed.to_string(),
        }
    };

    if path.ends_with(".jpg") || path.ends_with(".png") {
        format!("https://cdn.thegamesdb.net/images/original/{path}")
    } else {
        format!("https://cdn.thegamesdb.net/images/original/{path}.jpg")
    }
}

async fn tgdb_get(url: &str) -> Result<serde_json::Value, String> {
    let client = crate::services::http::orbit_client()?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|err| err.to_string())?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("TheGamesDB API key is invalid".into());
    }
    if !response.status().is_success() {
        return Err(format!(
            "TheGamesDB request failed (HTTP {})",
            response.status()
        ));
    }
    response.json().await.map_err(|err| err.to_string())
}

fn map_game(raw: TgdbGameRow) -> Option<TgdbGameDetails> {
    let id = raw.id?;
    let title = raw
        .game_title
        .or(raw.game_title_bak)
        .filter(|s| !s.trim().is_empty())?;
    let platform_ids = raw
        .platform
        .map(|id| vec![id])
        .or_else(|| raw.platforms.clone())
        .unwrap_or_default();

    Some(TgdbGameDetails {
        id,
        title,
        overview: raw.overview.filter(|s| !s.trim().is_empty()),
        release_date: raw.release_date.filter(|s| !s.trim().is_empty()),
        developer: None,
        publisher: None,
        platform_ids,
    })
}

#[derive(Debug, Deserialize)]
struct TgdbListEnvelope {
    data: Option<TgdbListData>,
}

#[derive(Debug, Deserialize)]
struct TgdbListData {
    games: Option<Vec<TgdbGameRow>>,
}

#[derive(Debug, Deserialize)]
struct TgdbGameRow {
    id: Option<i64>,
    game_title: Option<String>,
    game_title_bak: Option<String>,
    release_date: Option<String>,
    overview: Option<String>,
    platform: Option<i64>,
    #[serde(default)]
    platforms: Option<Vec<i64>>,
    #[serde(default, deserialize_with = "deserialize_optional_id_list")]
    developers: Option<Vec<i64>>,
    #[serde(default, deserialize_with = "deserialize_optional_id_list")]
    publishers: Option<Vec<i64>>,
}

fn deserialize_optional_id_list<'de, D>(deserializer: D) -> Result<Option<Vec<i64>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value: Option<serde_json::Value> = Option::deserialize(deserializer)?;
    let Some(value) = value else {
        return Ok(None);
    };

    match value {
        serde_json::Value::Array(items) => {
            let mut ids = Vec::with_capacity(items.len());
            for item in items {
                match item {
                    serde_json::Value::Number(number) => {
                        if let Some(id) = number.as_i64() {
                            ids.push(id);
                        }
                    }
                    serde_json::Value::Object(object) => {
                        if let Some(serde_json::Value::Number(number)) = object.get("id") {
                            if let Some(id) = number.as_i64() {
                                ids.push(id);
                            }
                        }
                    }
                    _ => {}
                }
            }
            Ok(Some(ids))
        }
        _ => Ok(None),
    }
}

#[derive(Debug, Deserialize)]
struct TgdbImagesEnvelope {
    data: Option<TgdbImagesData>,
}

#[derive(Debug, Deserialize)]
struct TgdbImagesData {
    images: Option<std::collections::HashMap<String, TgdbImageSet>>,
}

#[derive(Debug, Deserialize)]
struct TgdbImageSet {
    boxart: Option<TgdbBoxart>,
    fanart: Option<std::collections::HashMap<String, String>>,
    screenshots: Option<std::collections::HashMap<String, String>>,
}

#[derive(Debug, Deserialize)]
struct TgdbBoxart {
    front: Option<String>,
    back: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scores_exact_title_high() {
        let candidate = TgdbGameDetails {
            id: 1,
            title: "Cyberpunk 2077".into(),
            overview: None,
            release_date: None,
            developer: None,
            publisher: None,
            platform_ids: vec![1],
        };
        assert!(score_match("Cyberpunk 2077", &candidate, &[1]) >= 95);
    }

    #[test]
    fn scores_dmc_without_colon() {
        let candidate = TgdbGameDetails {
            id: 6431,
            title: "DmC: Devil May Cry".into(),
            overview: None,
            release_date: None,
            developer: None,
            publisher: None,
            platform_ids: vec![1],
        };
        assert!(score_match("DmC Devil May Cry", &candidate, &[1]) >= 95);
    }

    #[test]
    fn parses_dmc_search_payload() {
        let json: serde_json::Value = serde_json::from_str(
            r#"{"code":200,"status":"Success","data":{"count":1,"games":[{"id":6431,"game_title":"DmC: Devil May Cry","release_date":"2013-01-15","platform":1,"overview":"Reboot","developers":[6032],"publishers":[9]}]}}"#,
        )
        .unwrap();
        let envelope: TgdbListEnvelope = serde_json::from_value(json).unwrap();
        let game = envelope
            .data
            .unwrap()
            .games
            .unwrap()
            .into_iter()
            .filter_map(map_game)
            .next()
            .unwrap();
        assert_eq!(game.id, 6431);
        assert_eq!(game.title, "DmC: Devil May Cry");
        assert_eq!(game.overview.as_deref(), Some("Reboot"));
    }

    #[test]
    fn builds_cdn_urls_for_relative_artwork_ids() {
        assert_eq!(
            resolve_image_url("boxart", "243711-1"),
            "https://cdn.thegamesdb.net/images/original/boxart/front/243711-1.jpg"
        );
    }

    #[test]
    fn generates_fallback_search_queries() {
        let queries = search_queries("DmC: Devil May Cry");
        assert_eq!(queries[0], "DmC: Devil May Cry");
        assert!(queries.iter().any(|q| q == "DmC"));
    }
}
