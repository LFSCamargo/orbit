//! Owned Steam library catalog: titles from GetOwnedGames, original store
//! artwork URLs, and short descriptions. The access token is never stored.

use std::collections::{HashMap, HashSet};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::services::steam_download::valid_app_id;
use crate::services::{steam_app_types, steamgrid};

const OWNED_LIMIT: usize = 2 * 1024 * 1024;
const TITLE_LIMIT: usize = 200;
const DESCRIPTION_LIMIT: usize = 1_600;
const THIN_DESCRIPTION: usize = 80;
const HYDRATE_CONCURRENCY: usize = 4;
const FRESHNESS_DAYS: i64 = 7;
const CDN: &str = "https://cdn.akamai.steamstatic.com/steam/apps";
const STORE_DETAILS: &str = "https://store.steampowered.com/api/appdetails";
const PROTONDB_SUMMARIES: &str = "https://www.protondb.com/api/v1/reports/summaries";

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamCatalogEntry {
    pub app_id: String,
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub cover_url: Option<String>,
    #[serde(default)]
    pub hero_url: Option<String>,
    #[serde(default)]
    pub last_hydrated_at: Option<String>,
    #[serde(default)]
    pub minimum_requirements: Option<String>,
    #[serde(default)]
    pub recommended_requirements: Option<String>,
    #[serde(default)]
    pub proton_tier: Option<String>,
    #[serde(default)]
    pub playtime_seconds: i64,
    #[serde(default)]
    pub last_played_at: Option<String>,
    #[serde(default)]
    pub install_size_bytes: Option<i64>,
    /// Steam store `type` (`game`, `application`, `dlc`, …), lowercased.
    /// `None` until the store has been asked.
    #[serde(default)]
    pub app_type: Option<String>,
    /// Steam store `controller_support`: `full`, `partial` or `none`.
    /// `None` until the store has been asked.
    #[serde(default)]
    pub controller_support: Option<String>,
}

impl SteamCatalogEntry {
    pub fn from_app_id(app_id: &str) -> Option<Self> {
        valid_app_id(app_id).then(|| Self {
            title: placeholder_title(app_id),
            app_id: app_id.to_string(),
            ..Self::default()
        })
    }
}

pub fn placeholder_title(app_id: &str) -> String {
    format!("Steam {app_id}")
}

pub fn is_placeholder_title(title: &str, app_id: &str) -> bool {
    let trimmed = title.trim();
    trimmed.is_empty() || trimmed == placeholder_title(app_id)
}

/// Owned Steam apps that belong in the game library (see `steam_app_types`).
pub fn is_game(entry: &SteamCatalogEntry, installed: bool) -> bool {
    steam_app_types::is_playable(
        entry.app_type.as_deref(),
        installed || entry.playtime_seconds > 0,
    )
}

pub fn is_thin_description(description: Option<&str>) -> bool {
    crate::services::metadata_merge::is_placeholder_description(description)
        || description
            .map(|text| text.trim().chars().count() < THIN_DESCRIPTION)
            .unwrap_or(true)
}

/// Extra-library installs are not always in GetOwnedGames.
/// Hydrate still needs a catalog row so store copy can replace importer stubs.
pub fn include_installed(
    mut entries: Vec<SteamCatalogEntry>,
    installed: &HashSet<String>,
) -> Vec<SteamCatalogEntry> {
    let have: HashSet<String> = entries.iter().map(|entry| entry.app_id.clone()).collect();
    for id in installed {
        if entries.len() >= 2_000 {
            break;
        }
        if have.contains(id) {
            continue;
        }
        if let Some(entry) = SteamCatalogEntry::from_app_id(id) {
            entries.push(entry);
        }
    }
    entries
}

pub fn catalog_needs_hydrate(entries: &[SteamCatalogEntry]) -> bool {
    entries.iter().any(|entry| {
        is_placeholder_title(&entry.title, &entry.app_id)
            || is_stale(entry)
            || entry.app_type.is_none()
    })
}

pub fn is_stale(entry: &SteamCatalogEntry) -> bool {
    let Some(stamp) = entry.last_hydrated_at.as_deref() else {
        return true;
    };
    let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(stamp) else {
        return true;
    };
    chrono::Utc::now()
        .signed_duration_since(parsed.with_timezone(&chrono::Utc))
        .num_days()
        >= FRESHNESS_DAYS
}

pub fn needs_metadata(entry: &SteamCatalogEntry, can_fetch_art: bool) -> bool {
    is_stale(entry)
        || is_placeholder_title(&entry.title, &entry.app_id)
        || is_thin_description(entry.description.as_deref())
        || entry.controller_support.is_none()
        || (can_fetch_art && !has_square_cover(entry))
}

fn has_square_cover(entry: &SteamCatalogEntry) -> bool {
    entry
        .cover_url
        .as_deref()
        .is_some_and(steamgrid::sgdb_cdn_url)
}

pub fn cover_url(app_id: &str) -> String {
    format!("{CDN}/{app_id}/library_600x900_2x.jpg")
}

pub fn hero_url(app_id: &str) -> String {
    format!("{CDN}/{app_id}/library_hero.jpg")
}

pub fn logo_url(app_id: &str) -> String {
    format!("{CDN}/{app_id}/logo.png")
}

pub fn apply_playtimes(
    entries: &mut [SteamCatalogEntry],
    records: &std::collections::HashMap<String, crate::utils::steam_playtime::SteamPlayRecord>,
) {
    for entry in entries {
        let Some(record) = records.get(&entry.app_id) else {
            continue;
        };
        if record.seconds > entry.playtime_seconds {
            entry.playtime_seconds = record.seconds;
        }
        entry.last_played_at = crate::utils::steam_playtime::later_stamp(
            entry.last_played_at.clone(),
            record.last_played_at.clone(),
        );
    }
}

