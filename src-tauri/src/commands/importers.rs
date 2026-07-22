use serde::Serialize;
use std::path::PathBuf;
use tauri::State;

use crate::importers::{
    import_manual_path, AstrisImporter, GameHubImporter, GameImporter, NativeAppImporter,
    SteamImporter,
};
use crate::services::LibrarySyncService;
use crate::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImporterStatus {
    pub id: String,
    pub detected: bool,
    pub label: String,
    pub experimental: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub imported: usize,
    pub provider: String,
}

#[tauri::command]
pub async fn detect_importers() -> Result<Vec<ImporterStatus>, String> {
    let steam = SteamImporter::new(None);
    let native = NativeAppImporter::new();
    let gamehub = GameHubImporter::new();
    let astris = AstrisImporter::new(Vec::new());

    Ok(vec![
        ImporterStatus {
            id: "astris".into(),
            detected: astris.detect().await.unwrap_or(false),
            label: "Nintendo Switch (Astris)".into(),
            experimental: false,
        },
        ImporterStatus {
            id: "steam".into(),
            detected: steam.detect().await.unwrap_or(false),
            label: "Steam".into(),
            experimental: false,
        },
        ImporterStatus {
            id: "native".into(),
            detected: native.detect().await.unwrap_or(false),
            label: "macOS Applications".into(),
            experimental: false,
        },
        ImporterStatus {
            id: "gamehub".into(),
            detected: gamehub.detect().await.unwrap_or(false),
            label: "GameHub".into(),
            experimental: true,
        },
    ])
}

#[tauri::command]
pub async fn scan_steam_library(state: State<'_, AppState>) -> Result<ScanResult, String> {
    let importer = SteamImporter::new(None);
    let games = importer
        .discover_games()
        .await
        .map_err(|err| err.to_string())?;
    let imported = LibrarySyncService::upsert_imported(&state.repo, &games)
        .map_err(|err| err.to_string())?;
    Ok(ScanResult {
        imported,
        provider: "steam".into(),
    })
}

#[tauri::command]
pub async fn scan_astris_folder(
    state: State<'_, AppState>,
    folder: String,
) -> Result<ScanResult, String> {
    let importer = AstrisImporter::new(vec![PathBuf::from(folder)]);
    let games = importer
        .discover_games()
        .await
        .map_err(|err| err.to_string())?;
    let imported = LibrarySyncService::upsert_imported(&state.repo, &games)
        .map_err(|err| err.to_string())?;
    Ok(ScanResult {
        imported,
        provider: "astris".into(),
    })
}

#[tauri::command]
pub async fn scan_native_apps(state: State<'_, AppState>) -> Result<ScanResult, String> {
    let importer = NativeAppImporter::new();
    let games = importer
        .discover_games()
        .await
        .map_err(|err| err.to_string())?;
    let imported = LibrarySyncService::upsert_imported(&state.repo, &games)
        .map_err(|err| err.to_string())?;
    Ok(ScanResult {
        imported,
        provider: "native".into(),
    })
}

#[tauri::command]
pub async fn scan_gamehub_folder(
    state: State<'_, AppState>,
    folder: Option<String>,
) -> Result<ScanResult, String> {
    let folders = folder
        .map(|f| vec![PathBuf::from(f)])
        .unwrap_or_default();
    let importer = GameHubImporter::new().with_folders(folders);
    let games = importer
        .discover_games()
        .await
        .map_err(|err| err.to_string())?;
    let imported = LibrarySyncService::upsert_imported(&state.repo, &games)
        .map_err(|err| err.to_string())?;
    Ok(ScanResult {
        imported,
        provider: "gamehub".into(),
    })
}

#[tauri::command]
pub async fn import_game_path(
    state: State<'_, AppState>,
    path: String,
) -> Result<ScanResult, String> {
    let game = import_manual_path(PathBuf::from(path).as_path()).map_err(|err| err.to_string())?;
    let imported = LibrarySyncService::upsert_imported(&state.repo, &[game])
        .map_err(|err| err.to_string())?;
    Ok(ScanResult {
        imported,
        provider: "manual".into(),
    })
}
