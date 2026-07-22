use std::fs;
use std::path::{Path, PathBuf};

use regex::Regex;

use crate::models::GameContentSummary;

const CYBERPUNK_APP_ID: &str = "1091500";

/// Cyberpunk 2077 depot IDs we can label on macOS installs (best-effort).
const CYBERPUNK_DEPOT_LABELS: &[(&str, &str)] = &[
    ("1460472", "Base game"),
    ("2060313", "Phantom Liberty"),
    ("2060314", "Bonus content"),
    ("2138331", "Phantom Liberty"),
    ("2138332", "Phantom Liberty assets"),
];

pub fn detect_steam_root() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    [
        home.join("Library/Application Support/Steam"),
        PathBuf::from("/Applications/Steam.app/Contents/MacOS"),
        home.join(".steam/steam"),
        home.join(".local/share/Steam"),
    ]
    .into_iter()
    .find(|path| path.exists())
}

pub fn steam_content_for_app(
    steam_root: &Path,
    app_id: &str,
) -> Option<GameContentSummary> {
    if app_id != CYBERPUNK_APP_ID {
        return None;
    }

    let manifest_path = find_appmanifest(steam_root, app_id)?;
    let content = fs::read_to_string(&manifest_path).ok()?;
    let build_id = vdf_value(&content, "buildid");
    let last_updated = vdf_value(&content, "lastupdated")
        .or_else(|| vdf_value(&content, "LastUpdated"))
        .and_then(|value| value.parse::<i64>().ok())
        .map(format_steam_updated);

    let depots = parse_installed_depots(&content);
    let mut dlc_names: Vec<String> = depots
        .iter()
        .filter_map(|depot_id| {
            CYBERPUNK_DEPOT_LABELS
                .iter()
                .find(|(id, _)| *id == depot_id.as_str())
                .map(|(_, label)| (*label).to_string())
        })
        .collect();
    dlc_names.sort();
    dlc_names.dedup();

    let add_on_count = depots
        .iter()
        .filter(|depot_id| *depot_id != "1460472")
        .count() as u32;

    let version_label = build_id.map(|id| format!("Build {id}"));
    let version_detail = last_updated.or_else(|| {
        if add_on_count == 0 {
            Some("Base game installed".into())
        } else {
            None
        }
    });

    Some(GameContentSummary {
        game_id: String::new(),
        version_label,
        version_detail,
        dlc_count: add_on_count,
        update_count: 0,
        dlc_names,
        has_base: depots.iter().any(|depot| depot == "1460472"),
    })
}

fn find_appmanifest(steam_root: &Path, app_id: &str) -> Option<PathBuf> {
    let mut library_paths = vec![steam_root.to_path_buf()];
    let vdf = steam_root.join("steamapps/libraryfolders.vdf");
    if vdf.exists() {
        library_paths.extend(parse_library_folders(&vdf).unwrap_or_default());
    }

    for library in library_paths {
        let steamapps = if library.ends_with("steamapps") {
            library
        } else {
            library.join("steamapps")
        };
        let manifest = steamapps.join(format!("appmanifest_{app_id}.acf"));
        if manifest.exists() {
            return Some(manifest);
        }
    }

    None
}

fn parse_library_folders(path: &Path) -> Option<Vec<PathBuf>> {
    let content = fs::read_to_string(path).ok()?;
    let re = Regex::new(r#""path"\s+"([^"]+)""#).ok()?;
    Some(
        re.captures_iter(&content)
            .filter_map(|capture| capture.get(1).map(|m| PathBuf::from(m.as_str())))
            .collect(),
    )
}

fn vdf_value(content: &str, key: &str) -> Option<String> {
    let pattern = format!(r#""{key}"\s+"([^"]*)""#);
    let re = Regex::new(&pattern).ok()?;
    re.captures(content)
        .and_then(|capture| capture.get(1).map(|m| m.as_str().to_string()))
}

fn parse_installed_depots(content: &str) -> Vec<String> {
    let Some(start) = content.find("\"InstalledDepots\"") else {
        return Vec::new();
    };

    let slice = &content[start..];
    let Some(open) = slice.find('{') else {
        return Vec::new();
    };

    let mut depth = 0usize;
    let mut end = open;
    for (index, ch) in slice[open..].char_indices() {
        match ch {
            '{' => depth += 1,
            '}' => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    end = open + index;
                    break;
                }
            }
            _ => {}
        }
    }

    let block = &slice[open + 1..end];
    let depot_re = Regex::new(r#"(?m)^\s+"(\d+)"\s*\{"#).unwrap();
    depot_re
        .captures_iter(block)
        .filter_map(|capture| capture.get(1).map(|m| m.as_str().to_string()))
        .collect()
}

fn format_steam_updated(unix_seconds: i64) -> String {
    use chrono::{TimeZone, Utc};
    Utc.timestamp_opt(unix_seconds, 0)
        .single()
        .map(|dt| format!("Updated {}", dt.format("%b %-d, %Y")))
        .unwrap_or_else(|| "Recently updated".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_installed_depots_from_manifest() {
        let sample = r#"
"InstalledDepots"
{
    "1460472"
    {
        "manifest" "123"
        "size" "100"
    }
    "2060313"
    {
        "manifest" "456"
        "size" "200"
    }
}
"#;
        let depots = parse_installed_depots(sample);
        assert_eq!(depots, vec!["1460472".to_string(), "2060313".to_string()]);
    }
}
