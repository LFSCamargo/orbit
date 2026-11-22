//! PC Game Pass catalog, Microsoft Store owned PC entitlements, GDK package
//! discovery (`packagespc.xboxlive.com`), and official Microsoft content licensing
//! (`licensing.mp.microsoft.com/v7.0/licenses/content` & `v8.0/licenseToken`).

use std::collections::HashSet;
use std::io::Read;
use std::time::Duration;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::splicense::SpLicense;
use crate::{
    is_allowed_cdn_url, valid_content_id, valid_product_id, MsStoreError, Result,
    MAX_CONTROL_RESPONSE_BYTES,
};

pub const SIGLS_URL: &str = "https://catalog.gamepass.com/sigls/v2";
pub const DISPLAY_CATALOG_URL: &str = "https://displaycatalog.mp.microsoft.com/v7.0/products";
pub const COLLECTIONS_URL: &str = "https://collections.mp.microsoft.com/v9.0/collections/consumer";
pub const PACKAGES_PC_BASE_URL: &str = "https://packagespc.xboxlive.com/GetBasePackage";
pub const CONTENT_LICENSE_URL: &str = "https://licensing.mp.microsoft.com/v7.0/licenses/content";
pub const RUNTIME_LICENSE_TOKEN_URL: &str = "https://licensing.mp.microsoft.com/v8.0/licenseToken";

/// Official Microsoft PC Game Pass "All PC Games" SIGL collection ID.
pub const PC_GAMEPASS_COLLECTION_ID: &str = "fdd9e2a7-f7a0-47ac-b0a5-96a2048d52a0";
const GAMING_SERVICES_UA: &str =
    "XboxLm-PC/Microsoft.GamingServices_32.107.4002.0_x64__8wekyb3d8bbwe";
const MAX_PRODUCTS: usize = 2_000;
const BATCH_SIZE: usize = 20;

const COVER_PURPOSES: &[&str] = &["Poster", "BoxArt", "FeaturePromotionalSquareArt"];
const SQUARE_PURPOSES: &[&str] = &["BoxArt", "FeaturePromotionalSquareArt"];
const HERO_PURPOSES: &[&str] = &["SuperHeroArt", "TitledHeroArt", "BrandedKeyArt"];

/// One Microsoft Store / PC Game Pass Windows title from DisplayCatalog.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MsStoreCatalogEntry {
    pub product_id: String,
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub content_id: Option<String>,
    #[serde(default)]
    pub package_family_name: Option<String>,
    #[serde(default)]
    pub xbox_title_id: Option<String>,
    #[serde(default)]
    pub install_size_bytes: Option<u64>,
    #[serde(default)]
    pub cover_url: Option<String>,
    #[serde(default)]
    pub square_url: Option<String>,
    #[serde(default)]
    pub hero_url: Option<String>,
    #[serde(default)]
    pub logo_url: Option<String>,
    /// True when the user's account explicitly owns this title (not just Game Pass catalog).
    #[serde(default)]
    pub owned: bool,
    /// True when the title is part of the PC Game Pass SIGL list.
    #[serde(default)]
    pub game_pass_pc: bool,
}

/// Package download details returned by `packagespc.xboxlive.com/GetBasePackage/{contentId}`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageDetails {
    pub content_id: String,
    pub version_id: Option<String>,
    pub download_urls: Vec<String>,
    pub file_size: u64,
    pub key_id: Option<Uuid>,
    pub package_format: String,
}

/// Fetches the PC Game Pass catalog IDs and resolves their DisplayCatalog metadata.
/// Complexity: O(N) over product IDs, bounded at `MAX_PRODUCTS` in batches of 20.
pub fn fetch_pc_gamepass_catalog(market: &str, language: &str) -> Result<Vec<MsStoreCatalogEntry>> {
    let client = http_client()?;
    let sigl_body = get_limited(
        &client,
        SIGLS_URL,
        &[
            ("id", PC_GAMEPASS_COLLECTION_ID),
            ("market", market),
            ("language", language),
        ],
    )?;
    let ids = parse_sigl_ids(&sigl_body)?;
    fetch_display_catalog_products(&client, &ids, market, language, true, false)
}