pub fn parse_owned_games(body: &str) -> Result<Vec<SteamCatalogEntry>, String> {
    if body.len() > OWNED_LIMIT {
        return Err("Steam library could not be read".into());
    }
    let value: Value =
        serde_json::from_str(body).map_err(|_| "Steam library could not be read".to_string())?;
    let Some(games) = value
        .get("response")
        .and_then(|response| response.get("games"))
        .and_then(Value::as_array)
    else {
        return if value
            .pointer("/response/game_count")
            .and_then(Value::as_u64)
            == Some(0)
        {
            Ok(Vec::new())
        } else {
            Err(
                "Steam did not return an owned-library snapshot; your saved library was kept"
                    .into(),
            )
        };
    };
    Ok(games
        .iter()
        .filter_map(parse_owned_game)
        .take(2_000)
        .collect())
}

pub fn parse_stored_library(value: Option<Value>) -> Vec<SteamCatalogEntry> {
    let Some(Value::Array(items)) = value else {
        return Vec::new();
    };
    items
        .into_iter()
        .filter_map(parse_stored_item)
        .take(2_000)
        .collect()
}

pub fn serialize_library(entries: &[SteamCatalogEntry]) -> Value {
    json!(entries)
}

/// Local ticket lists are partial hints. Only an authenticated API snapshot can
/// authoritatively replace ownership; an empty local cache must not erase it.
pub fn merge_owned_ids(existing: &[SteamCatalogEntry], ids: &[String]) -> Vec<SteamCatalogEntry> {
    let mut merged: Vec<_> = existing.iter().take(2_000).cloned().collect();
    let mut seen: HashSet<String> = merged.iter().map(|entry| entry.app_id.clone()).collect();
    for id in ids.iter().take(2_000) {
        if merged.len() >= 2_000 {
            break;
        }
        if valid_app_id(id) && seen.insert(id.clone()) {
            if let Some(entry) = SteamCatalogEntry::from_app_id(id) {
                merged.push(entry);
            }
        }
    }
    merged
}

/// Local tickets plus an optional GetOwnedGames payload. An empty or failed
/// API snapshot must not wipe IDs Steam already wrote to disk.
pub fn apply_owned_snapshot(
    existing: &[SteamCatalogEntry],
    local_ids: &[String],
    fetched: Option<&[SteamCatalogEntry]>,
) -> Vec<SteamCatalogEntry> {
    apply_owned_snapshot_with_local(existing, local_ids, &[], fetched)
}

/// Merge local `localconfig.vdf` IDs, local `packageinfo.vdf` + `appinfo.vdf`
/// game entries (carrying real titles and app types), and an optional
/// `GetOwnedGames` API snapshot without wiping saved metadata or playtimes.
/// Complexity: O(existing + local_ids + local_entries + fetched).
pub fn apply_owned_snapshot_with_local(
    existing: &[SteamCatalogEntry],
    local_ids: &[String],
    local_entries: &[SteamCatalogEntry],
    fetched: Option<&[SteamCatalogEntry]>,
) -> Vec<SteamCatalogEntry> {
    let mut base = merge_owned_ids(existing, local_ids);
    if !local_entries.is_empty() {
        base = merge_additive(&base, local_entries);
    }
    let Some(fetched) = fetched.filter(|games| !games.is_empty()) else {
        return base;
    };
    let mut merged = merge_api_snapshot(&base, fetched.to_vec());
    let seen: HashSet<String> = merged.iter().map(|entry| entry.app_id.clone()).collect();
    for entry in base {
        if merged.len() >= 2_000 {
            break;
        }
        if seen.contains(&entry.app_id) {
            continue;
        }
        merged.push(entry);
    }
    merged
}

/// Additively merge discovered catalog entries into `existing`, filling missing
/// titles and app types while never discarding saved metadata, playtimes, or
/// previously stored entries. O(existing + incoming).
fn merge_additive(
    existing: &[SteamCatalogEntry],
    incoming: &[SteamCatalogEntry],
) -> Vec<SteamCatalogEntry> {
    let mut merged: Vec<_> = existing.iter().take(2_000).cloned().collect();
    let mut positions: HashMap<String, usize> = merged
        .iter()
        .enumerate()
        .map(|(index, entry)| (entry.app_id.clone(), index))
        .collect();
    for candidate in incoming.iter().take(2_000) {
        if !valid_app_id(&candidate.app_id) {
            continue;
        }
        if let Some(&index) = positions.get(&candidate.app_id) {
            let saved = &mut merged[index];
            if is_placeholder_title(&saved.title, &saved.app_id)
                && !is_placeholder_title(&candidate.title, &candidate.app_id)
            {
                saved.title = candidate.title.clone();
            }
            if saved.app_type.is_none() {
                saved.app_type = candidate.app_type.clone();
            }
            if saved.install_size_bytes.is_none() {
                saved.install_size_bytes = candidate.install_size_bytes;
            }
            if candidate.playtime_seconds > saved.playtime_seconds {
                saved.playtime_seconds = candidate.playtime_seconds;
            }
            saved.last_played_at = crate::utils::steam_playtime::later_stamp(
                saved.last_played_at.clone(),
                candidate.last_played_at.clone(),
            );
            continue;
        }
        if merged.len() >= 2_000 {
            break;
        }
        positions.insert(candidate.app_id.clone(), merged.len());
        merged.push(candidate.clone());
    }
    merged
}

pub fn merge_api_snapshot(
    existing: &[SteamCatalogEntry],
    fetched: Vec<SteamCatalogEntry>,
) -> Vec<SteamCatalogEntry> {
    let by_id: HashMap<_, _> = existing
        .iter()
        .map(|entry| (entry.app_id.as_str(), entry))
        .collect();
    fetched
        .into_iter()
        .map(|mut entry| {
            if let Some(saved) = by_id.get(entry.app_id.as_str()) {
                if is_placeholder_title(&entry.title, &entry.app_id)
                    && !is_placeholder_title(&saved.title, &saved.app_id)
                {
                    entry.title = saved.title.clone();
                }
                entry.description = entry.description.or_else(|| saved.description.clone());
                entry.cover_url = entry.cover_url.or_else(|| saved.cover_url.clone());
                entry.hero_url = entry.hero_url.or_else(|| saved.hero_url.clone());
                entry.last_hydrated_at = saved.last_hydrated_at.clone();
                entry.minimum_requirements = saved.minimum_requirements.clone();
                entry.recommended_requirements = saved.recommended_requirements.clone();
                entry.proton_tier = saved.proton_tier.clone();
                entry.app_type = saved.app_type.clone().or(entry.app_type);
                entry.controller_support = saved
                    .controller_support
                    .clone()
                    .or(entry.controller_support);
                entry.install_size_bytes = entry.install_size_bytes.or(saved.install_size_bytes);
                entry.playtime_seconds = entry.playtime_seconds.max(saved.playtime_seconds);
                entry.last_played_at = crate::utils::steam_playtime::later_stamp(
                    entry.last_played_at,
                    saved.last_played_at.clone(),
                );
            }
            entry
        })
        .collect()
}

