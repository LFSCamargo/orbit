use base64::{engine::general_purpose::STANDARD, Engine as _};
use tauri::State;

use crate::services::public_artwork::{self, ArtworkSearchHit};
use crate::AppState;

#[tauri::command]
pub async fn read_artwork_from_path(path: String) -> Result<String, String> {
    let path_buf = std::path::PathBuf::from(&path);
    if path_buf.is_dir() {
        return Err(format!(
            "Expected an image file, but this path is a directory: {path}"
        ));
    }
    if !path_buf.is_file() {
        return Err(format!("Image file not found: {path}"));
    }
    let bytes = std::fs::read(&path_buf).map_err(|err| err.to_string())?;
    let mime = mime_from_path(&path);
    Ok(to_data_url(&bytes, &mime))
}

#[tauri::command]
pub async fn fetch_artwork_from_url(url: String) -> Result<String, String> {
    public_artwork::fetch_artwork_from_url(&url).await
}

#[tauri::command]
pub async fn search_public_artwork(
    state: State<'_, AppState>,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<ArtworkSearchHit>, String> {
    let rawg_key = rawg_api_key(&state).ok();
    public_artwork::search_public_artwork(rawg_key.as_deref(), &query, limit).await
}

fn to_data_url(bytes: &[u8], mime: &str) -> String {
    format!("data:{mime};base64,{}", STANDARD.encode(bytes))
}

fn mime_from_path(path: &str) -> String {
    let lower = path.to_lowercase();
    if lower.ends_with(".png") {
        "image/png".into()
    } else if lower.ends_with(".webp") {
        "image/webp".into()
    } else if lower.ends_with(".gif") {
        "image/gif".into()
    } else {
        "image/jpeg".into()
    }
}

fn rawg_api_key(state: &State<'_, AppState>) -> Result<String, String> {
    state
        .repo
        .get_setting("rawgApiKey")
        .map_err(|err| err.to_string())?
        .and_then(|value| value.as_str().map(|s| s.to_string()))
        .filter(|key| !key.trim().is_empty())
        .ok_or_else(|| "RAWG API key not configured".into())
}