/// Fetches owned PC entitlements from Microsoft's consumer collections endpoint.
pub fn fetch_owned_product_ids(
    user_store_token: &str,
    market: &str,
    language: &str,
) -> Result<Vec<String>> {
    let client = http_client()?;
    let payload = serde_json::json!({
        "beneficiaries": [],
        "checkSatisfyingEntitlements": true,
        "excludeDuplicates": true,
        "expandSatisfyingItems": true,
        "maxPageSize": 500,
        "productSkuIds": [],
        "productTypes": ["Game"],
        "validityType": "All",
        "market": market,
        "languages": language,
    });
    let response = client
        .post(COLLECTIONS_URL)
        .header("Authorization", user_store_token)
        .json(&payload)
        .send()
        .map_err(|e| MsStoreError::Network(format!("Collections request failed: {e}")))?;
    if response.status().as_u16() == 401 || response.status().as_u16() == 403 {
        return Err(MsStoreError::AuthExpired);
    }
    if !response.status().is_success() {
        return Err(MsStoreError::Network(format!(
            "Microsoft Collections returned HTTP {}",
            response.status().as_u16()
        )));
    }
    let body = read_limited(response)?;
    parse_collections_product_ids(&body)
}

/// Resolves DisplayCatalog metadata for a list of product IDs.
pub fn fetch_products_by_ids(
    ids: &[String],
    market: &str,
    language: &str,
    game_pass_pc: bool,
    owned: bool,
) -> Result<Vec<MsStoreCatalogEntry>> {
    let client = http_client()?;
    fetch_display_catalog_products(&client, ids, market, language, game_pass_pc, owned)
}

fn fetch_display_catalog_products(
    client: &reqwest::blocking::Client,
    ids: &[String],
    market: &str,
    language: &str,
    game_pass_pc: bool,
    owned: bool,
) -> Result<Vec<MsStoreCatalogEntry>> {
    let mut entries = Vec::with_capacity(ids.len().min(MAX_PRODUCTS));
    for batch in ids.iter().take(MAX_PRODUCTS).collect::<Vec<_>>().chunks(BATCH_SIZE) {
        let joined = batch
            .iter()
            .map(|id| id.as_str())
            .collect::<Vec<_>>()
            .join(",");
        let result = get_limited(
            client,
            DISPLAY_CATALOG_URL,
            &[
                ("bigIds", &joined),
                ("market", market),
                ("languages", language),
            ],
        )
        .and_then(|body| parse_display_catalog(&body, game_pass_pc, owned));
        if let Ok(mut parsed) = result {
            entries.append(&mut parsed);
        }
    }
    Ok(dedupe_entries(entries))
}

/// Queries `packagespc.xboxlive.com/GetBasePackage/{contentId}` using an XSTS token
/// issued for `http://update.xboxlive.com`.
pub fn fetch_base_package(content_id: &str, xsts_auth_header: &str) -> Result<PackageDetails> {
    if !valid_content_id(content_id) {
        return Err(MsStoreError::InvalidPath(format!(
            "Invalid Microsoft Store content ID: {content_id}"
        )));
    }
    let client = http_client()?;
    let url = format!("{PACKAGES_PC_BASE_URL}/{content_id}");
    let response = client
        .get(&url)
        .header("Authorization", xsts_auth_header)
        .header("x-xbl-contract-version", "3")
        .send()
        .map_err(|e| MsStoreError::Network(format!("Package lookup failed: {e}")))?;
    match response.status().as_u16() {
        401 | 403 => return Err(MsStoreError::AuthExpired),
        404 => return Err(MsStoreError::NotEntitled),
        code if !(200..300).contains(&code) => {
            return Err(MsStoreError::Network(format!(
                "Package service returned HTTP {code}"
            )));
        }
        _ => {}
    }
    let body = read_limited(response)?;
    parse_base_package_response(content_id, &body)
}

