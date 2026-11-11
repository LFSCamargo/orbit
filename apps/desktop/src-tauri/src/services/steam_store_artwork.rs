use crate::services::public_artwork::ArtworkSearchHit;

/// Store data is only used with an actual Steam app identity, never a guessed numeric ID.
pub async fn search(app_id: &str, slot: &str) -> Result<Vec<ArtworkSearchHit>, String> {
    if app_id.is_empty() || !app_id.chars().all(|c| c.is_ascii_digit()) {
        return Err("Invalid Steam app ID".into());
    }
    let value: serde_json::Value = crate::services::http::orbit_client()?
        .get("https://store.steampowered.com/api/appdetails")
        .query(&[("appids", app_id), ("l", "english")])
        .send()
        .await
        .map_err(|e| e.without_url().to_string())?
        .error_for_status()
        .map_err(|e| e.without_url().to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let entry = &value[app_id];
    if entry["success"].as_bool() != Some(true) {
        return Ok(vec![]);
    }
    let data = &entry["data"];
    let title = data["name"]
        .as_str()
        .filter(|s| !s.trim().is_empty())
        .ok_or("Steam Store returned no title")?;
    let urls = store_urls(app_id, slot, data);
    Ok(urls
        .into_iter()
        .enumerate()
        .map(|(i, url)| ArtworkSearchHit {
            id: format!("store-{app_id}-{slot}-{i}"),
            title: title.to_string(),
            preview_url: url.clone(),
            image_url: url,
            source: "Steam Store".into(),
        })
        .collect())
}

fn store_urls(app_id: &str, slot: &str, data: &serde_json::Value) -> Vec<String> {
    if slot == "logo" {
        return vec![format!(
            "https://cdn.akamai.steamstatic.com/steam/apps/{app_id}/logo.png"
        )];
    }
    let mut urls = vec![];
    if slot == "cover" {
        urls.push(format!(
            "https://cdn.akamai.steamstatic.com/steam/apps/{app_id}/library_600x900_2x.jpg"
        ));
    }
    for field in [
        "background_raw",
        "background",
        "header_image",
        "capsule_image",
    ] {
        if let Some(url) = data[field].as_str().filter(|s| s.starts_with("https://")) {
            urls.push(url.to_string());
        }
    }
    urls
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn logo_slot_uses_store_logo_only() {
        let data = serde_json::json!({ "header_image": "https://cdn.example/header.jpg" });
        assert_eq!(
            store_urls("570", "logo", &data),
            vec!["https://cdn.akamai.steamstatic.com/steam/apps/570/logo.png"]
        );
        assert_eq!(
            store_urls("570", "hero", &data),
            vec!["https://cdn.example/header.jpg"]
        );
    }
}
