use std::collections::HashMap;

use crate::database::GameRepository;
use crate::models::{GameContentSummary, GameProvider, HomeContentInventory, LaunchConfiguration};
use crate::services::steam_content::{detect_steam_root, steam_content_for_app};
use crate::services::switch_library::scan_switch_library_from_library;

pub fn build_home_content_inventory(repo: &GameRepository) -> Result<HomeContentInventory, String> {
    let games = repo.list_games().map_err(|error| error.to_string())?;
    let mut summaries = HashMap::new();

    if games.iter().any(|game| game.provider == GameProvider::Astris) {
        let scan = scan_switch_library_from_library(repo)?;
        for group in scan.groups {
            let Some(game_id) = group.linked_game_id.clone() else {
                continue;
            };

            let latest_version = group
                .updates
                .iter()
                .max_by_key(|entry| version_sort_key(&entry.version))
                .and_then(|entry| entry.version.clone())
                .or_else(|| group.base.as_ref().and_then(|entry| entry.version.clone()));

            let version_detail = if group.updates.is_empty() {
                Some("Base game only".into())
            } else {
                Some(format!(
                    "{} update{} on disk",
                    group.updates.len(),
                    if group.updates.len() == 1 { "" } else { "s" }
                ))
            };

            let dlc_names: Vec<String> = group
                .dlcs
                .iter()
                .map(|entry| entry.label.clone())
                .collect();

            summaries.insert(
                game_id.clone(),
                GameContentSummary {
                    game_id,
                    version_label: latest_version.map(format_switch_version),
                    version_detail,
                    dlc_count: group.dlcs.len() as u32,
                    update_count: group.updates.len() as u32,
                    dlc_names,
                    has_base: group.base.is_some(),
                },
            );
        }
    }

    if let Some(steam_root) = detect_steam_root() {
        for game in &games {
            if game.provider != GameProvider::Steam {
                continue;
            }

            let LaunchConfiguration::Steam { app_id } = &game.launch_config else {
                continue;
            };

            let Some(mut summary) = steam_content_for_app(&steam_root, app_id) else {
                continue;
            };

            summary.game_id = game.id.clone();
            summaries.insert(game.id.clone(), summary);
        }
    }

    let mut summaries: Vec<GameContentSummary> = summaries.into_values().collect();
    summaries.sort_by(|a, b| a.game_id.cmp(&b.game_id));

    Ok(HomeContentInventory { summaries })
}

fn format_switch_version(raw: String) -> String {
    if raw.starts_with('v') || raw.starts_with('V') {
        raw
    } else {
        format!("v{raw}")
    }
}

fn version_sort_key(version: &Option<String>) -> u64 {
    version
        .as_ref()
        .and_then(|value| {
            value
                .trim_start_matches(['v', 'V'])
                .parse::<u64>()
                .ok()
        })
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_switch_versions_with_prefix() {
        assert_eq!(format_switch_version("327680".into()), "v327680");
        assert_eq!(format_switch_version("v0".into()), "v0");
    }
}