/// Requests an official `SPLicenseBlock` (containing the wrapped CIK) from
/// `licensing.mp.microsoft.com/v7.0/licenses/content`.
pub fn acquire_content_license(
    content_id: &str,
    device_ms_token: &str,
    user_ms_token: &str,
    hardware_id_b64: &str,
) -> Result<SpLicense> {
    if !valid_content_id(content_id) {
        return Err(MsStoreError::InvalidPath(format!(
            "Invalid Microsoft Store content ID: {content_id}"
        )));
    }
    let client = http_client()?;
    let body = serde_json::json!({
        "ContentIds": [content_id],
        "UserTokens": [user_ms_token],
        "HardwareId": hardware_id_b64,
        "LicenseType": "Full",
    });
    let response = client
        .post(CONTENT_LICENSE_URL)
        .header("Authorization", device_ms_token)
        .header("from", "XboxLicenseManager")
        .header("User-Agent", GAMING_SERVICES_UA)
        .json(&body)
        .send()
        .map_err(|e| MsStoreError::Network(format!("Content license request failed: {e}")))?;
    match response.status().as_u16() {
        401 => return Err(MsStoreError::AuthExpired),
        403 | 404 => return Err(MsStoreError::NotEntitled),
        code if !(200..300).contains(&code) => {
            return Err(MsStoreError::Network(format!(
                "Licensing server returned HTTP {code}"
            )));
        }
        _ => {}
    }
    let text = read_limited(response)?;
    parse_content_license_response(&text)
}

/// Requests a runtime XStore license token from `licensing.mp.microsoft.com/v8.0/licenseToken`
/// for `xgameruntime` IPC calls.
pub fn acquire_runtime_license_token(
    product_id: &str,
    device_ms_token: &str,
    user_ms_token: &str,
) -> Result<String> {
    if !valid_product_id(product_id) {
        return Err(MsStoreError::InvalidPath(format!(
            "Invalid Microsoft Store product ID: {product_id}"
        )));
    }
    let client = http_client()?;
    let body = serde_json::json!({
        "ProductIds": [product_id],
        "UserTokens": [user_ms_token],
    });
    let response = client
        .post(RUNTIME_LICENSE_TOKEN_URL)
        .header("Authorization", device_ms_token)
        .header("from", "XboxLicenseManager")
        .header("User-Agent", GAMING_SERVICES_UA)
        .json(&body)
        .send()
        .map_err(|e| MsStoreError::Network(format!("Runtime license token request failed: {e}")))?;
    match response.status().as_u16() {
        401 => return Err(MsStoreError::AuthExpired),
        403 | 404 => return Err(MsStoreError::NotEntitled),
        code if !(200..300).contains(&code) => {
            return Err(MsStoreError::Network(format!(
                "Runtime licensing server returned HTTP {code}"
            )));
        }
        _ => {}
    }
    read_limited(response)
}

/// Parses SIGL v2 JSON array into unique uppercase Store product IDs.
pub fn parse_sigl_ids(body: &str) -> Result<Vec<String>> {
    let value: serde_json::Value =
        serde_json::from_str(body).map_err(|_| MsStoreError::Protocol("Invalid SIGL JSON".into()))?;
    let items = value
        .as_array()
        .ok_or_else(|| MsStoreError::Protocol("SIGL payload was not an array".into()))?;
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

/// Parses owned product IDs from `collections.mp.microsoft.com/v9.0/collections/consumer`.
pub fn parse_collections_product_ids(body: &str) -> Result<Vec<String>> {
    let value: serde_json::Value = serde_json::from_str(body)
        .map_err(|_| MsStoreError::Protocol("Invalid Collections JSON".into()))?;
    let items = value
        .get("items")
        .and_then(|v| v.as_array())
        .ok_or_else(|| MsStoreError::Protocol("Collections payload missing items array".into()))?;
    let mut seen = HashSet::new();
    Ok(items
        .iter()
        .filter_map(|item| item.get("productId")?.as_str())
        .filter(|id| valid_product_id(id))
        .map(str::to_ascii_uppercase)
        .filter(|id| seen.insert(id.clone()))
        .take(MAX_PRODUCTS)
        .collect())
}

/// Parses DisplayCatalog v7.0 `Products` into Windows PC [`MsStoreCatalogEntry`] items.
pub fn parse_display_catalog(
    body: &str,
    game_pass_pc: bool,
    owned: bool,
) -> Result<Vec<MsStoreCatalogEntry>> {
    let value: serde_json::Value = serde_json::from_str(body)
        .map_err(|_| MsStoreError::Protocol("Invalid DisplayCatalog JSON".into()))?;
    let products = value
        .get("Products")
        .and_then(|p| p.as_array())
        .ok_or_else(|| MsStoreError::Protocol("DisplayCatalog missing Products array".into()))?;
    Ok(products
        .iter()
        .filter_map(|product| parse_product(product, game_pass_pc, owned))
        .collect())
}

fn parse_product(
    product: &serde_json::Value,
    game_pass_pc: bool,
    owned: bool,
) -> Option<MsStoreCatalogEntry> {
    let raw_id = product.get("ProductId")?.as_str()?;
    if !valid_product_id(raw_id) {
        return None;
    }
    let product_id = raw_id.to_ascii_uppercase();
    let localized = product.get("LocalizedProperties")?.as_array()?.first()?;
    let title = localized.get("ProductTitle")?.as_str()?.trim();
    if title.is_empty() {
        return None;
    }
    let description = localized
        .get("ShortDescription")
        .or_else(|| localized.get("ProductDescription"))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);

    let images = localized
        .get("Images")
        .and_then(|v| v.as_array())
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
        .filter(|v| !v.is_empty() && v.bytes().all(|b| b.is_ascii_digit()))
        .map(str::to_string);

    let package_family_name = product
        .pointer("/Properties/PackageFamilyName")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);

    let (content_id, install_size_bytes) = extract_pc_package_metadata(product);

    Some(MsStoreCatalogEntry {
        product_id,
        title: title.to_string(),
        description,
        content_id,
        package_family_name,
        xbox_title_id,
        install_size_bytes,
        cover_url: pick_image(images, COVER_PURPOSES),
        square_url: pick_image(images, SQUARE_PURPOSES),
        hero_url: pick_image(images, HERO_PURPOSES),
        logo_url: pick_image(images, &["Logo"]),
        owned,
        game_pass_pc,
    })
}

