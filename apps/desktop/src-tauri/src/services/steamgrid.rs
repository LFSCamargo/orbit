use serde::Deserialize;

#[derive(Debug, Clone, Default)]
pub struct SteamGridAssets {
    pub cover_url: Option<String>,
    pub hero_url: Option<String>,
    pub logo_url: Option<String>,
    pub icon_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SgdbEnvelope<T> {
    success: bool,
    data: Option<T>,
}

#[derive(Debug, Deserialize)]
struct SgdbGame {
    id: i64,
}

#[derive(Debug, Deserialize)]
struct SgdbImage {
    url: String,
    #[serde(default)]
    score: Option<i64>,
    #[serde(default)]
    style: Option<String>,
}

/// Resolve SteamGridDB artwork URLs for a Steam app ID.
/// Prefer highest score; for grids prefer common vertical styles when available.
pub async fn fetch_steamgrid_assets(
    api_key: &str,
    steam_app_id: &str,
) -> Result<SteamGridAssets, String> {
    let game_id = lookup_game_id(api_key, steam_app_id).await?;
    let (cover, hero, logo, icon) = tokio::join!(
        fetch_best_image(api_key, "grids", game_id, true),
        fetch_best_image(api_key, "heroes", game_id, false),
        fetch_best_image(api_key, "logos", game_id, false),
        fetch_best_image(api_key, "icons", game_id, false),
    );

    let cover_url = cover.ok().flatten();
    let icon_url = resolve_icon_url(icon.ok().flatten(), cover_url.clone());

    Ok(SteamGridAssets {
        cover_url,
        hero_url: hero.ok().flatten(),
        logo_url: logo.ok().flatten(),
        icon_url,
    })
}

async fn lookup_game_id(api_key: &str, steam_app_id: &str) -> Result<i64, String> {
    let url = format!("https://www.steamgriddb.com/api/v2/games/steam/{steam_app_id}");
    let json = sgdb_get(api_key, &url).await?;
    let envelope: SgdbEnvelope<SgdbGame> =
        serde_json::from_value(json).map_err(|err| err.to_string())?;
    if !envelope.success {
        return Err("SteamGridDB game lookup failed".into());
    }
    envelope
        .data
        .map(|game| game.id)
        .ok_or_else(|| "SteamGridDB returned no game id".into())
}

async fn fetch_best_image(
    api_key: &str,
    kind: &str,
    game_id: i64,
    prefer_vertical_grid: bool,
) -> Result<Option<String>, String> {
    let url = format!("https://www.steamgriddb.com/api/v2/{kind}/game/{game_id}");
    let json = sgdb_get(api_key, &url).await?;
    let envelope: SgdbEnvelope<Vec<SgdbImage>> =
        serde_json::from_value(json).map_err(|err| err.to_string())?;
    if !envelope.success {
        return Ok(None);
    }
    let images = envelope.data.unwrap_or_default();
    Ok(pick_best_image(&images, prefer_vertical_grid))
}

fn pick_best_image(images: &[SgdbImage], prefer_vertical_grid: bool) -> Option<String> {
    if images.is_empty() {
        return None;
    }

    let mut ranked: Vec<&SgdbImage> = images.iter().collect();
    ranked.sort_by(|a, b| {
        let style_rank = |img: &SgdbImage| -> i32 {
            if !prefer_vertical_grid {
                return 0;
            }
            match img.style.as_deref() {
                Some("alternate") | Some("white_logo") | Some("material") | Some("no_logo") => 2,
                Some("blurred") => 1,
                _ => 0,
            }
        };
        style_rank(b)
            .cmp(&style_rank(a))
            .then(b.score.unwrap_or(0).cmp(&a.score.unwrap_or(0)))
    });
    ranked.first().map(|img| img.url.clone())
}

fn resolve_icon_url(icon: Option<String>, cover: Option<String>) -> Option<String> {
    icon.or(cover)
}

pub(crate) async fn sgdb_get(api_key: &str, url: &str) -> Result<serde_json::Value, String> {
    let client = crate::services::http::orbit_client()?;
    let response = client
        .get(url)
        .bearer_auth(api_key.trim())
        .send()
        .await
        .map_err(|err| err.to_string())?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("SteamGridDB API key is invalid".into());
    }
    if !response.status().is_success() {
        return Err(format!(
            "SteamGridDB request failed (HTTP {})",
            response.status()
        ));
    }
    response.json().await.map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefers_higher_score() {
        let images = vec![
            SgdbImage {
                url: "low.jpg".into(),
                score: Some(10),
                style: None,
            },
            SgdbImage {
                url: "high.jpg".into(),
                score: Some(99),
                style: None,
            },
        ];
        assert_eq!(pick_best_image(&images, false).as_deref(), Some("high.jpg"));
    }

