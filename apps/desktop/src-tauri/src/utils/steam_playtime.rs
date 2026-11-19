//! Steam playtime from localconfig.vdf. Minutes become seconds. Ticket values
//! and paths are not kept.

use std::collections::HashMap;
use std::fs;
use std::path::Path;

use regex::Regex;

use crate::services::steam_download::valid_app_id;

const USERDATA_CAP: usize = 8;
const FILE_CAP: u64 = 8 * 1024 * 1024;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SteamPlayRecord {
    pub seconds: i64,
    pub last_played_at: Option<String>,
}

pub fn load_roots<P: AsRef<Path>>(roots: &[P]) -> HashMap<String, SteamPlayRecord> {
    let mut map = HashMap::new();
    for root in roots {
        load_userdata(root.as_ref(), &mut map);
    }
    map
}

fn load_userdata(steam_root: &Path, map: &mut HashMap<String, SteamPlayRecord>) {
    let Ok(entries) = fs::read_dir(steam_root.join("userdata")) else {
        return;
    };
    for entry in entries.flatten().take(USERDATA_CAP) {
        let localconfig = entry.path().join("config/localconfig.vdf");
        let Ok(metadata) = fs::metadata(&localconfig) else {
            continue;
        };
        if metadata.len() > FILE_CAP {
            continue;
        }
        let Ok(content) = fs::read_to_string(&localconfig) else {
            continue;
        };
        merge_records(map, parse_localconfig(&content));
    }
}

pub fn parse_localconfig(content: &str) -> HashMap<String, SteamPlayRecord> {
    let mut map = HashMap::new();
    let clipped = if content.len() > FILE_CAP as usize {
        &content[..FILE_CAP as usize]
    } else {
        content
    };
    let Ok(app_re) = Regex::new(r#""(\d+)"\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}"#) else {
        return map;
    };
    let Ok(playtime_re) = Regex::new(r#""Playtime"\s+"(\d+)""#) else {
        return map;
    };
    let Ok(last_played_re) = Regex::new(r#""LastPlayed"\s+"(\d+)""#) else {
        return map;
    };
    for capture in app_re.captures_iter(&clipped) {
        let Some(app_id) = capture.get(1).map(|m| m.as_str()) else {
            continue;
        };
        if !valid_app_id(app_id) {
            continue;
        }
        let Some(block) = capture.get(2).map(|m| m.as_str()) else {
            continue;
        };
        let seconds = playtime_re
            .captures(block)
            .and_then(|item| item.get(1))
            .and_then(|item| item.as_str().parse::<i64>().ok())
            .map(|minutes| minutes.saturating_mul(60))
            .unwrap_or(0);
        let last_played_at = last_played_re
            .captures(block)
            .and_then(|item| item.get(1))
            .and_then(|item| item.as_str().parse::<i64>().ok())
            .and_then(unix_to_rfc3339);
        if seconds <= 0 && last_played_at.is_none() {
            continue;
        }
        merge_record(
            map.entry(app_id.to_string()).or_default(),
            SteamPlayRecord {
                seconds,
                last_played_at,
            },
        );
    }
    map
}

pub fn merge_records(
    into: &mut HashMap<String, SteamPlayRecord>,
    from: HashMap<String, SteamPlayRecord>,
) {
    for (app_id, record) in from {
        merge_record(into.entry(app_id).or_default(), record);
    }
}

pub fn merge_record(into: &mut SteamPlayRecord, from: SteamPlayRecord) {
    if from.seconds > into.seconds {
        into.seconds = from.seconds;
    }
    into.last_played_at = later_stamp(into.last_played_at.clone(), from.last_played_at);
}

pub fn later_stamp(left: Option<String>, right: Option<String>) -> Option<String> {
    match (left, right) {
        (None, value) | (value, None) => value,
        (Some(left), Some(right)) => Some(if right > left { right } else { left }),
    }
}

pub fn unix_to_rfc3339(seconds: i64) -> Option<String> {
    if seconds <= 0 {
        return None;
    }
    chrono::DateTime::from_timestamp(seconds, 0)
        .map(|stamp| stamp.to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_playtimes_from_localconfig_minutes_to_seconds() {
        let content = r#"
"UserLocalConfigStore"
{
	"Software"
	{
		"Valve"
		{
			"Steam"
			{
				"apps"
				{
					"570"
					{
						"Playtime"		"42"
						"LastPlayed"		"1700000000"
					}
					"440"
					{
						"Playtime"		"10"
					}
				}
			}
		}
	}
}
"#;
        let map = parse_localconfig(content);
        assert_eq!(map.get("570").map(|item| item.seconds), Some(2520));
        assert_eq!(
            map.get("570")
                .and_then(|item| item.last_played_at.as_deref()),
            Some("2023-11-14T22:13:20Z")
        );
        assert_eq!(map.get("440").map(|item| item.seconds), Some(600));
    }
}
