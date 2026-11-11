use crate::services::glass_material::{self, GlassMaterial};

#[tauri::command]
pub async fn get_glass_material() -> Result<GlassMaterial, String> {
    tauri::async_runtime::spawn_blocking(glass_material::material)
        .await
        .map_err(|_| "Glass material preparation stopped".to_string())?
}