    #[test]
    fn icon_falls_back_to_cover_url() {
        assert_eq!(
            resolve_icon_url(Some("square.jpg".into()), Some("portrait.jpg".into())).as_deref(),
            Some("square.jpg")
        );
        assert_eq!(
            resolve_icon_url(None, Some("portrait.jpg".into())).as_deref(),
            Some("portrait.jpg")
        );
    }
}

/// Resolve by stable Steam identity, or an exact normalized title (never a guessed sequel).
pub async fn matching_game(
    api_key: &str,
    title: &str,
    app_id: Option<&str>,
) -> Result<Option<(i64, String)>, String> {
    if let Some(app_id) = app_id {
        if app_id.is_empty() || !app_id.chars().all(|c| c.is_ascii_digit()) {
            return Err("Invalid Steam app ID".into());
        }
        let value = sgdb_get(
            api_key,
            &format!("https://www.steamgriddb.com/api/v2/games/steam/{app_id}"),
        )
        .await?;
        let response: SgdbEnvelope<SearchGame> =
            serde_json::from_value(value).map_err(|e| e.to_string())?;
        return Ok(response
            .data
            .filter(|g| response.success && !g.name.trim().is_empty())
            .map(|g| (g.id, g.name)));
    }
    let games = search_games(api_key, title).await?;
    Ok(games
        .into_iter()
        .find(|g| titles_match(title, &g.name))
        .map(|g| (g.id, g.name)))
}

fn titles_match(a: &str, b: &str) -> bool {
    let normalized = crate::services::thegamesdb::normalize_title(a);
    !normalized.is_empty() && normalized == crate::services::thegamesdb::normalize_title(b)
}

#[derive(Deserialize)]
struct SearchGame {
    id: i64,
    name: String,
}

async fn search_games(key: &str, title: &str) -> Result<Vec<SearchGame>, String> {
    let value = sgdb_get(
        key,
        &format!(
            "https://www.steamgriddb.com/api/v2/search/autocomplete/{}",
            urlencoding::encode(title)
        ),
    )
    .await?;
    let response: SgdbEnvelope<Vec<SearchGame>> =
        serde_json::from_value(value).map_err(|e| e.to_string())?;
    if !response.success {
        return Err("SteamGridDB search failed".into());
    }
    Ok(response.data.unwrap_or_default())
}

#[derive(Deserialize)]
struct SearchImage {
    id: i64,
    url: String,
    thumb: Option<String>,
    #[serde(default)]
    score: i64,
}

fn slot_endpoint(slot: &str) -> Option<(&'static str, &'static str)> {
    match slot {
        "cover" => Some(("grids", "&dimensions=600x900,342x482,660x930")),
        "hero" => Some(("heroes", "")),
        "icon" => Some(("grids", "&dimensions=512x512,1024x1024")),
        "logo" => Some(("logos", "")),
        _ => None,
    }
}

