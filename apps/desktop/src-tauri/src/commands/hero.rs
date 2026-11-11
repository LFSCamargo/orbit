use crate::{services::hero_lighting, AppState};

static SAMPLE_JOB: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(1);

#[tauri::command]
pub async fn get_hero_lighting(
    state: tauri::State<'_, AppState>,
    game_id: String,
    slot: String,
) -> Result<Option<[u8; 3]>, String> {
    if game_id.len() > 80 || !matches!(slot.as_str(), "hero" | "cover") {
        return Err("Invalid artwork selection".into());
    }
    let Ok(permit) = SAMPLE_JOB.try_acquire() else {
        return Ok(None);
    };
    let repo = state.repo.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        let game = repo.get_game(&game_id).ok().flatten()?;
        let reference = match slot.as_str() {
            "hero" => game.artwork.hero,
            _ => game.artwork.cover,
        }?;
        hero_lighting::sample(&reference)
    })
    .await
    .map_err(|_| "Could not sample hero lighting".into())
}