fn extract_pc_package_metadata(product: &serde_json::Value) -> (Option<String>, Option<u64>) {
    let Some(skus) = product
        .get("DisplaySkuAvailabilities")
        .and_then(|v| v.as_array())
    else {
        return (None, None);
    };
    let mut best_content_id: Option<String> = None;
    let mut best_size: Option<u64> = None;
    for sku_avail in skus {
        let Some(packages) = sku_avail
            .pointer("/Sku/Properties/Packages")
            .and_then(|v| v.as_array())
        else {
            continue;
        };
        for pkg in packages {
            let is_desktop = pkg
                .get("PlatformDependencies")
                .and_then(|v| v.as_array())
                .is_none_or(|deps| {
                    deps.is_empty()
                        || deps.iter().any(|d| {
                            d.get("PlatformName")
                                .and_then(|n| n.as_str())
                                .is_some_and(|n| n.eq_ignore_ascii_case("Windows.Desktop"))
                        })
                });
            if !is_desktop {
                continue;
            }
            if best_content_id.is_none() {
                if let Some(cid) = pkg
                    .get("ContentId")
                    .and_then(|v| v.as_str())
                    .filter(|id| valid_content_id(id))
                {
                    best_content_id = Some(cid.to_ascii_lowercase());
                }
            }
            if best_size.is_none() {
                best_size = pkg.get("MaxDownloadSizeInBytes").and_then(|v| v.as_u64());
            }
        }
    }
    (best_content_id, best_size)
}