pub fn hydrate_indices(
    entries: &[SteamCatalogEntry],
    installed: &HashSet<String>,
    favorites: &HashSet<String>,
    can_fetch_art: bool,
    force: bool,
) -> Vec<usize> {
    let mut chosen = Vec::new();
    let mut seen = HashSet::new();
    let mut push = |want_installed: bool, want_favorite: bool| {
        for (index, entry) in entries.iter().enumerate() {
            if seen.contains(&index) || !(force || needs_metadata(entry, can_fetch_art)) {
                continue;
            }
            let is_installed = installed.contains(&entry.app_id);
            let is_favorite = favorites.contains(&entry.app_id);
            if is_installed != want_installed || (!want_installed && is_favorite != want_favorite) {
                continue;
            }
            chosen.push(index);
            seen.insert(index);
        }
    };
    push(true, false);
    push(false, true);
    push(false, false);
    chosen
}

struct StorePayload {
    title: String,
    description: Option<String>,
    minimum: Option<String>,
    recommended: Option<String>,
    app_type: Option<String>,
    controller_support: String,
}

/// `full` / `partial` from the store; anything else (absent) is `none`.
pub fn controller_support_of(data: &Value) -> String {
    match data.get("controller_support").and_then(Value::as_str) {
        Some("full") => "full".into(),
        Some("partial") => "partial".into(),
        _ => "none".into(),
    }
}

pub fn apply_store_details(entry: &mut SteamCatalogEntry, value: &Value) -> bool {
    let Some(payload) = parse_store_payload(&entry.app_id, value) else {
        let delisted = value
            .get(&entry.app_id)
            .and_then(|item| item.get("success"))
            .and_then(Value::as_bool)
            == Some(false);
        if delisted && (entry.app_type.is_none() || entry.controller_support.is_none()) {
            entry
                .app_type
                .get_or_insert_with(|| steam_app_types::UNLISTED.into());
            entry
                .controller_support
                .get_or_insert_with(|| "none".into());
            return true;
        }
        return false;
    };
    let mut changed = apply_details(entry, Some(payload.title), payload.description);
    changed |= apply_requirements(entry, payload.minimum, payload.recommended);
    if payload.app_type.is_some() && payload.app_type != entry.app_type {
        entry.app_type = payload.app_type;
        changed = true;
    }
    if entry.controller_support.as_deref() != Some(payload.controller_support.as_str()) {
        entry.controller_support = Some(payload.controller_support);
        changed = true;
    }
    changed
}

pub fn parse_store_details(app_id: &str, value: &Value) -> Option<(String, Option<String>)> {
    parse_store_payload(app_id, value).map(|payload| (payload.title, payload.description))
}

fn parse_store_payload(app_id: &str, value: &Value) -> Option<StorePayload> {
    let entry = value.get(app_id)?;
    if entry.get("success").and_then(Value::as_bool) != Some(true) {
        return None;
    }
    let data = entry.get("data")?;
    let title = clean_title(app_id, data.get("name").and_then(Value::as_str)?)?;
    let description = [
        "about_the_game",
        "detailed_description",
        "short_description",
    ]
    .iter()
    .find_map(|field| {
        data.get(*field)
            .and_then(Value::as_str)
            .and_then(clean_html_description)
    });
    let (minimum, recommended) = parse_requirements(data);
    Some(StorePayload {
        title,
        description,
        minimum,
        recommended,
        app_type: data
            .get("type")
            .and_then(Value::as_str)
            .and_then(steam_app_types::clean),
        controller_support: controller_support_of(data),
    })
}

fn parse_requirements(data: &Value) -> (Option<String>, Option<String>) {
    let mac = requirement_pair(data.get("mac_requirements"));
    if mac.0.is_some() || mac.1.is_some() {
        return mac;
    }
    requirement_pair(data.get("pc_requirements"))
}

fn requirement_pair(value: Option<&Value>) -> (Option<String>, Option<String>) {
    let Some(object) = value.filter(|value| value.is_object()) else {
        return (None, None);
    };
    (
        object
            .get("minimum")
            .and_then(Value::as_str)
            .and_then(clean_html_description),
        object
            .get("recommended")
            .and_then(Value::as_str)
            .and_then(clean_html_description),
    )
}

fn apply_requirements(
    entry: &mut SteamCatalogEntry,
    minimum: Option<String>,
    recommended: Option<String>,
) -> bool {
    let mut changed = false;
    if entry.minimum_requirements.is_none() {
        if let Some(text) = minimum {
            entry.minimum_requirements = Some(text);
            changed = true;
        }
    }
    if entry.recommended_requirements.is_none() {
        if let Some(text) = recommended {
            entry.recommended_requirements = Some(text);
            changed = true;
        }
    }
    changed
}

fn apply_proton_tier(entry: &mut SteamCatalogEntry, tier: String) -> bool {
    if entry.proton_tier.as_deref() == Some(tier.as_str()) {
        return false;
    }
    entry.proton_tier = Some(tier);
    true
}

pub fn parse_proton_tier(value: &Value) -> Option<String> {
    let tier = value
        .get("tier")
        .and_then(Value::as_str)?
        .to_ascii_lowercase();
    matches!(
        tier.as_str(),
        "platinum" | "gold" | "silver" | "bronze" | "borked" | "pending"
    )
    .then_some(tier)
}