async fn image_hits(
    key: &str,
    id: i64,
    title: &str,
    slot: &str,
) -> Result<Vec<crate::services::public_artwork::ArtworkSearchHit>, String> {
    let (kind, dimensions) = slot_endpoint(slot).ok_or("Unknown artwork slot")?;
    let mut value = sgdb_get(key, &format!("https://www.steamgriddb.com/api/v2/{kind}/game/{id}?types=static&nsfw=false&humor=false{dimensions}")).await?;
    let mut response: SgdbEnvelope<Vec<SearchImage>> =
        serde_json::from_value(value.take()).map_err(|e| e.to_string())?;
    if !response.success {
        return Err("SteamGridDB image lookup failed".into());
    }
    if slot == "icon" && response.data.as_ref().is_none_or(Vec::is_empty) {
        value = sgdb_get(key, &format!("https://www.steamgriddb.com/api/v2/icons/game/{id}?types=static&nsfw=false&humor=false")).await?;
        response = serde_json::from_value(value).map_err(|e| e.to_string())?;
    }
    let mut images = response.data.unwrap_or_default();
    images.sort_by_key(|image| std::cmp::Reverse(image.score));
    Ok(images
        .into_iter()
        .filter(|image| image.url.starts_with("https://"))
        .take(48)
        .map(|image| crate::services::public_artwork::ArtworkSearchHit {
            id: format!("sgdb-{slot}-{}", image.id),
            title: title.to_string(),
            preview_url: image.thumb.unwrap_or_else(|| image.url.clone()),
            image_url: image.url,
            source: "SteamGridDB".into(),
        })
        .collect())
}

pub async fn search_artwork(
    key: &str,
    query: &str,
    slot: &str,
    app_id: Option<&str>,
) -> Result<Vec<crate::services::public_artwork::ArtworkSearchHit>, String> {
    let games = if app_id.is_some() {
        matching_game(key, query, app_id)
            .await?
            .map(|(id, name)| vec![SearchGame { id, name }])
            .unwrap_or_default()
    } else {
        search_games(key, query)
            .await?
            .into_iter()
            .take(3)
            .collect()
    };
    let mut hits = vec![];
    for game in games {
        hits.extend(image_hits(key, game.id, &game.name, slot).await?);
    }
    Ok(hits)
}

pub async fn fetch_matching_assets(
    key: &str,
    title: &str,
    app_id: Option<&str>,
) -> Result<Option<(String, SteamGridAssets)>, String> {
    let Some((id, title)) = matching_game(key, title, app_id).await? else {
        return Ok(None);
    };
    let (cover, hero, icon) = tokio::join!(
        image_hits(key, id, &title, "cover"),
        image_hits(key, id, &title, "hero"),
        image_hits(key, id, &title, "icon")
    );
    let first = |result: Result<Vec<crate::services::public_artwork::ArtworkSearchHit>, String>| {
        result
            .ok()
            .and_then(|hits| hits.into_iter().next())
            .map(|hit| hit.image_url)
    };
    Ok(Some((
        title,
        SteamGridAssets {
            cover_url: first(cover),
            hero_url: first(hero),
            icon_url: first(icon),
            logo_url: None,
        },
    )))
}

#[cfg(test)]
mod matching_tests {
    use super::*;
    #[test]
    fn accepts_title_punctuation_but_not_different_games() {
        assert!(titles_match("Portal 2™", "PORTAL 2"));
        assert!(!titles_match("Portal", "Portal 2"));
        assert!(!titles_match("", ""));
    }

    #[test]
    fn maps_logo_slot_to_logos_endpoint() {
        assert_eq!(slot_endpoint("logo"), Some(("logos", "")));
        assert_eq!(slot_endpoint("hero"), Some(("heroes", "")));
        assert_eq!(slot_endpoint("banner"), None);
    }
}

pub async fn search_matching_artwork(
    key: &str,
    query: &str,
    slot: &str,
    app_id: Option<&str>,
) -> Result<Vec<crate::services::public_artwork::ArtworkSearchHit>, String> {
    let Some((id, title)) = matching_game(key, query, app_id).await? else {
        return Ok(vec![]);
    };
    image_hits(key, id, &title, slot).await
}
