//! Read-only GameHub cache adapter. Never edits its queues, credentials, or containers.
use crate::importers::gamehub::detect_gamehub;
use serde::Serialize;
use serde_json::Value;
use std::{collections::BTreeMap, fs, path::Path, process::Command};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameHubEntry {
    pub id: String,
    pub store: String,
    pub title: String,
    pub installed: bool,
    pub phase: Option<String>,
    pub percent: Option<f64>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameHubLibrary {
    pub available: bool,
    pub running: bool,
    pub games: Vec<GameHubEntry>,
    pub warnings: Vec<String>,
    pub captured_at: String,
    pub direct_install_supported: bool,
}
fn text<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value
        .get(key)?
        .as_str()
        .map(str::trim)
        .filter(|v| !v.is_empty())
}
fn store(value: &str) -> Option<&'static str> {
    match value.to_ascii_lowercase().as_str() {
        "steam" => Some("steam"),
        "epic" => Some("epic"),
        "gog" => Some("gog"),
        _ => None,
    }
}
fn read_json(path: &Path) -> Result<Option<Value>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let metadata = fs::metadata(path).map_err(|_| "Could not read GameHub cache")?;
    if metadata.len() > 16 * 1024 * 1024 {
        return Err("GameHub cache exceeds the supported size".into());
    }
    let bytes = fs::read(path).map_err(|_| "Could not read GameHub cache")?;
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|_| "GameHub cache is updating or has an unsupported format".into())
}
fn phase(value: &str) -> &str {
    match value {
        "queued" | "preparing" | "downloading" | "installing" | "verifying" | "paused"
        | "completed" | "failed" | "cancelled" => value,
        _ => "pending",
    }
}
pub fn read_from(root: &Path, available: bool, running: bool) -> GameHubLibrary {
    let mut games = BTreeMap::new();
    let mut warnings = vec![];
    match read_json(&root.join("gamehub/game_container_store.json")) {
        Ok(Some(value)) => {
            if let Some(bindings) = value.get("bindings").and_then(Value::as_array) {
                for binding in bindings {
                    let (Some(provider), Some(app_id), Some(title)) = (
                        text(binding, "platform").and_then(store),
                        text(binding, "platform_app_id"),
                        text(binding, "game_name"),
                    ) else {
                        continue;
                    };
                    let id = format!("{provider}:{app_id}");
                    games.insert(
                        id.clone(),
                        GameHubEntry {
                            id,
                            store: provider.into(),
                            title: title.into(),
                            installed: text(binding, "game_path")
                                .is_some_and(|path| Path::new(path).is_dir()),
                            phase: None,
                            percent: None,
                        },
                    );
                }
            } else {
                warnings.push("GameHub's local game cache has an unsupported format.".into());
            }
        }
        Ok(None) => {}
        Err(error) => warnings.push(error),
    }
    match read_json(&root.join("downloads/queue-v1.json")) {
        Ok(Some(value)) => {
            if let Some(tasks) = value.get("tasks").and_then(Value::as_array) {
                for task in tasks {
                    let (Some(provider), Some(app_id), Some(title)) = (
                        text(task, "provider").and_then(store),
                        text(task, "provider_game_id"),
                        text(task, "title"),
                    ) else {
                        continue;
                    };
                    let id = format!("{provider}:{app_id}");
                    let entry = games.entry(id.clone()).or_insert(GameHubEntry {
                        id,
                        store: provider.into(),
                        title: title.into(),
                        installed: false,
                        phase: None,
                        percent: None,
                    });
                    entry.phase = text(task, "phase").map(|v| phase(v).to_string());
                    entry.percent = task
                        .pointer("/progress/overall_percent")
                        .and_then(Value::as_f64)
                        .filter(|v| v.is_finite())
                        .map(|v| v.clamp(0., 100.));
                }
            } else {
                warnings.push("GameHub's download cache has an unsupported format.".into());
            }
        }
        Ok(None) => {}
        Err(error) => warnings.push(error),
    }
    GameHubLibrary {
        available,
        running,
        games: games.into_values().collect(),
        warnings,
        captured_at: chrono::Utc::now().to_rfc3339(),
        direct_install_supported: false,
    }
}
pub fn snapshot() -> Result<GameHubLibrary, String> {
    let root = dirs::home_dir()
        .ok_or("Home directory unavailable")?
        .join("Library/Application Support/com.gamemac.www");
    let running = Command::new("pgrep")
        .args(["-x", "GameHub"])
        .output()
        .is_ok_and(|result| result.status.success());
    Ok(read_from(&root, detect_gamehub().is_some(), running))
}
pub fn open(foreground: bool) -> Result<(), String> {
    if !cfg!(target_os = "macos") {
        return Err("GameHub integration is available on macOS".into());
    }
    let app = detect_gamehub().ok_or("Install GameHub.app in Applications first")?;
    let mut cmd = Command::new("open");
    if !foreground {
        cmd.args(["-g", "-j"]);
    }
    let status = cmd
        .arg("-a")
        .arg(app)
        .status()
        .map_err(|_| "Could not start GameHub")?;
    if !status.success() {
        return Err("GameHub could not be opened".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn projects_only_library_fields_and_never_leaks_queue_authorization() {
        let root = std::env::temp_dir().join(format!("orbit-gamehub-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("downloads")).unwrap();
        fs::create_dir_all(root.join("gamehub")).unwrap();
        fs::write(root.join("downloads/queue-v1.json"),r#"{"tasks":[{"provider":"steam","provider_game_id":"620","title":"Portal 2","phase":"downloading","progress":{"overall_percent":42.5},"steam_access_authorization":{"token":"DO_NOT_EXPOSE"}}]}"#).unwrap();
        let result = read_from(&root, true, true);
        assert_eq!(result.games.len(), 1);
        assert_eq!(result.games[0].percent, Some(42.5));
        assert!(!serde_json::to_string(&result)
            .unwrap()
            .contains("DO_NOT_EXPOSE"));
        assert!(!result.direct_install_supported);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn missing_and_malformed_cache_are_honest_empty_states() {
        let root = std::env::temp_dir().join(format!("orbit-gamehub-{}", uuid::Uuid::new_v4()));
        assert!(read_from(&root, false, false).games.is_empty());
        fs::create_dir_all(root.join("downloads")).unwrap();
        fs::write(root.join("downloads/queue-v1.json"), "not json").unwrap();
        assert_eq!(read_from(&root, true, false).warnings.len(), 1);
        fs::remove_dir_all(root).unwrap();
    }
}