/// Parses `packagespc.xboxlive.com/GetBasePackage/{contentId}` JSON and strictly validates
/// every CDN download URL against [`is_allowed_cdn_url`].
pub fn parse_base_package_response(content_id: &str, body: &str) -> Result<PackageDetails> {
    let value: serde_json::Value = serde_json::from_str(body)
        .map_err(|_| MsStoreError::Protocol("Invalid GetBasePackage JSON".into()))?;
    let packages = value
        .get("PackageFiles")
        .and_then(|v| v.as_array())
        .ok_or_else(|| MsStoreError::Protocol("GetBasePackage missing PackageFiles".into()))?;

    let mut msixvc_file: Option<&serde_json::Value> = None;
    for file in packages {
        let name = file
            .get("FileName")
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        if name.ends_with(".msixvc") || name.ends_with(".xvc") {
            msixvc_file = Some(file);
            break;
        }
    }
    let file = msixvc_file.or_else(|| packages.first()).ok_or_else(|| {
        MsStoreError::UnsupportedFormat("No downloadable PC package file returned".into())
    })?;

    let file_name = file
        .get("FileName")
        .and_then(|v| v.as_str())
        .unwrap_or("package.msixvc");
    let lower_name = file_name.to_ascii_lowercase();
    let package_format = if lower_name.ends_with(".eappx") || lower_name.ends_with(".emsix") {
        return Err(MsStoreError::UnsupportedFormat(format!(
            "Legacy UWP package ({file_name}) is not supported; Orbit supports GDK MSIXVC titles"
        )));
    } else if lower_name.ends_with(".msixvc2") {
        "msixvc2".to_string()
    } else {
        "msixvc".to_string()
    };

    let rel_path = file
        .get("RelativeUrl")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let roots = file
        .get("CdnRootPaths")
        .and_then(|v| v.as_array())
        .map(Vec::as_slice)
        .unwrap_or_default();

    let mut download_urls = Vec::new();
    for root in roots {
        if let Some(root_str) = root.as_str() {
            let combined = if rel_path.is_empty() {
                root_str.to_string()
            } else {
                format!("{}{}", root_str.trim_end_matches('/'), rel_path)
            };
            if is_allowed_cdn_url(&combined) {
                download_urls.push(combined);
            }
        }
    }
    if download_urls.is_empty() {
        return Err(MsStoreError::DisallowedUrl(
            "Package response contained no trusted Microsoft CDN URLs".into(),
        ));
    }

    let file_size = file
        .get("FileSize")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let key_id = file
        .get("KeyId")
        .or_else(|| value.get("KeyId"))
        .and_then(|v| v.as_str())
        .and_then(|s| Uuid::parse_str(s).ok());
    let version_id = value
        .get("VersionId")
        .and_then(|v| v.as_str())
        .map(str::to_string);

    Ok(PackageDetails {
        content_id: content_id.to_ascii_lowercase(),
        version_id,
        download_urls,
        file_size,
        key_id,
        package_format,
    })
}

/// Parses `licensing.mp.microsoft.com/v7.0/licenses/content` JSON and decodes the first
/// base64 `SPLicenseBlock`.
pub fn parse_content_license_response(body: &str) -> Result<SpLicense> {
    let value: serde_json::Value = serde_json::from_str(body)
        .map_err(|_| MsStoreError::Protocol("Invalid content license JSON".into()))?;
    let license_b64 = value
        .pointer("/Licenses/0/License")
        .or_else(|| value.pointer("/licenses/0/license"))
        .or_else(|| value.get("License"))
        .and_then(|v| v.as_str())
        .ok_or(MsStoreError::NotEntitled)?;
    let raw = B64
        .decode(license_b64.trim())
        .map_err(|e| MsStoreError::Protocol(format!("Invalid license base64: {e}")))?;
    SpLicense::parse(&raw)
}

fn pick_image(images: &[serde_json::Value], purposes: &[&str]) -> Option<String> {
    purposes.iter().find_map(|purpose| {
        images
            .iter()
            .find(|img| img.get("ImagePurpose").and_then(|p| p.as_str()) == Some(purpose))
            .and_then(|img| img.get("Uri")?.as_str())
            .and_then(normalize_image_url)
    })
}

fn normalize_image_url(uri: &str) -> Option<String> {
    let trimmed = uri.trim();
    if let Some(rest) = trimmed.strip_prefix("//") {
        Some(format!("https://{rest}"))
    } else if let Some(rest) = trimmed.strip_prefix("http://") {
        Some(format!("https://{rest}"))
    } else if trimmed.starts_with("https://") {
        Some(trimmed.to_string())
    } else {
        None
    }
}

fn dedupe_entries(entries: Vec<MsStoreCatalogEntry>) -> Vec<MsStoreCatalogEntry> {
    let mut seen = HashSet::new();
    entries
        .into_iter()
        .filter(|entry| seen.insert(entry.product_id.clone()))
        .collect()
}

fn http_client() -> Result<reqwest::blocking::Client> {
    reqwest::blocking::Client::builder()
        .user_agent("Orbit")
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| MsStoreError::Network(format!("HTTP client init failed: {e}")))
}

fn get_limited(
    client: &reqwest::blocking::Client,
    url: &str,
    query: &[(&str, &str)],
) -> Result<String> {
    let response = client
        .get(url)
        .query(query)
        .send()
        .map_err(|e| MsStoreError::Network(format!("GET {url} failed: {e}")))?;
    if !response.status().is_success() {
        return Err(MsStoreError::Network(format!(
            "Microsoft Store returned HTTP {}",
            response.status().as_u16()
        )));
    }
    read_limited(response)
}