pub fn parse_sgdb_title(app_id: &str, value: &Value) -> Option<String> {
    if value.get("success").and_then(Value::as_bool) != Some(true) {
        return None;
    }
    clean_title(
        app_id,
        value
            .get("data")
            .and_then(|data| data.get("name"))
            .and_then(Value::as_str)?,
    )
}

/// Fill missing titles, longer store copy, and square SteamGridDB covers for
/// every owned title that still needs copy or is older than seven days.
/// Installed, then favorites, then the rest, in batches of 4.
pub async fn hydrate(
    entries: &mut [SteamCatalogEntry],
    sgdb_key: Option<&str>,
    installed: &HashSet<String>,
    favorites: &HashSet<String>,
    force: bool,
) -> bool {
    let mut changed = classify(entries).await;
    let can_fetch_art = sgdb_key.is_some();
    let targets = hydrate_indices(entries, installed, favorites, can_fetch_art, force);
    if targets.is_empty() {
        return changed;
    }
    let mut sgdb_usable = can_fetch_art;
    for chunk in targets.chunks(HYDRATE_CONCURRENCY) {
        let mut set = tokio::task::JoinSet::new();
        for &index in chunk {
            let app_id = entries[index].app_id.clone();
            let key = sgdb_key.map(str::to_string);
            let need_copy = force
                || is_placeholder_title(&entries[index].title, &app_id)
                || is_thin_description(entries[index].description.as_deref());
            let need_art = sgdb_usable && (force || !has_square_cover(&entries[index]));
            set.spawn(async move {
                let store = if need_copy {
                    Some(fetch_store_catalog(&app_id).await)
                } else {
                    None
                };
                let proton = if need_copy {
                    Some(fetch_proton_tier(&app_id).await)
                } else {
                    None
                };
                let art = if need_art {
                    match key.as_deref() {
                        Some(key) => Some(steamgrid::fetch_square_cover(key, &app_id).await),
                        None => None,
                    }
                } else {
                    None
                };
                (index, store, proton, art)
            });
        }
        let mut hits = Vec::with_capacity(chunk.len());
        while let Some(joined) = set.join_next().await {
            if let Ok(hit) = joined {
                hits.push(hit);
            }
        }
        for (index, store, proton, art) in hits {
            let Some(entry) = entries.get_mut(index) else {
                continue;
            };
            if let Some(Ok(value)) = store {
                apply_store_details(entry, &value);
            }
            if let Some(Ok(tier)) = proton {
                apply_proton_tier(entry, tier);
            }
            match art {
                Some(Ok(assets)) => {
                    apply_details(entry, assets.title, None);
                    if let Some(url) = assets.cover_url {
                        apply_cover(entry, url);
                    }
                }
                Some(Err(err)) if err.contains("invalid") => sgdb_usable = false,
                _ => {}
            }
            entry.last_hydrated_at = Some(chrono::Utc::now().to_rfc3339());
            changed = true;
        }
    }
    changed
}

/// Fill missing app types in one batched lookup. A failed lookup leaves them
/// unset so the next hydrate retries.
async fn classify(entries: &mut [SteamCatalogEntry]) -> bool {
    let missing: Vec<String> = entries
        .iter()
        .filter(|entry| entry.app_type.is_none())
        .map(|entry| entry.app_id.clone())
        .collect();
    if missing.is_empty() {
        return false;
    }
    let Ok(types) = steam_app_types::fetch(&missing).await else {
        return false;
    };
    apply_app_types(entries, &types)
}

pub fn apply_app_types(entries: &mut [SteamCatalogEntry], types: &HashMap<String, String>) -> bool {
    let mut changed = false;
    for entry in entries.iter_mut().filter(|entry| entry.app_type.is_none()) {
        if let Some(kind) = types.get(&entry.app_id) {
            entry.app_type = Some(kind.clone());
            changed = true;
        }
    }
    changed
}

pub async fn fetch_store_catalog(app_id: &str) -> Result<Value, String> {
    if !valid_app_id(app_id) {
        return Err("Invalid Steam app ID".into());
    }
    crate::services::http::orbit_client()?
        .get(STORE_DETAILS)
        .query(&[("appids", app_id), ("l", "english")])
        .timeout(Duration::from_secs(8))
        .send()
        .await
        .map_err(|err| err.without_url().to_string())?
        .error_for_status()
        .map_err(|err| err.without_url().to_string())?
        .json()
        .await
        .map_err(|err| err.to_string())
}

async fn fetch_proton_tier(app_id: &str) -> Result<String, String> {
    if !valid_app_id(app_id) {
        return Err("Invalid Steam app ID".into());
    }
    let value: Value = crate::services::http::orbit_client()?
        .get(format!("{PROTONDB_SUMMARIES}/{app_id}.json"))
        .timeout(Duration::from_secs(8))
        .send()
        .await
        .map_err(|err| err.without_url().to_string())?
        .error_for_status()
        .map_err(|err| err.without_url().to_string())?
        .json()
        .await
        .map_err(|err| err.to_string())?;
    parse_proton_tier(&value).ok_or_else(|| "ProtonDB has no summary".into())
}

fn parse_owned_game(game: &Value) -> Option<SteamCatalogEntry> {
    let app_id = game.get("appid").and_then(Value::as_u64)?.to_string();
    if !valid_app_id(&app_id) {
        return None;
    }
    let title = game
        .get("name")
        .and_then(Value::as_str)
        .and_then(|name| clean_title(&app_id, name))
        .unwrap_or_else(|| placeholder_title(&app_id));
    Some(SteamCatalogEntry {
        app_id,
        title,
        playtime_seconds: json_minutes(game, "playtime_forever"),
        last_played_at: json_unix(game, "rtime_last_played")
            .and_then(crate::utils::steam_playtime::unix_to_rfc3339),
        ..SteamCatalogEntry::default()
    })
}

fn json_minutes(game: &Value, key: &str) -> i64 {
    game.get(key)
        .and_then(Value::as_u64)
        .or_else(|| {
            game.get(key)
                .and_then(Value::as_str)
                .and_then(|value| value.parse().ok())
        })
        .map(|minutes| i64::try_from(minutes).unwrap_or(0).saturating_mul(60))
        .unwrap_or(0)
}

