use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use tauri::State;

use crate::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtworkSearchHit {
    pub id: String,
    pub title: String,
    pub preview_url: String,
    pub image_url: String,
    pub source: String,
}

#[tauri::command]
pub async fn read_artwork_from_path(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|err| err.to_string())?;
    let mime = mime_from_path(&path);
    Ok(to_data_url(&bytes, &mime))
}

#[tauri::command]
pub async fn fetch_artwork_from_url(url: String) -> Result<String, String> {
    let bytes = fetch_bytes(&url).await?;
    let mime = mime_from_url(&url, &bytes);
    Ok(to_data_url(&bytes, &mime))
}

#[tauri::command]
pub async fn search_public_artwork(
    state: State<'_, AppState>,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<ArtworkSearchHit>, String> {
    let limit = limit.unwrap_or(12).min(24);
    let mut hits = Vec::new();

    if let Ok(rawg_key) = rawg_api_key(&state) {
        if let Ok(mut rawg_hits) = search_rawg(&query, &rawg_key, limit).await {
            hits.append(&mut rawg_hits);
        }
    }

    if hits.len() < limit as usize {
        if let Ok(mut wiki_hits) = search_wikimedia(&query, limit - hits.len() as u32).await {
            hits.append(&mut wiki_hits);
        }
    }

    Ok(hits)
}

fn to_data_url(bytes: &[u8], mime: &str) -> String {
    format!("data:{mime};base64,{}", STANDARD.encode(bytes))
}

fn mime_from_path(path: &str) -> String {
    let lower = path.to_lowercase();
    if lower.ends_with(".png") {
        "image/png".into()
    } else if lower.ends_with(".webp") {
        "image/webp".into()
    } else if lower.ends_with(".gif") {
        "image/gif".into()
    } else {
        "image/jpeg".into()
    }
}

fn mime_from_url(url: &str, bytes: &[u8]) -> String {
    let lower = url.to_lowercase();
    if lower.contains(".png") {
        return "image/png".into();
    }
    if lower.contains(".webp") {
        return "image/webp".into();
    }
    if bytes.starts_with(b"\x89PNG") {
        return "image/png".into();
    }
    if bytes.starts_with(b"RIFF") && bytes.len() > 12 && &bytes[8..12] == b"WEBP" {
        return "image/webp".into();
    }
    "image/jpeg".into()
}

async fn fetch_bytes(url: &str) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::builder()
        .user_agent("Orbit/0.1 (+https://github.com/orbit-launcher)")
        .build()
        .map_err(|err| err.to_string())?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Failed to download image (HTTP {})", response.status()));
    }
    response.bytes().await.map_err(|err| err.to_string()).map(|b| b.to_vec())
}

fn rawg_api_key(state: &State<'_, AppState>) -> Result<String, String> {
    state
        .repo
        .get_setting("rawgApiKey")
        .map_err(|err| err.to_string())?
        .and_then(|value| value.as_str().map(|s| s.to_string()))
        .filter(|key| !key.trim().is_empty())
        .ok_or_else(|| "RAWG API key not configured".into())
}

async fn search_rawg(query: &str, api_key: &str, limit: u32) -> Result<Vec<ArtworkSearchHit>, String> {
    let url = format!(
        "https://api.rawg.io/api/games?key={api_key}&search={}&page_size={limit}",
        urlencoding::encode(query)
    );
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err("RAWG search failed".into());
    }
    let json: serde_json::Value = response.json().await.map_err(|err| err.to_string())?;
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
                title: name.clone(),
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
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|err| err.to_string())?;
    let json: serde_json::Value = response.json().await.map_err(|err| err.to_string())?;
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
