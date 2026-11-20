//! Xbox Cloud Gaming catalog: product ids from the Game Pass SIGL list and
//! titles/artwork from Microsoft's display catalog. Catalog entries are
//! browse-only; they never become library games on their own.

use std::collections::HashSet;
use std::io::Read;
use std::time::Duration;

use serde::{Deserialize, Serialize};

const SIGLS_URL: &str = "https://catalog.gamepass.com/sigls/v2";
const PRODUCTS_URL: &str = "https://displaycatalog.mp.microsoft.com/v7.0/products";
/// "All games" cloud list. Checked against the live API: it differs from the
/// console (`f6f1f99f-…`) and PC (`fdd9e2a7-…`) lists.
pub const CLOUD_COLLECTION_ID: &str = "29a81209-df6f-41fd-a528-2ae6b91f719c";
const BATCH_SIZE: usize = 20;
const SIGLS_LIMIT: usize = 512 * 1024;
const PRODUCTS_LIMIT: usize = 4 * 1024 * 1024;
const MAX_PRODUCTS: usize = 2_000;
const COVER_PURPOSES: &[&str] = &["Poster", "BoxArt", "FeaturePromotionalSquareArt"];
/// 1:1 store art (1080 or 2160 px squares) for square tiles such as the
/// Home shelf; `Poster` is 2:3.
const SQUARE_PURPOSES: &[&str] = &["BoxArt", "FeaturePromotionalSquareArt"];
const HERO_PURPOSES: &[&str] = &["SuperHeroArt", "TitledHeroArt", "BrandedKeyArt"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct XcloudCatalogEntry {
    pub product_id: String,
    pub title: String,
    pub xbox_title_id: Option<String>,
    pub cover_url: Option<String>,
    /// Square art; missing in catalogs cached before it was read.
    #[serde(default)]
    pub square_url: Option<String>,
    pub hero_url: Option<String>,
    pub logo_url: Option<String>,
    pub launch_url: String,
}

/// Market (`US`) and language (`en-US`) used for every catalog request.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Market {
    pub market: String,
    pub language: String,
}

impl Market {
    /// Accepts `US` or `en-US`; anything else falls back to `US` / `en-US`.
    pub fn parse(value: Option<&str>) -> Self {
        let fallback = Self {
            market: "US".into(),
            language: "en-US".into(),
        };
        let Some(value) = value.map(str::trim).filter(|v| !v.is_empty()) else {
            return fallback;
        };
        let alpha = |s: &str, n: usize| s.len() == n && s.chars().all(|c| c.is_ascii_alphabetic());
        match value.split_once('-') {
            Some((lang, region)) if alpha(lang, 2) && alpha(region, 2) => Self {
                market: region.to_ascii_uppercase(),
                language: format!(
                    "{}-{}",
                    lang.to_ascii_lowercase(),
                    region.to_ascii_uppercase()
                ),
            },
            None if alpha(value, 2) => Self {
                market: value.to_ascii_uppercase(),
                language: format!("en-{}", value.to_ascii_uppercase()),
            },
            _ => fallback,
        }
    }
}

/// Fetches the full cloud catalog. A failed product batch is skipped; only a
/// failed SIGL request fails the whole fetch.
pub fn fetch(market: &Market) -> Result<Vec<XcloudCatalogEntry>, String> {
    let client = http_client()?;
    let body = get(
        &client,
        SIGLS_URL,
        &[
            ("id", CLOUD_COLLECTION_ID),
            ("market", &market.market),
            ("language", &market.language),
        ],
        SIGLS_LIMIT,
    )?;
    let ids = parse_sigls(&body)?;
    let mut entries = Vec::with_capacity(ids.len());
    for batch in ids.chunks(BATCH_SIZE) {
        let joined = batch.join(",");
        let result = get(
            &client,
            PRODUCTS_URL,
            &[
                ("bigIds", &joined),
                ("market", &market.market),
                ("languages", &market.language),
            ],
            PRODUCTS_LIMIT,
        )
        .and_then(|body| parse_products(&body, &market.language));
        match result {
            Ok(batch) => entries.extend(batch),
            Err(err) => eprintln!("[xcloud] catalog batch skipped: {err}"),
        }
    }
    Ok(dedupe(entries))
}