fn json_unix(game: &Value, key: &str) -> Option<i64> {
    game.get(key)
        .and_then(Value::as_i64)
        .or_else(|| {
            game.get(key)
                .and_then(Value::as_u64)
                .and_then(|value| i64::try_from(value).ok())
        })
        .or_else(|| {
            game.get(key)
                .and_then(Value::as_str)
                .and_then(|value| value.parse().ok())
        })
        .filter(|value| *value > 0)
}

fn parse_stored_item(item: Value) -> Option<SteamCatalogEntry> {
    match item {
        Value::String(app_id) => SteamCatalogEntry::from_app_id(&app_id),
        Value::Number(number) => SteamCatalogEntry::from_app_id(&number.to_string()),
        Value::Object(_) => {
            let parsed: SteamCatalogEntry = serde_json::from_value(item).ok()?;
            let app_id = parsed.app_id;
            if !valid_app_id(&app_id) {
                return None;
            }
            Some(SteamCatalogEntry {
                install_size_bytes: parsed.install_size_bytes.filter(|bytes| *bytes > 0),
                title: clean_title(&app_id, &parsed.title)
                    .unwrap_or_else(|| placeholder_title(&app_id)),
                description: parsed
                    .description
                    .and_then(|text| clean_html_description(&text)),
                cover_url: parsed.cover_url.filter(|url| steamgrid::sgdb_cdn_url(url)),
                hero_url: parsed.hero_url.filter(|url| url.starts_with("https://")),
                last_hydrated_at: parsed.last_hydrated_at,
                minimum_requirements: parsed
                    .minimum_requirements
                    .and_then(|text| clean_html_description(&text)),
                recommended_requirements: parsed
                    .recommended_requirements
                    .and_then(|text| clean_html_description(&text)),
                proton_tier: parsed
                    .proton_tier
                    .filter(|tier| parse_proton_tier(&json!({ "tier": tier })).is_some()),
                // Stored rows are untrusted: only the three known values.
                controller_support: parsed
                    .controller_support
                    .filter(|value| matches!(value.as_str(), "full" | "partial" | "none")),
                playtime_seconds: parsed.playtime_seconds.max(0),
                last_played_at: parsed
                    .last_played_at
                    .filter(|stamp| chrono::DateTime::parse_from_rfc3339(stamp).is_ok()),
                app_type: parsed.app_type.as_deref().and_then(steam_app_types::clean),
                app_id,
            })
        }
        _ => None,
    }
}

fn apply_details(
    entry: &mut SteamCatalogEntry,
    title: Option<String>,
    description: Option<String>,
) -> bool {
    let mut changed = false;
    if let Some(title) = title {
        if is_placeholder_title(&entry.title, &entry.app_id) && title != entry.title {
            entry.title = title;
            changed = true;
        }
    }
    if let Some(description) = description {
        let incoming = description.chars().count();
        let current = entry
            .description
            .as_deref()
            .map(|text| text.trim().chars().count())
            .unwrap_or(0);
        if is_thin_description(entry.description.as_deref()) && incoming > current {
            entry.description = Some(description);
            changed = true;
        }
    }
    changed
}

fn apply_cover(entry: &mut SteamCatalogEntry, url: String) -> bool {
    if !steamgrid::sgdb_cdn_url(&url) || entry.cover_url.as_deref() == Some(url.as_str()) {
        return false;
    }
    if has_square_cover(entry) {
        return false;
    }
    entry.cover_url = Some(url);
    true
}

fn clean_title(app_id: &str, title: &str) -> Option<String> {
    let trimmed: String = title.trim().chars().take(TITLE_LIMIT).collect();
    if trimmed.is_empty() || is_placeholder_title(&trimmed, app_id) {
        None
    } else {
        Some(trimmed)
    }
}

fn clean_html_description(text: &str) -> Option<String> {
    let stripped = strip_html(text);
    let trimmed: String = stripped.trim().chars().take(DESCRIPTION_LIMIT).collect();
    (!trimmed.is_empty()).then_some(trimmed)
}

fn strip_html(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut in_tag = false;
    let mut tag = String::new();
    for character in input.chars() {
        if character == '<' {
            in_tag = true;
            tag.clear();
            continue;
        }
        if character == '>' && in_tag {
            in_tag = false;
            let name = tag
                .trim()
                .trim_start_matches('/')
                .split(|c: char| c.is_ascii_whitespace() || c == '/')
                .next()
                .unwrap_or("")
                .to_ascii_lowercase();
            if matches!(
                name.as_str(),
                "br" | "p" | "li" | "div" | "h1" | "h2" | "h3"
            ) {
                out.push(' ');
            }
            continue;
        }
        if in_tag {
            if tag.len() < 32 {
                tag.push(character);
            }
            continue;
        }
        out.push(character);
    }
    collapse_whitespace(&decode_entities(&out))
}

