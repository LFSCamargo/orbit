//! Steam app types (game, software, DLC, …) for the owned catalog, so the
//! library can leave out software such as Driver Booster. One batched
//! `IStoreBrowseService/GetItems` call covers up to `BATCH` apps; it is served
//! from the Web API host, which stays reachable when the store's per-app
//! `appdetails` endpoint rate-limits an address.

use std::collections::HashMap;
use std::time::Duration;

use serde_json::{json, Value};

use crate::services::steam_download::valid_app_id;

const GET_ITEMS: &str = "https://api.steampowered.com/IStoreBrowseService/GetItems/v1";
const BATCH: usize = 100;

/// The store has no item for this app: Steam's own tools (client, SDKs,
/// screenshots), hidden apps, and delisted games alike.
pub const UNLISTED: &str = "unlisted";

/// Types that are played rather than used: everything else is software,
/// soundtracks, videos, DLC or hardware.
const PLAYABLE: [&str; 4] = ["game", "demo", "mod", "beta"];

/// `EStoreAppType` as returned by `GetItems`.
fn type_name(code: i64) -> Option<&'static str> {
    Some(match code {
        0 => "game",
        1 => "demo",
        2 => "mod",
        3 => "movie",
        4 => "dlc",
        5 => "guide",
        6 => "application",
        7 => "video",
        8 => "series",
        9 => "episode",
        10 => "hardware",
        11 => "music",
        12 => "beta",
        13 => "tool",
        14 => "advertising",
        _ => return None,
    })
}

/// Whether an app belongs in the game library. Unclassified apps stay visible
/// until Steam answers. Unlisted apps are only kept with play history or a
/// local install, since a delisted game and Steam's own tools look the same.
pub fn is_playable(app_type: Option<&str>, has_history: bool) -> bool {
    match app_type {
        None => true,
        Some(UNLISTED) => has_history,
        Some(kind) => PLAYABLE.contains(&kind),
    }
}

/// Bounded, lowercase type names only; anything else is not stored.
pub fn clean(raw: &str) -> Option<String> {
    let kind = raw.trim().to_ascii_lowercase();
    (!kind.is_empty() && kind.len() <= 24 && kind.chars().all(|c| c.is_ascii_lowercase()))
        .then_some(kind)
}

/// App id → type name for every item the response describes.
pub fn parse_items(value: &Value) -> HashMap<String, String> {
    let Some(items) = value
        .pointer("/response/store_items")
        .and_then(Value::as_array)
    else {
        return HashMap::new();
    };
    items
        .iter()
        .filter_map(|item| {
            // `appid` is 0 for apps without a store item; `id` echoes the request.
            let id = item.get("id").and_then(Value::as_u64)?.to_string();
            if !valid_app_id(&id) {
                return None;
            }
            let kind = if item.get("success").and_then(Value::as_i64) == Some(1) {
                type_name(item.get("type").and_then(Value::as_i64)?)?
            } else {
                UNLISTED
            };
            Some((id, kind.to_string()))
        })
        .collect()
}

pub async fn fetch(app_ids: &[String]) -> Result<HashMap<String, String>, String> {
    let ids: Vec<u64> = app_ids
        .iter()
        .filter(|id| valid_app_id(id))
        .filter_map(|id| id.parse().ok())
        .collect();
    let client = crate::services::http::orbit_client()?;
    let mut types = HashMap::new();
    for chunk in ids.chunks(BATCH) {
        let input = json!({
            "ids": chunk.iter().map(|appid| json!({ "appid": appid })).collect::<Vec<_>>(),
            "context": { "language": "english", "country_code": "US" },
            "data_request": {},
        });
        let value: Value = client
            .get(GET_ITEMS)
            .query(&[("input_json", input.to_string())])
            .timeout(Duration::from_secs(15))
            .send()
            .await
            .map_err(|err| err.without_url().to_string())?
            .error_for_status()
            .map_err(|err| err.without_url().to_string())?
            .json()
            .await
            .map_err(|err| err.without_url().to_string())?;
        types.extend(parse_items(&value));
    }
    Ok(types)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_items_types_software_games_and_unlisted_apps() {
        // Shape observed from the live endpoint.
        let value = json!({ "response": { "store_items": [
            { "item_type": 0, "id": 920490, "success": 1, "visible": true,
              "name": "Driver Booster for Steam", "appid": 920490, "type": 6 },
            { "item_type": 0, "id": 1593500, "success": 1, "visible": true,
              "name": "God of War", "appid": 1593500, "type": 0 },
            { "item_type": 0, "id": 7, "success": 15, "visible": false, "name": "", "appid": 0 },
            { "item_type": 0, "id": 431960, "success": 1, "appid": 431960, "type": 99 },
            { "item_type": 0, "id": "../x", "success": 1, "type": 0 }
        ] } });
        let types = parse_items(&value);
        assert_eq!(types.get("920490").map(String::as_str), Some("application"));
        assert_eq!(types.get("1593500").map(String::as_str), Some("game"));
        assert_eq!(types.get("7").map(String::as_str), Some(UNLISTED));
        assert!(
            !types.contains_key("431960"),
            "unknown codes stay unclassified"
        );
        assert_eq!(types.len(), 3);
        assert!(parse_items(&json!({})).is_empty());
    }

    #[test]
    fn only_played_types_and_played_unlisted_apps_are_library_games() {
        assert!(is_playable(None, false));
        assert!(is_playable(Some("game"), false));
        assert!(is_playable(Some("demo"), false));
        assert!(!is_playable(Some("application"), true));
        assert!(!is_playable(Some("tool"), false));
        assert!(!is_playable(Some("dlc"), false));
        assert!(!is_playable(Some(UNLISTED), false));
        assert!(is_playable(Some(UNLISTED), true));
    }

    #[test]
    fn stored_types_are_bounded_lowercase_words() {
        assert_eq!(clean(" Application ").as_deref(), Some("application"));
        assert_eq!(clean("<script>"), None);
        assert_eq!(clean("../../etc"), None);
        assert_eq!(clean(""), None);
    }
}