/// Product ids from a SIGL response. The first element is the list header.
pub fn parse_sigls(body: &str) -> Result<Vec<String>, String> {
    let value: serde_json::Value =
        serde_json::from_str(body).map_err(|_| "Xbox catalog could not be read".to_string())?;
    let items = value.as_array().ok_or("Xbox catalog could not be read")?;
    let mut seen = HashSet::new();
    Ok(items
        .iter()
        .filter_map(|item| item.get("id")?.as_str())
        .filter(|id| valid_product_id(id))
        .map(str::to_ascii_uppercase)
        .filter(|id| seen.insert(id.clone()))
        .take(MAX_PRODUCTS)
        .collect())
}

/// Entries from a display catalog response. Products without a title are
/// skipped; missing artwork stays `None`.
pub fn parse_products(body: &str, language: &str) -> Result<Vec<XcloudCatalogEntry>, String> {
    let value: serde_json::Value =
        serde_json::from_str(body).map_err(|_| "Xbox catalog could not be read".to_string())?;
    let products = value
        .get("Products")
        .and_then(|p| p.as_array())
        .ok_or("Xbox catalog could not be read")?;
    Ok(products
        .iter()
        .filter_map(|product| parse_product(product, language))
        .collect())
}

fn parse_product(product: &serde_json::Value, language: &str) -> Option<XcloudCatalogEntry> {
    let product_id = product.get("ProductId")?.as_str()?;
    if !valid_product_id(product_id) {
        return None;
    }
    let product_id = product_id.to_ascii_uppercase();
    let localized = product.get("LocalizedProperties")?.as_array()?.first()?;
    let title = localized.get("ProductTitle")?.as_str()?.trim();
    if title.is_empty() {
        return None;
    }
    let images = localized
        .get("Images")
        .and_then(|i| i.as_array())
        .map(Vec::as_slice)
        .unwrap_or_default();
    let xbox_title_id = product
        .get("AlternateIds")
        .and_then(|ids| ids.as_array())
        .and_then(|ids| {
            ids.iter()
                .find(|id| id.get("IdType").and_then(|t| t.as_str()) == Some("XboxTitleId"))
        })
        .and_then(|id| id.get("Value")?.as_str())
        .filter(|v| !v.is_empty() && v.chars().all(|c| c.is_ascii_digit()))
        .map(str::to_string);
    Some(XcloudCatalogEntry {
        launch_url: launch_url(language, title, &product_id),
        title: title.to_string(),
        xbox_title_id,
        cover_url: image(images, COVER_PURPOSES),
        square_url: image(images, SQUARE_PURPOSES),
        hero_url: image(images, HERO_PURPOSES),
        logo_url: image(images, &["Logo"]),
        product_id,
    })
}

fn image(images: &[serde_json::Value], purposes: &[&str]) -> Option<String> {
    purposes.iter().find_map(|purpose| {
        images
            .iter()
            .find(|img| img.get("ImagePurpose").and_then(|p| p.as_str()) == Some(purpose))
            .and_then(|img| img.get("Uri")?.as_str())
            .and_then(normalize_image_url)
    })
}

/// Store image URIs are protocol-relative (`//store-images…`).
pub fn normalize_image_url(uri: &str) -> Option<String> {
    let uri = uri.trim();
    let url = if let Some(rest) = uri.strip_prefix("//") {
        format!("https://{rest}")
    } else if let Some(rest) = uri.strip_prefix("http://") {
        format!("https://{rest}")
    } else if uri.starts_with("https://") {
        uri.to_string()
    } else {
        return None;
    };
    Some(url)
}

/// `https://www.xbox.com/{lang}/play/launch/{slug}/{productId}`. Xbox routes
/// by product id; the slug is cosmetic and redirects when it differs.
pub fn launch_url(language: &str, title: &str, product_id: &str) -> String {
    format!(
        "https://www.xbox.com/{language}/play/launch/{}/{product_id}",
        slug(title)
    )
}

