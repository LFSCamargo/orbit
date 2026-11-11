use crate::services::theme_previews::{self, ThemePreview};
use tauri::{ipc::Channel, Manager};

static PREPARATION: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(1);

#[tauri::command]
pub async fn prepare_theme_previews(
    app: tauri::AppHandle,
    on_preview: Channel<ThemePreview>,
) -> Result<(), String> {
    let permit = PREPARATION
        .try_acquire()
        .map_err(|_| "Artwork preparation is already running")?;
    let root = app
        .path()
        .resource_dir()
        .map_err(|_| "App resources are unavailable")?
        .join("assets/bundled-themes");
    #[cfg(debug_assertions)]
    let root = if root.is_dir() {
        root
    } else {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("assets/bundled-themes")
    };
    let cache = crate::utils::paths::artwork_cache_dir().join("theme-previews");
    tauri::async_runtime::spawn_blocking(move || {
        let _permit = permit;
        theme_previews::prepare(&root, &cache, |preview| on_preview.send(preview).is_ok());
    })
    .await
    .map_err(|_| "Artwork preparation stopped".to_string())
}
