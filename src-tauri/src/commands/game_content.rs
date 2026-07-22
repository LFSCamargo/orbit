use tauri::State;

use crate::models::HomeContentInventory;
use crate::services::game_content::build_home_content_inventory;
use crate::AppState;

#[tauri::command]
pub async fn get_home_content_inventory(
    state: State<'_, AppState>,
) -> Result<HomeContentInventory, String> {
    build_home_content_inventory(&state.repo)
}
