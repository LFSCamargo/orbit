use std::fs;
use tauri::command;

use crate::models::ThemeDefinition;
use crate::services::theme_files;
use crate::utils::paths::themes_dir;

#[command]
pub async fn themes_directory() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let dir = themes_dir();
        fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
        Ok(dir.to_string_lossy().to_string())
    })
    .await
    .map_err(|_| "Theme directory lookup stopped".to_string())?
}

#[command]
pub async fn list_custom_themes(
) -> Result<Vec<crate::services::theme_catalog::CatalogTheme>, String> {
    crate::services::theme_catalog::load_catalog(
        themes_dir(),
        crate::utils::paths::artwork_cache_dir().join("theme-catalog"),
    )
    .await
}

#[command]
pub async fn save_custom_theme(theme: ThemeDefinition) -> Result<ThemeDefinition, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let theme = crate::services::theme_image_optimization::optimize_custom(theme)?;
        theme_files::save_theme(&themes_dir(), theme)
    })
    .await
    .map_err(|_| "Theme image optimization stopped".to_string())?
}

#[command]
pub fn delete_custom_theme(id: String) -> Result<(), String> {
    theme_files::delete_theme(&themes_dir(), &id)
}

#[command]
pub async fn search_theme_artwork(
    state: tauri::State<'_, crate::AppState>,
    query: String,
    slot: String,
) -> Result<Vec<crate::services::theme_artwork::ThemeArtworkHit>, String> {
    let key = crate::utils::api_keys::steamgriddb_api_key(&state.repo)
        .ok_or("Add your SteamGridDB API key in Settings to load theme artwork")?;
    crate::services::theme_artwork::search(&key, &query, &slot).await
}

#[command]
pub async fn fetch_theme_artwork(url: String, slot: String) -> Result<String, String> {
    crate::services::theme_artwork::download(&url, &slot).await
}

/// Return a local file path for bundled built-in theme artwork, if it exists.
/// The frontend converts this path to an asset:// URL for rendering.
#[command]
pub fn bundled_theme_artwork(
    app: tauri::AppHandle,
    theme_id: String,
    slot: String,
) -> Result<Option<String>, String> {
    crate::services::bundled_themes::bundled_theme_artwork(&app, &theme_id, &slot)
}