/// Lowercase ASCII slug: accents folded, punctuation dropped, runs of
/// separators collapsed to one `-`.
pub fn slug(title: &str) -> String {
    let mut out = String::with_capacity(title.len());
    let mut dash = false;
    for ch in title.chars().flat_map(crate::utils::search_text::fold) {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            dash = false;
        } else if (ch.is_whitespace() || ch == '-' || ch == '_' || ch == ':' || ch == '/')
            && !dash
            && !out.is_empty()
        {
            out.push('-');
            dash = true;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    if out.is_empty() {
        "game".into()
    } else {
        out
    }
}

/// Store product ids are 12 uppercase alphanumerics (`9P8LR42PTRGJ`).
pub fn valid_product_id(id: &str) -> bool {
    id.len() == 12 && id.chars().all(|c| c.is_ascii_alphanumeric())
}

fn dedupe(entries: Vec<XcloudCatalogEntry>) -> Vec<XcloudCatalogEntry> {
    let mut seen = HashSet::new();
    entries
        .into_iter()
        .filter(|entry| seen.insert(entry.product_id.clone()))
        .collect()
}

fn http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent("Orbit")
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|_| "Xbox catalog could not be loaded".to_string())
}

fn get(
    client: &reqwest::blocking::Client,
    url: &str,
    query: &[(&str, &str)],
    limit: usize,
) -> Result<String, String> {
    let response = client
        .get(url)
        .query(query)
        .send()
        .map_err(|_| "Xbox catalog could not be loaded".to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Xbox catalog could not be loaded (HTTP {})",
            response.status().as_u16()
        ));
    }
    let mut body = Vec::new();
    response
        .take(limit as u64 + 1)
        .read_to_end(&mut body)
        .map_err(|_| "Xbox catalog could not be read".to_string())?;
    if body.len() > limit {
        return Err("Xbox catalog response was too large".into());
    }
    String::from_utf8(body).map_err(|_| "Xbox catalog could not be read".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const PRODUCTS: &str = r#"{"Products":[
        {"ProductId":"9P8LR42PTRGJ",
         "AlternateIds":[{"IdType":"LegacyXboxProductId","Value":"x"},{"IdType":"XboxTitleId","Value":"2141212892"}],
         "LocalizedProperties":[{"ProductTitle":"33 Immortals","Images":[
            {"ImagePurpose":"SuperHeroArt","Uri":"//store-images.s-microsoft.com/hero"},
            {"ImagePurpose":"Logo","Uri":"https://store-images.s-microsoft.com/logo"},
            {"ImagePurpose":"BoxArt","Uri":"//store-images.s-microsoft.com/box"},
            {"ImagePurpose":"Poster","Uri":"//store-images.s-microsoft.com/poster"}]}]},
        {"ProductId":"9NGLST31DG26","LocalizedProperties":[{"ProductTitle":"No Art"}]},
        {"ProductId":"9NR6NJ401NBS","LocalizedProperties":[{"ProductTitle":"  "}]},
        {"ProductId":"9N42SSSX2MXX","LocalizedProperties":[]},
        {"ProductId":"../../etc","LocalizedProperties":[{"ProductTitle":"Bad"}]}
    ]}"#;

    #[test]
    fn parses_sigls_skipping_header_invalid_and_duplicate_ids() {
        let body = r#"[{"siglId":"x","title":"All games"},{"id":"9P8LR42PTRGJ"},
            {"id":"9p8lr42ptrgj"},{"id":"bad id"},{"id":"9NGLST31DG26"}]"#;
        assert_eq!(
            parse_sigls(body).unwrap(),
            vec!["9P8LR42PTRGJ".to_string(), "9NGLST31DG26".to_string()]
        );
    }

    #[test]
    fn rejects_malformed_sigls() {
        assert!(parse_sigls("not json").is_err());
        assert!(parse_sigls(r#"{"id":"x"}"#).is_err());
    }

    #[test]
    fn square_tiles_get_square_store_art() {
        // Regression: cloud games had no square art, so the Home shelf (1:1
        // only) showed an empty gradient.
        let entries = parse_products(PRODUCTS, "en-US").unwrap();
        assert_eq!(
            entries[0].square_url.as_deref(),
            Some("https://store-images.s-microsoft.com/box")
        );
        assert_eq!(
            entries[0].cover_url.as_deref(),
            Some("https://store-images.s-microsoft.com/poster")
        );
        let old: XcloudCatalogEntry = serde_json::from_str(
            r#"{"productId":"A","title":"T","xboxTitleId":null,"coverUrl":null,"heroUrl":null,"logoUrl":null,"launchUrl":"https://www.xbox.com/x"}"#,
        )
        .unwrap();
        assert_eq!(old.square_url, None);
    }

    #[test]
    fn parses_products_with_artwork_and_title_id() {
        let entries = parse_products(PRODUCTS, "en-US").unwrap();
        let first = &entries[0];
        assert_eq!(first.product_id, "9P8LR42PTRGJ");
        assert_eq!(first.title, "33 Immortals");
        assert_eq!(first.xbox_title_id.as_deref(), Some("2141212892"));
        assert_eq!(
            first.cover_url.as_deref(),
            Some("https://store-images.s-microsoft.com/poster")
        );
        assert_eq!(
            first.hero_url.as_deref(),
            Some("https://store-images.s-microsoft.com/hero")
        );
        assert_eq!(
            first.launch_url,
            "https://www.xbox.com/en-US/play/launch/33-immortals/9P8LR42PTRGJ"
        );
    }

    #[test]
    fn keeps_products_without_artwork_and_skips_missing_titles() {
        let entries = parse_products(PRODUCTS, "en-US").unwrap();
        let ids: Vec<_> = entries.iter().map(|e| e.product_id.as_str()).collect();
        assert_eq!(ids, vec!["9P8LR42PTRGJ", "9NGLST31DG26"]);
        assert_eq!(entries[1].cover_url, None);
        assert_eq!(entries[1].xbox_title_id, None);
    }

    #[test]
    fn rejects_malformed_products() {
        assert!(parse_products("{", "en-US").is_err());
        assert!(parse_products(r#"{"Other":[]}"#, "en-US").is_err());
    }

    #[test]
    fn dedupes_by_product_id() {
        let mut entries = parse_products(PRODUCTS, "en-US").unwrap();
        entries.extend(parse_products(PRODUCTS, "en-US").unwrap());
        assert_eq!(dedupe(entries).len(), 2);
    }

    #[test]
    fn slugs_handle_punctuation_and_unicode() {
        assert_eq!(
            slug("A Game About Digging A Hole™"),
            "a-game-about-digging-a-hole"
        );
        assert_eq!(
            slug("Ori and the Will of the Wisps"),
            "ori-and-the-will-of-the-wisps"
        );
        assert_eq!(slug("Pokémon: Café — Édition"), "pokemon-cafe-edition");
        assert_eq!(
            slug("Tom Clancy's Rainbow Six® Siege"),
            "tom-clancys-rainbow-six-siege"
        );
        assert_eq!(slug("Ratchet & Clank"), "ratchet-and-clank");
        assert_eq!(slug("ゼルダ"), "game");
    }

    #[test]
    fn normalizes_image_urls() {
        assert_eq!(
            normalize_image_url("//store-images.s-microsoft.com/a").as_deref(),
            Some("https://store-images.s-microsoft.com/a")
        );
        assert_eq!(
            normalize_image_url("http://x/a").as_deref(),
            Some("https://x/a")
        );
        assert_eq!(normalize_image_url("javascript:alert(1)"), None);
    }

    #[test]
    fn parses_market() {
        assert_eq!(Market::parse(Some("pt-br")).market, "BR");
        assert_eq!(Market::parse(Some("pt-br")).language, "pt-BR");
        assert_eq!(Market::parse(Some("gb")).language, "en-GB");
        assert_eq!(Market::parse(Some("x; drop")).market, "US");
        assert_eq!(Market::parse(None).market, "US");
    }
}