fn read_limited(response: reqwest::blocking::Response) -> Result<String> {
    let mut body = Vec::new();
    response
        .take(MAX_CONTROL_RESPONSE_BYTES as u64 + 1)
        .read_to_end(&mut body)
        .map_err(|e| MsStoreError::Network(format!("Failed reading response body: {e}")))?;
    if body.len() > MAX_CONTROL_RESPONSE_BYTES {
        return Err(MsStoreError::Protocol(
            "Microsoft Store response exceeded size limit".into(),
        ));
    }
    String::from_utf8(body)
        .map_err(|_| MsStoreError::Protocol("Microsoft Store response was not UTF-8".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_display_catalog_with_content_id_and_size() {
        let json = r#"{
          "Products": [{
            "ProductId": "9P8LR42PTRGJ",
            "Properties": { "PackageFamilyName": "ThunderLotus.33Immortals_abc" },
            "AlternateIds": [{ "IdType": "XboxTitleId", "Value": "2141212892" }],
            "LocalizedProperties": [{
              "ProductTitle": "33 Immortals",
              "ShortDescription": "A 33-player co-op roguelike.",
              "Images": [
                { "ImagePurpose": "Poster", "Uri": "//store-images.s-microsoft.com/poster.png" },
                { "ImagePurpose": "BoxArt", "Uri": "//store-images.s-microsoft.com/box.png" }
              ]
            }],
            "DisplaySkuAvailabilities": [{
              "Sku": {
                "Properties": {
                  "Packages": [{
                    "ContentId": "11111111-2222-3333-4444-555555555555",
                    "MaxDownloadSizeInBytes": 4294967296,
                    "PlatformDependencies": [{ "PlatformName": "Windows.Desktop" }]
                  }]
                }
              }
            }]
          }]
        }"#;
        let items = parse_display_catalog(json, true, false).unwrap();
        assert_eq!(items.len(), 1);
        let item = &items[0];
        assert_eq!(item.product_id, "9P8LR42PTRGJ");
        assert_eq!(
            item.content_id.as_deref(),
            Some("11111111-2222-3333-4444-555555555555")
        );
        assert_eq!(item.install_size_bytes, Some(4_294_967_296));
        assert_eq!(
            item.package_family_name.as_deref(),
            Some("ThunderLotus.33Immortals_abc")
        );
        assert!(item.game_pass_pc);
        assert!(!item.owned);
    }

    #[test]
    fn base_package_enforces_cdn_allowlist_and_rejects_uwp() {
        let good = r#"{
          "VersionId": "1.0.0.1",
          "PackageFiles": [{
            "FileName": "Game.msixvc",
            "FileSize": 1048576,
            "RelativeUrl": "/Z/game.msixvc",
            "KeyId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            "CdnRootPaths": [
              "https://evil.example",
              "https://xvcf1.xboxlive.com"
            ]
          }]
        }"#;
        let details = parse_base_package_response(
            "11111111-2222-3333-4444-555555555555",
            good,
        )
        .unwrap();
        assert_eq!(
            details.download_urls,
            vec!["https://xvcf1.xboxlive.com/Z/game.msixvc"]
        );
        assert_eq!(details.file_size, 1_048_576);
        assert_eq!(details.package_format, "msixvc");

        let uwp = r#"{
          "PackageFiles": [{
            "FileName": "Legacy.eappx",
            "FileSize": 100,
            "RelativeUrl": "/a.eappx",
            "CdnRootPaths": ["https://xvcf1.xboxlive.com"]
          }]
        }"#;
        assert!(matches!(
            parse_base_package_response("11111111-2222-3333-4444-555555555555", uwp),
            Err(MsStoreError::UnsupportedFormat(_))
        ));

        let evil_only = r#"{
          "PackageFiles": [{
            "FileName": "Game.msixvc",
            "FileSize": 100,
            "RelativeUrl": "/a.msixvc",
            "CdnRootPaths": ["https://evil.example"]
          }]
        }"#;
        assert!(matches!(
            parse_base_package_response("11111111-2222-3333-4444-555555555555", evil_only),
            Err(MsStoreError::DisallowedUrl(_))
        ));
    }

    #[test]
    fn maps_empty_license_response_to_not_entitled() {
        assert!(matches!(
            parse_content_license_response(r#"{"Licenses":[]}"#),
            Err(MsStoreError::NotEntitled)
        ));
    }
}
