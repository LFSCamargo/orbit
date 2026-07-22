use serde::{Deserialize, Serialize};
use std::fs;
use tauri::command;

use crate::utils::paths::themes_dir;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeColors {
    pub canvas: String,
    pub surface: String,
    pub panel: String,
    pub foreground: String,
    pub muted: String,
    pub accent: String,
    pub focus: String,
    pub border: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeDefinition {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub fonts: Option<ThemeFonts>,
    pub colors: ThemeColors,
    pub radius: Option<String>,
    pub card_radius: Option<String>,
    pub blur: Option<String>,
    pub background_style: Option<String>,
    pub layout: Option<String>,
    pub motion: Option<ThemeMotion>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeFonts {
    pub display: Option<String>,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeMotion {
    pub duration: Option<String>,
    pub easing: Option<String>,
}

#[command]
pub fn themes_directory() -> Result<String, String> {
    let dir = themes_dir();
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

#[command]
pub fn list_custom_themes() -> Result<Vec<ThemeDefinition>, String> {
    let dir = themes_dir();
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;

    let mut themes = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|err| err.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        if let Ok(theme) = serde_json::from_str::<ThemeDefinition>(&content) {
            themes.push(theme);
        }
    }

    themes.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(themes)
}
