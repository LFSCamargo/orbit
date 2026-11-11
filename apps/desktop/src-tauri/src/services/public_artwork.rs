use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;

use crate::services::artwork::mime_from_bytes;
use crate::services::http::{fetch_bytes, orbit_client};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtworkSearchHit {
    pub id: String,
    pub title: String,
    pub preview_url: String,
    pub image_url: String,
    pub source: String,
}

/// Download an image URL and return a data-URL (base64) string.
pub async fn fetch_artwork_from_url(url: &str) -> Result<String, String> {
    let bytes = fetch_bytes(url).await?;
    image::load_from_memory(&bytes)
        .map_err(|_| "The download is not a supported PNG, JPEG, or WebP image".to_string())?;
    let mime = mime_from_bytes(&bytes, url);
    Ok(to_data_url(&bytes, &mime))
}

/// Search both public providers independently so every available source is represented.
pub async fn search_public_artwork(
    rawg_api_key: Option<&str>,
    query: &str,
    limit: Option<u32>,
) -> Result<Vec<ArtworkSearchHit>, String> {
    let limit = limit.unwrap_or(12).min(24);
    let (rawg, wiki) = tokio::join!(
        async {
            match rawg_api_key.filter(|k| !k.trim().is_empty()) {
                Some(key) => search_rawg(query, key, limit).await,
                None => Ok(vec![]),
            }
        },
        search_wikimedia(query, limit),
    );
    let rawg_configured = rawg_api_key.is_some_and(|key| !key.trim().is_empty());
    let attempted = if rawg_configured {
        vec![rawg, wiki]
    } else {
        vec![wiki]
    };
    let mut hits = vec![];
    let mut succeeded = false;
    for mut found in attempted.into_iter().flatten() {
        succeeded = true;
        hits.append(&mut found);
    }
    if !succeeded {
        return Err("Public artwork sources are unavailable. Try again later.".into());
    }

    Ok(hits)
}

fn to_data_url(bytes: &[u8], mime: &str) -> String {
    format!("data:{mime};base64,{}", STANDARD.encode(bytes))
}

pub(crate) async fn search_rawg(
    query: &str,
    api_key: &str,
    limit: u32,
) -> Result<Vec<ArtworkSearchHit>, String> {
    let url = format!(
        "https://api.rawg.io/api/games?key={api_key}&search={}&page_size={limit}",
        urlencoding::encode(query)
    );
    let client = orbit_client()?;
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|err| err.without_url().to_string())?;
    if !response.status().is_success() {
        return Err("RAWG search failed".into());
    }
    let response = response
        .error_for_status()
        .map_err(|err| err.without_url().to_string())?;
    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|err| err.without_url().to_string())?;
    let results = json
        .get("results")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    Ok(results
        .into_iter()
        .filter_map(|item| {
            let id = item.get("id")?.as_i64()?;
            let name = item.get("name")?.as_str()?.to_string();
            let background = item
                .get("background_image")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())?;
            Some(ArtworkSearchHit {
                id: format!("rawg-{id}"),
                title: name,
                preview_url: background.to_string(),
                image_url: background.to_string(),
                source: "RAWG".into(),
            })
        })
        .collect())
}

async fn search_wikimedia(query: &str, limit: u32) -> Result<Vec<ArtworkSearchHit>, String> {
    let search = format!("{query} video game cover art");
    let url = format!(
        "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch={}&gsrnamespace=6&gsrlimit={limit}&prop=imageinfo&iiprop=url&iiurlwidth=512",
        urlencoding::encode(&search)
    );
    let client = orbit_client()?;
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|err| err.without_url().to_string())?;
    let response = response
        .error_for_status()
        .map_err(|err| err.without_url().to_string())?;
    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|err| err.without_url().to_string())?;
    let pages = json
        .pointer("/query/pages")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    let mut hits = Vec::new();
    for (page_id, page) in pages {
        let title = page
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Artwork")
            .to_string();
        let image_info = page
            .get("imageinfo")
            .and_then(|v| v.as_array())
            .and_then(|arr| arr.first());
        let Some(info) = image_info else {
            continue;
        };
        let thumb = info
            .get("thumburl")
            .and_then(|v| v.as_str())
            .or_else(|| info.get("url").and_then(|v| v.as_str()));
        let full = info.get("url").and_then(|v| v.as_str()).or(thumb);
        let (Some(preview), Some(image)) = (thumb, full) else {
            continue;
        };
        hits.push(ArtworkSearchHit {
            id: format!("wiki-{page_id}"),
            title,
            preview_url: preview.to_string(),
            image_url: image.to_string(),
            source: "Wikimedia".into(),
        });
    }
    Ok(hits)
}
