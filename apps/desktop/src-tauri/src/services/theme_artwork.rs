use crate::services::{artwork, steamgrid};
use serde::{Deserialize, Serialize};

const MAX_BYTES: usize = 25 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeArtworkHit {
    pub id: String,
    pub title: String,
    pub preview_url: String,
    pub image_url: String,
    pub source: String,
    pub width: u32,
    pub height: u32,
}
#[derive(Deserialize)]
struct Image {
    id: i64,
    url: String,
    thumb: Option<String>,
    #[serde(default)]
    width: u32,
    #[serde(default)]
    height: u32,
    #[serde(default)]
    score: i64,
}
#[derive(Deserialize)]
struct Response {
    success: bool,
    data: Option<Vec<Image>>,
}

fn eligible(slot: &str, width: u32, height: u32) -> bool {
    height > 0
        && match slot {
            "hero" | "logo" => width > 0,
            _ => false,
        }
}
fn cdn_url(value: &str) -> bool {
    reqwest::Url::parse(value).is_ok_and(|url| {
        url.scheme() == "https"
            && url.port().is_none()
            && url.username().is_empty()
            && url.password().is_none()
            && matches!(
                url.host_str(),
                Some("cdn.steamgriddb.com" | "cdn2.steamgriddb.com")
            )
    })
}

pub async fn search(key: &str, query: &str, slot: &str) -> Result<Vec<ThemeArtworkHit>, String> {
    let query = query.trim();
    if query.is_empty() || query.len() > 200 {
        return Err("Enter a game title (up to 200 characters)".into());
    }
    let kind = match slot {
        "hero" => "heroes",
        "logo" => "logos",
        _ => return Err("Theme artwork must be a logo or hero".into()),
    };
    let Some((id, title)) = steamgrid::matching_game(key, query, None).await? else {
        return Ok(vec![]);
    };
    let value = steamgrid::sgdb_get(key, &format!("https://www.steamgriddb.com/api/v2/{kind}/game/{id}?types=static&nsfw=false&humor=false")).await?;
    let response: Response =
        serde_json::from_value(value).map_err(|_| "Invalid SteamGridDB artwork response")?;
    if !response.success {
        return Err("SteamGridDB artwork lookup failed".into());
    }
    let mut images = response.data.unwrap_or_default();
    images.retain(|image| eligible(slot, image.width, image.height) && cdn_url(&image.url));
    images.sort_by_key(|image| std::cmp::Reverse(image.score));
    Ok(images
        .into_iter()
        .take(48)
        .map(|image| ThemeArtworkHit {
            id: format!("sgdb-{slot}-{}", image.id),
            title: title.clone(),
            preview_url: image
                .thumb
                .filter(|url| cdn_url(url))
                .unwrap_or_else(|| image.url.clone()),
            image_url: image.url,
            source: "SteamGridDB".into(),
            width: image.width,
            height: image.height,
        })
        .collect())
}

fn validate_image(bytes: &[u8], slot: &str) -> Result<(), String> {
    let mut reader = image::ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| "Invalid artwork image")?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(16384);
    limits.max_image_height = Some(16384);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    let image = reader
        .decode()
        .map_err(|_| "Artwork is invalid or too large")?;
    if !eligible(slot, image.width(), image.height()) {
        return Err("Theme artwork must have valid dimensions".into());
    }
    Ok(())
}

fn allowed_download(slot: &str, url: &str) -> bool {
    if !matches!(slot, "logo" | "hero") {
        return false;
    }
    if cdn_url(url) {
        return true;
    }
    slot == "hero"
        && reqwest::Url::parse(url).is_ok_and(|url| {
            url.scheme() == "https"
                && url.port().is_none()
                && url.username().is_empty()
                && url.password().is_none()
                && matches!(
                    url.host_str(),
                    Some("cdn.thegamesdb.net" | "media.rawg.io" | "upload.wikimedia.org")
                )
        })
}

pub async fn download(url: &str, slot: &str) -> Result<String, String> {
    if !allowed_download(slot, url) {
        return Err("Choose an image from an approved artwork source".into());
    }
    let client = reqwest::Client::builder()
        .user_agent("Orbit/0.3")
        .timeout(std::time::Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Could not initialize artwork download")?;
    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|_| "Artwork download failed")?;
    if !response.status().is_success() {
        return Err("Artwork is unavailable".into());
    }
    if response
        .content_length()
        .is_some_and(|n| n > MAX_BYTES as u64)
    {
        return Err("Artwork exceeds the 25 MB limit".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Artwork download interrupted")?
    {
        if bytes.len() + chunk.len() > MAX_BYTES {
            return Err("Artwork exceeds the 25 MB limit".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let slot = slot.to_string();
    let cache_id = format!("optimized-theme-{}", sanitize_cache_id(url));
    tauri::async_runtime::spawn_blocking(move || {
        let kind = if slot == "logo" {
            orbit_images::Slot::Logo
        } else {
            orbit_images::Slot::Hero
        };
        let optimized =
            orbit_images::optimize_theme(&bytes, kind).ok_or("Artwork is invalid or too large")?;
        let path =
            artwork::cache_artwork_bytes(&cache_id, &slot, &optimized.bytes, optimized.mime)?;
        Ok(artwork::path_to_string(&path))
    })
    .await
    .map_err(|_| "Artwork optimization stopped".to_string())?
}

fn sanitize_cache_id(value: &str) -> String {
    value
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_end_matches("._")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn artwork_needs_positive_dimensions() {
        assert!(!eligible("hero", 0, 1080));
        assert!(!eligible("hero", 1920, 0));
        assert!(eligible("hero", 1920, 1080));
        assert!(eligible("hero", 3840, 1240));
        assert!(eligible("logo", 600, 200));
        assert!(!eligible("cover", 3840, 2160));
    }
    #[test]
    fn connected_cdns_are_allowed_for_backgrounds_only() {
        let url = "https://cdn.thegamesdb.net/images/original/fanart/game.jpg";
        assert!(allowed_download("hero", url));
        assert!(!allowed_download("logo", url));
        assert!(!allowed_download(
            "hero",
            "https://cdn.thegamesdb.net.evil.test/a.jpg"
        ));
        assert!(!allowed_download(
            "hero",
            "https://user@media.rawg.io/a.jpg"
        ));
    }

    #[test]
    fn only_steamgriddb_cdn_urls_are_accepted() {
        assert!(cdn_url("https://cdn2.steamgriddb.com/hero/test.png"));
        assert!(!cdn_url(
            "https://cdn2.steamgriddb.com.evil.test/hero/test.png"
        ));
        assert!(!cdn_url("http://cdn2.steamgriddb.com/hero/test.png"));
        assert!(!cdn_url("https://localhost/hero/test.png"));
    }
    #[test]
    fn downloaded_pixels_must_have_valid_dimensions() {
        let mut bytes = std::io::Cursor::new(Vec::new());
        image::DynamicImage::new_rgb8(1920, 1)
            .write_to(&mut bytes, image::ImageFormat::Png)
            .unwrap();
        assert!(validate_image(bytes.get_ref(), "hero").is_ok());
        assert!(validate_image(bytes.get_ref(), "logo").is_ok());
        assert!(validate_image(b"not an image", "hero").is_err());
    }
}
