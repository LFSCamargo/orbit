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

async fn sgdb_get(api_key: &str, url: &str) -> Result<serde_json::Value, String> {
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