fn decode_entities(input: &str) -> String {
    input
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&rsquo;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

fn collapse_whitespace(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut pending_space = false;
    for character in input.chars() {
        if character.is_whitespace() {
            pending_space = true;
            continue;
        }
        if pending_space && !out.is_empty() {
            out.push(' ');
        }
        pending_space = false;
        out.push(character);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn incomplete_api_responses_cannot_erase_a_saved_library() {
        for body in [
            r#"{}"#,
            r#"{"response":{}}"#,
            r#"{"response":{"game_count":61}}"#,
        ] {
            assert!(parse_owned_games(body).is_err());
        }
        assert!(parse_owned_games(r#"{"response":{"game_count":0}}"#)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn api_ownership_refresh_preserves_metadata_but_removes_unowned_games() {
        let mut gow = SteamCatalogEntry::from_app_id("1593500").unwrap();
        gow.description = Some("Saved description".into());
        gow.last_hydrated_at = Some("2026-11-15T00:00:00Z".into());
        let old = vec![gow.clone(), SteamCatalogEntry::from_app_id("570").unwrap()];
        let mut fetched = SteamCatalogEntry::from_app_id("1593500").unwrap();
        fetched.title = "God of War".into();
        let merged = merge_api_snapshot(&old, vec![fetched]);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].title, "God of War");
        assert_eq!(merged[0].description, gow.description);
        assert_eq!(merged[0].last_hydrated_at, gow.last_hydrated_at);
    }

    #[test]
    fn owned_games_keep_steam_titles_from_appinfo() {
        let games = parse_owned_games(
            r#"{"response":{"games":[{"appid":550,"name":"Left 4 Dead 2"},{"appid":0},{"name":"skip"},{"appid":730}]}}"#,
        )
        .unwrap();
        assert_eq!(games[0].app_id, "550");
        assert_eq!(games[0].title, "Left 4 Dead 2");
        assert_eq!(games[1].app_id, "730");
        assert_eq!(games[1].title, "Steam 730");
        assert!(games.iter().all(|game| game.description.is_none()));
    }

    #[test]
    fn owned_games_keep_playtime_minutes_and_last_played() {
        let games = parse_owned_games(
            r#"{"response":{"games":[{"appid":883710,"name":"Resident Evil 2","playtime_forever":125,"rtime_last_played":1700000000},{"appid":730,"playtime_forever":0,"rtime_last_played":0}]}}"#,
        )
        .unwrap();
        assert_eq!(games[0].playtime_seconds, 7500);
        assert_eq!(
            games[0].last_played_at.as_deref(),
            Some("2023-11-14T22:13:20Z")
        );
        assert_eq!(games[1].playtime_seconds, 0);
        assert_eq!(games[1].last_played_at, None);
    }

    #[test]
    fn stored_library_reads_legacy_ids_and_named_objects() {
        let parsed = parse_stored_library(Some(json!([
            "550",
            {"appId": "220", "title": "Half-Life 2", "description": "The right man in the wrong place."},
            {"appId": "nope", "title": "skip"}
        ])));
        assert_eq!(parsed[0].title, "Steam 550");
        assert_eq!(parsed[1].title, "Half-Life 2");
        assert_eq!(
            parsed[1].description.as_deref(),
            Some("The right man in the wrong place.")
        );
        assert_eq!(parsed.len(), 2);
    }

    #[test]
    fn stored_library_keeps_playtime_from_owned_games() {
        let parsed = parse_stored_library(Some(json!([{
            "appId": "883710",
            "title": "Resident Evil 2",
            "playtimeSeconds": 7500,
            "lastPlayedAt": "2023-11-14T22:13:20Z"
        }])));
        assert_eq!(parsed[0].playtime_seconds, 7500);
        assert_eq!(
            parsed[0].last_played_at.as_deref(),
            Some("2023-11-14T22:13:20Z")
        );
    }

    #[test]
    fn local_partial_or_empty_ids_never_erase_the_saved_library() {
        let saved = vec![SteamCatalogEntry {
            app_id: "1593500".into(),
            title: "God of War".into(),
            ..Default::default()
        }];
        assert_eq!(merge_owned_ids(&saved, &[]), saved);
        let merged = merge_owned_ids(&saved, &["570".into()]);
        assert!(merged
            .iter()
            .any(|game| game.app_id == "1593500" && game.title == "God of War"));
        assert!(merged.iter().any(|game| game.app_id == "570"));
    }

    #[test]
    fn merge_keeps_saved_titles_when_local_ids_refresh() {
        let existing = vec![SteamCatalogEntry {
            app_id: "550".into(),
            title: "Left 4 Dead 2".into(),
            description: Some("Zombies.".into()),
            cover_url: Some("https://cdn.steamgriddb.com/grid/l4d2.png".into()),
            ..SteamCatalogEntry::default()
        }];
        let merged = merge_owned_ids(&existing, &["550".into(), "8850".into()]);
        assert_eq!(merged[0].title, "Left 4 Dead 2");
        assert_eq!(merged[0].description.as_deref(), Some("Zombies."));
        assert_eq!(
            merged[0].cover_url.as_deref(),
            Some("https://cdn.steamgriddb.com/grid/l4d2.png")
        );
        assert_eq!(merged[1].title, "Steam 8850");
    }

    #[test]
    fn empty_web_library_keeps_local_tickets_and_saved_titles() {
        let existing = vec![SteamCatalogEntry {
            app_id: "1593500".into(),
            title: "God of War".into(),
            ..SteamCatalogEntry::default()
        }];
        let local = vec!["1593500".into(), "883710".into()];
        let kept = apply_owned_snapshot(&existing, &local, Some(&[]));
        assert!(kept
            .iter()
            .any(|game| game.app_id == "1593500" && game.title == "God of War"));
        assert!(kept.iter().any(|game| game.app_id == "883710"));
        let api = vec![SteamCatalogEntry {
            app_id: "883710".into(),
            title: "Resident Evil 2".into(),
            playtime_seconds: 120,
            ..SteamCatalogEntry::default()
        }];
        let merged = apply_owned_snapshot(&existing, &local, Some(&api));
        assert!(merged
            .iter()
            .any(|game| game.app_id == "883710" && game.title == "Resident Evil 2"));
        assert!(merged
            .iter()
            .any(|game| game.app_id == "1593500" && game.title == "God of War"));
    }

    #[test]
    fn store_details_take_the_official_title_and_short_description() {
        let value = json!({
            "550": {
                "success": true,
                "data": {
                    "name": "Left 4 Dead 2",
                    "short_description": "Too short.",
                    "about_the_game": "<p>Set in the zombie apocalypse, Left 4 Dead 2 (L4D2) is the highly anticipated sequel to the award-winning Left 4 Dead, the #1 co-op game of 2008.</p><br>You&rsquo;ll play as one of four new survivors."
                }
            }
        });
        let mut entry = SteamCatalogEntry::from_app_id("550").unwrap();
        assert!(apply_store_details(&mut entry, &value));
        assert_eq!(entry.title, "Left 4 Dead 2");
        assert_eq!(
            entry.description.as_deref(),
            Some("Set in the zombie apocalypse, Left 4 Dead 2 (L4D2) is the highly anticipated sequel to the award-winning Left 4 Dead, the #1 co-op game of 2008. You'll play as one of four new survivors.")
        );
        assert!(!apply_store_details(&mut entry, &value));
    }

    #[test]
    fn store_details_keep_windows_requirements_and_protondb_tiers() {
        let value = json!({
            "550": {
                "success": true,
                "data": {
                    "name": "Left 4 Dead 2",
                    "short_description": "Zombie co-op.",
                    "about_the_game": "<p>Set in the zombie apocalypse.</p>",
                    "mac_requirements": [],
                    "pc_requirements": {
                        "minimum": "<strong>Minimum:</strong><br><ul><li>OS: Windows 7</li></ul>",
                        "recommended": "<strong>Recommended:</strong><br>8 GB RAM"
                    }
                }
            }
        });
        let mut entry = SteamCatalogEntry::from_app_id("550").unwrap();
        assert!(apply_store_details(&mut entry, &value));
        assert_eq!(
            entry.minimum_requirements.as_deref(),
            Some("Minimum: OS: Windows 7")
        );
        assert_eq!(
            entry.recommended_requirements.as_deref(),
            Some("Recommended: 8 GB RAM")
        );
        assert_eq!(
            parse_proton_tier(&json!({ "tier": "gold" })).as_deref(),
            Some("gold")
        );
        assert!(parse_proton_tier(&json!({ "tier": "unknown" })).is_none());
    }

    #[test]
    fn importer_placeholders_count_as_thin_even_when_long() {
        let long = format!(
            "Imported from GameHub — {}",
            "/Users/me/GameHub/steamapps/common/a-really-long-game-folder".repeat(4)
        );
        assert!(is_thin_description(Some(&long)));
        assert!(is_thin_description(Some("Imported from GameHub.")));
        assert!(!is_thin_description(Some(
            "Set in the zombie apocalypse, Left 4 Dead 2 is the highly anticipated sequel to the award-winning Left 4 Dead."
        )));
    }

    #[test]
    fn placeholder_catalog_needs_store_details() {
        let placeholders = vec![SteamCatalogEntry::from_app_id("883710").unwrap()];
        assert!(catalog_needs_hydrate(&placeholders));
        let mut named = SteamCatalogEntry::from_app_id("1593500").unwrap();
        named.title = "God of War".into();
        named.last_hydrated_at = Some(chrono::Utc::now().to_rfc3339());
        named.description = Some(
            "From Santa Monica Studio comes the reimagining of God of War, following Kratos and Atreus."
                .into(),
        );
        named.cover_url =
            Some("https://cdn.akamai.steamstatic.com/steam/apps/1593500/header.jpg".into());
        named.app_type = Some("game".into());
        assert!(!catalog_needs_hydrate(&[named]));
    }

    #[test]
    fn hydrate_prefers_installed_then_favorites_and_covers_the_full_catalog() {
        let mut complete = SteamCatalogEntry {
            app_id: "730".into(),
            title: "Counter-Strike 2".into(),
            description: Some(
                "Counter-Strike 2 is a tactical team-based shooter with bomb defusal and hostage rescue modes."
                    .into(),
            ),
            cover_url: Some("https://cdn.steamgriddb.com/grid/cs2.png".into()),
            last_hydrated_at: Some(chrono::Utc::now().to_rfc3339()),
            app_type: Some("game".into()),
            controller_support: Some("full".into()),
            ..SteamCatalogEntry::default()
        };
        let mut installed_thin = SteamCatalogEntry::from_app_id("570").unwrap();
        installed_thin.app_id = "570".into();
        let favorite = SteamCatalogEntry::from_app_id("550").unwrap();
        let rest: Vec<_> = (0..32)
            .map(|index| SteamCatalogEntry::from_app_id(&format!("{}", 10_000 + index)).unwrap())
            .collect();
        let mut entries = vec![complete.clone(), installed_thin, favorite];
        entries.extend(rest);
        complete.last_hydrated_at = Some(chrono::Utc::now().to_rfc3339());
        let installed = HashSet::from(["570".into(), "730".into()]);
        let favorites = HashSet::from(["550".into()]);
        let indices = hydrate_indices(&entries, &installed, &favorites, true, false);
        assert_eq!(indices[0], 1);
        assert_eq!(indices[1], 2);
        assert_eq!(indices.len(), 34);
        let forced = hydrate_indices(&entries, &installed, &favorites, true, true);
        assert_eq!(forced.len(), entries.len());
    }

    #[test]
    fn original_steam_capsule_urls_use_the_app_id() {
        assert_eq!(
            cover_url("550"),
            "https://cdn.akamai.steamstatic.com/steam/apps/550/library_600x900_2x.jpg"
        );
        assert_eq!(
            hero_url("550"),
            "https://cdn.akamai.steamstatic.com/steam/apps/550/library_hero.jpg"
        );
        assert_eq!(
            logo_url("1593500"),
            "https://cdn.akamai.steamstatic.com/steam/apps/1593500/logo.png"
        );
    }

    #[test]
    fn include_installed_adds_extra_library_ids_missing_from_owned_catalog() {
        let owned = SteamCatalogEntry {
            app_id: "730".into(),
            title: "Counter-Strike 2".into(),
            last_hydrated_at: Some(chrono::Utc::now().to_rfc3339()),
            description: Some(
                "Counter-Strike 2 is a tactical team-based shooter with bomb defusal and hostage rescue modes."
                    .into(),
            ),
            ..SteamCatalogEntry::default()
        };
        let installed = HashSet::from(["730".into(), "447040".into()]);
        let entries = include_installed(vec![owned], &installed);
        assert!(entries.iter().any(|entry| entry.app_id == "447040"));
        assert!(catalog_needs_hydrate(&entries));
        assert_eq!(entries.len(), 2);
    }

    #[test]
    fn sgdb_title_comes_from_the_steam_app_lookup() {
        let value = json!({"success": true, "data": {"id": 12, "name": "BioShock 2"}});
        assert_eq!(
            parse_sgdb_title("8850", &value).as_deref(),
            Some("BioShock 2")
        );
        assert!(parse_sgdb_title("8850", &json!({"success": false})).is_none());
    }

    #[test]
    fn store_details_record_the_steam_app_type() {
        let details = |kind: &str| json!({ "1": { "success": true, "data": { "name": "Driver Booster for Steam", "type": kind } } });
        let mut tool = SteamCatalogEntry::from_app_id("1").unwrap();
        assert!(apply_store_details(&mut tool, &details("Application")));
        assert_eq!(tool.app_type.as_deref(), Some("application"));
        assert!(!is_game(&tool, true));

        let mut game = SteamCatalogEntry::from_app_id("1").unwrap();
        apply_store_details(&mut game, &details("game"));
        assert!(is_game(&game, false));

        // Unclassified entries stay visible until the store says otherwise.
        assert!(is_game(
            &SteamCatalogEntry::from_app_id("2").unwrap(),
            false
        ));
        // Garbage types are ignored rather than stored.
        let mut odd = SteamCatalogEntry::from_app_id("1").unwrap();
        apply_store_details(&mut odd, &details("<script>"));
        assert_eq!(odd.app_type, None);
    }

    #[test]
    fn missing_types_trigger_a_batched_lookup_not_per_app_refetches() {
        let mut entry = SteamCatalogEntry::from_app_id("7").unwrap();
        entry.title = "Steam".into();
        entry.description = Some("x".repeat(THIN_DESCRIPTION + 1));
        entry.last_hydrated_at = Some(chrono::Utc::now().to_rfc3339());
        entry.controller_support = Some("none".into());
        assert!(catalog_needs_hydrate(std::slice::from_ref(&entry)));
        assert!(!needs_metadata(&entry, false));

        let mut entries = vec![entry, SteamCatalogEntry::from_app_id("920490").unwrap()];
        let types = HashMap::from([
            ("7".to_string(), steam_app_types::UNLISTED.to_string()),
            ("920490".to_string(), "application".to_string()),
        ]);
        assert!(apply_app_types(&mut entries, &types));
        assert!(
            !apply_app_types(&mut entries, &types),
            "known types are kept"
        );
        assert!(!catalog_needs_hydrate(&entries[..1]));
        // Steam's own client has no store item and no play history.
        assert!(!is_game(&entries[0], false));
        assert!(!is_game(&entries[1], false));
    }

    #[test]
    fn delisted_games_with_history_stay_visible() {
        let mut entry = SteamCatalogEntry::from_app_id("224060").unwrap();
        assert!(apply_store_details(
            &mut entry,
            &json!({ "224060": { "success": false } })
        ));
        assert_eq!(entry.app_type.as_deref(), Some(steam_app_types::UNLISTED));
        assert!(!is_game(&entry, false));
        assert!(is_game(&entry, true), "installed");
        entry.playtime_seconds = 60;
        assert!(is_game(&entry, false), "played");
    }

    #[test]
    fn stored_and_refreshed_entries_keep_their_app_type() {
        let stored = parse_stored_library(Some(json!([
            { "appId": "1", "title": "Tool", "appType": "application" },
            { "appId": "2", "title": "Odd", "appType": "../../etc" }
        ])));
        assert_eq!(stored[0].app_type.as_deref(), Some("application"));
        assert_eq!(stored[1].app_type, None);
        let refreshed =
            merge_api_snapshot(&stored, vec![SteamCatalogEntry::from_app_id("1").unwrap()]);
        assert_eq!(refreshed[0].app_type.as_deref(), Some("application"));
    }

    #[test]
    fn store_details_record_controller_support() {
        let mut entry = SteamCatalogEntry::from_app_id("1593500").unwrap();
        assert!(needs_metadata(&entry, false), "never asked yet");
        let value = json!({ "1593500": { "success": true, "data": {
            "name": "God of War", "controller_support": "full"
        }}});
        assert!(apply_store_details(&mut entry, &value));
        assert_eq!(entry.controller_support.as_deref(), Some("full"));
        let none = json!({ "type": "game" });
        assert_eq!(controller_support_of(&none), "none");
        assert_eq!(
            controller_support_of(&json!({ "controller_support": "partial" })),
            "partial"
        );
    }

    #[test]
    fn local_catalog_entries_add_newly_bought_games_and_preserve_existing_playtime_and_copy() {
        let existing = vec![
            SteamCatalogEntry {
                app_id: "1593500".into(),
                title: "God of War".into(),
                description: Some("Saved store copy.".into()),
                cover_url: Some("https://cdn.steamgriddb.com/grid/gow.png".into()),
                playtime_seconds: 7200,
                last_played_at: Some("2026-11-20T12:00:00Z".into()),
                app_type: Some("game".into()),
                controller_support: Some("full".into()),
                ..SteamCatalogEntry::default()
            },
            SteamCatalogEntry::from_app_id("2322010").unwrap(),
        ];
        let local_entries = vec![
            SteamCatalogEntry {
                app_id: "1593500".into(),
                title: "God of War".into(),
                app_type: Some("game".into()),
                ..SteamCatalogEntry::default()
            },
            SteamCatalogEntry {
                app_id: "2322010".into(),
                title: "God of War Ragnarök".into(),
                app_type: Some("game".into()),
                ..SteamCatalogEntry::default()
            },
            SteamCatalogEntry {
                app_id: "1808500".into(),
                title: "ARC Raiders".into(),
                app_type: Some("game".into()),
                ..SteamCatalogEntry::default()
            },
        ];
        let merged = apply_owned_snapshot_with_local(&existing, &[], &local_entries, None);
        let gow = merged.iter().find(|e| e.app_id == "1593500").unwrap();
        assert_eq!(gow.playtime_seconds, 7200);
        assert_eq!(gow.last_played_at.as_deref(), Some("2026-11-20T12:00:00Z"));
        assert_eq!(gow.description.as_deref(), Some("Saved store copy."));
        assert_eq!(gow.controller_support.as_deref(), Some("full"));

        let ragnarok = merged.iter().find(|e| e.app_id == "2322010").unwrap();
        assert_eq!(ragnarok.title, "God of War Ragnarök");
        assert_eq!(ragnarok.app_type.as_deref(), Some("game"));

        let arc = merged.iter().find(|e| e.app_id == "1808500").unwrap();
        assert_eq!(arc.title, "ARC Raiders");
        assert_eq!(arc.app_type.as_deref(), Some("game"));
    }
}
