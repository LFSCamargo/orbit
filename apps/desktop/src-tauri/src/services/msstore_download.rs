//! Streaming MSIXVC download and local installation service for Microsoft Store / PC Game Pass.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU8, AtomicU64, Ordering};

use orbit_msstore::catalog::{acquire_content_license, fetch_base_package, MsStoreCatalogEntry};
use orbit_msstore::manifest::{safe_join_under, MicrosoftGameConfig};
use orbit_msstore::msixvc::{
    extract_streaming, HttpRangeReader, PackageFileEntry, RangeReader, PAGE_SIZE,
};
use orbit_msstore::{valid_product_id, MsStoreError};
use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::database::{GameRepository, MetadataCacheRepository};
use crate::models::{
    GameArtwork, GamePlatform, GameProvider, ImportedGame, LaunchConfiguration,
};
use crate::runtimes::WineProfile;
use crate::services::install_locations;
use crate::services::msstore_auth;
use crate::services::msstore_catalog;
use crate::services::steam_windows::DownloadOutcome;
use crate::services::xcloud_library;

pub const PROGRESS_EVENT: &str = "msstore-download-progress";

const SIGNAL_NONE: u8 = 0;
const SIGNAL_CANCEL: u8 = 1;
const SIGNAL_PAUSE: u8 = 2;
const SIGNAL_OFFLINE: u8 = 3;

static CANCEL_FLAG: AtomicBool = AtomicBool::new(false);
static SIGNAL: AtomicU8 = AtomicU8::new(SIGNAL_NONE);
static LAST_TOTAL: AtomicU64 = AtomicU64::new(0);

pub fn cancel_download() {
    SIGNAL.store(SIGNAL_CANCEL, Ordering::SeqCst);
    CANCEL_FLAG.store(true, Ordering::SeqCst);
}

pub fn pause_download() {
    SIGNAL.store(SIGNAL_PAUSE, Ordering::SeqCst);
    CANCEL_FLAG.store(true, Ordering::SeqCst);
}

pub fn stop_for_network() {
    SIGNAL.store(SIGNAL_OFFLINE, Ordering::SeqCst);
    CANCEL_FLAG.store(true, Ordering::SeqCst);
}

pub fn last_download_total() -> Option<i64> {
    let val = LAST_TOTAL.load(Ordering::SeqCst);
    (val > 0).then(|| i64::try_from(val).unwrap_or(i64::MAX))
}

/// Resolves the managed install folder for a Microsoft Store product.
/// On "This Mac": `<runtimes>/containers/games/msstore-<productId>/install`.
/// On an external install location: `<root>/Orbit Games/msstore/<productId>`.
pub fn install_dir_for(
    runtimes_root: &Path,
    product_id: &str,
    external_library: Option<&Path>,
) -> Result<PathBuf, String> {
    if !valid_product_id(product_id) {
        return Err("Microsoft Store product id must be 12 alphanumeric characters".into());
    }
    let normalized = product_id.to_ascii_uppercase();
    if let Some(lib) = external_library {
        Ok(lib.join("msstore").join(normalized))
    } else {
        Ok(crate::runtimes::containers::root_in(runtimes_root)
            .join("games")
            .join(format!("msstore-{}", normalized.to_ascii_lowercase()))
            .join("install"))
    }
}

/// Executes one streaming Microsoft Store download & install, emitting `msstore-download-progress`.
pub fn download(
    app: &AppHandle,
    repo: &GameRepository,
    cache: &MetadataCacheRepository,
    session_dir: &Path,
    product_id: &str,
    title: &str,
) -> Result<DownloadOutcome, String> {
    if !valid_product_id(product_id) {
        return Err("Microsoft Store product id must be 12 alphanumeric characters".into());
    }
    CANCEL_FLAG.store(false, Ordering::SeqCst);
    SIGNAL.store(SIGNAL_NONE, Ordering::SeqCst);
    LAST_TOTAL.store(0, Ordering::SeqCst);

    let pid = product_id.to_ascii_uppercase();
    let key = msstore_catalog::stable_key(&pid);
    emit_progress(app, &key, title, "Resolving package...", 0, 0, false, false, None);

    let market = xcloud_library::market(repo);
    let entry = cache
        .msstore_catalog_entry(&market.language, &pid)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Refresh the Microsoft Store catalog before installing this title".to_string())?;
    let content_id = entry
        .content_id
        .as_deref()
        .ok_or_else(|| "This Microsoft Store title does not expose a Windows GDK package".to_string())?;

    let xsts = msstore_auth::xsts_update_auth_header(session_dir)?;
    let package = fetch_base_package(content_id, &xsts).map_err(|e| e.to_string())?;
    if package.package_format != "msixvc" {
        return Err(format!(
            "Package format {} is not yet supported by Orbit's streaming installer",
            package.package_format
        ));
    }

    let device_token = msstore_auth::device_ms_token(session_dir)?;
    let user_token =
        msstore_auth::exchange_user_token(session_dir, "www.microsoft.com", "MBI_SSL")?;
    let hw_id = msstore_auth::hardware_id_b64(session_dir)?;
    let dev_key = msstore_auth::device_key(session_dir)?;
    let license = acquire_content_license(content_id, &device_token, &user_token, &hw_id)
        .map_err(|e| e.to_string())?;
    let keys = license
        .unpack_content_keys(&dev_key)
        .map_err(|e| e.to_string())?;
    let cik = keys
        .into_iter()
        .next()
        .map(|(_, k)| k)
        .ok_or_else(|| "This Microsoft account does not hold a valid content license".to_string())?;

    let external_lib = install_locations::library_for_msstore(&pid);
    let install_dir = install_dir_for(&crate::runtimes::root(), &pid, external_lib.as_deref())?;
    let url = package
        .download_urls
        .first()
        .ok_or_else(|| "No Microsoft CDN URL available for this package".to_string())?;

    let mut reader = HttpRangeReader::new(url).map_err(|e| e.to_string())?;
    let mut header_page = [0u8; PAGE_SIZE];
    reader
        .read_exact_at(0, &mut header_page)
        .map_err(|e| e.to_string())?;

    // Check cancellation after network preflight.
    if let Some(outcome) = current_stop_outcome() {
        return Ok(outcome);
    }

    let file_entries: Vec<PackageFileEntry> = Vec::new();
    let total_size = package.file_size;
    LAST_TOTAL.store(total_size, Ordering::SeqCst);

    let extract_res = extract_streaming(
        &mut reader,
        &header_page,
        content_id,
        &file_entries,
        &cik,
        &install_dir,
        &CANCEL_FLAG,
        |prog| {
            emit_progress(
                app,
                &key,
                title,
                "Downloading & installing...",
                prog.bytes_written,
                prog.total_bytes.max(total_size),
                false,
                false,
                None,
            );
        },
    );

    match extract_res {
        Ok(_) => {
            register_installed_game(repo, &entry, &install_dir, total_size)?;
            emit_progress(app, &key, title, "Installed", total_size, total_size, true, false, None);
            Ok(DownloadOutcome::Completed)
        }
        Err(MsStoreError::Cancelled) => {
            Ok(current_stop_outcome().unwrap_or(DownloadOutcome::Cancelled))
        }
        Err(err) => Err(err.to_string()),
    }
}

fn current_stop_outcome() -> Option<DownloadOutcome> {
    match SIGNAL.load(Ordering::SeqCst) {
        SIGNAL_PAUSE => Some(DownloadOutcome::Paused),
        SIGNAL_OFFLINE => Some(DownloadOutcome::Offline),
        SIGNAL_CANCEL => Some(DownloadOutcome::Cancelled),
        _ => None,
    }
}

/// Parses `MicrosoftGame.config` inside `install_dir` and upserts the installed
/// Microsoft Store game in Orbit's SQLite `GameRepository`.
pub fn register_installed_game(
    repo: &GameRepository,
    entry: &MsStoreCatalogEntry,
    install_dir: &Path,
    install_size_bytes: u64,
) -> Result<String, String> {
    let config_path = install_dir.join("MicrosoftGame.config");
    let config = MicrosoftGameConfig::from_file(&config_path)
        .map_err(|e| format!("Could not read MicrosoftGame.config: {e}"))?;
    let primary = config
        .primary_executable()
        .ok_or_else(|| "MicrosoftGame.config lists no Windows executable".to_string())?;
    let exe_path = safe_join_under(install_dir, &primary.relative_path)
        .map_err(|e| format!("Invalid executable path in MicrosoftGame.config: {e}"))?;

    let title = config
        .display_name
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| entry.title.clone());
    let wine_path = crate::services::steam_windows::play_wine_binary(repo)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();

    let imported = ImportedGame {
        stable_key: msstore_catalog::stable_key(&entry.product_id),
        sort_title: title.to_lowercase(),
        title,
        description: entry.description.clone(),
        provider: GameProvider::MsStore,
        platform: GamePlatform::Windows,
        source_id: Some(entry.product_id.to_ascii_uppercase()),
        launch_config: LaunchConfiguration::Wine {
            profile: WineProfile {
                executable: exe_path.to_string_lossy().into_owned(),
                runtime_path: wine_path,
                ..WineProfile::default()
            },
        },
        artwork: GameArtwork {
            cover: entry.cover_url.clone(),
            hero: entry.hero_url.clone(),
            logo: entry.logo_url.clone(),
            icon: entry.square_url.clone(),
        },
        total_playtime_seconds: 0,
        install_size_bytes: i64::try_from(install_size_bytes).ok(),
        achievements: vec![],
    };

    let res = repo
        .upsert_imported(&[imported])
        .map_err(|e| e.to_string())?;
    res.game_ids
        .into_iter()
        .next()
        .ok_or_else(|| "Installed Microsoft Store game could not be saved".to_string())
}

#[allow(clippy::too_many_arguments)]
fn emit_progress(
    app: &AppHandle,
    key: &str,
    label: &str,
    stage: &str,
    downloaded: u64,
    total: u64,
    done: bool,
    stopped: bool,
    error: Option<&str>,
) {
    let percent = if total > 0 {
        ((downloaded as f64 / total as f64) * 100.0).min(100.0)
    } else if done && !stopped && error.is_none() {
        100.0
    } else {
        0.0
    };
    let _ = app.emit(
        PROGRESS_EVENT,
        json!({
            "key": key,
            "label": label,
            "stage": stage,
            "downloadedBytes": downloaded,
            "totalBytes": total,
            "percent": percent,
            "done": done,
            "stopped": stopped,
            "error": error,
        }),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn computes_managed_install_dirs_for_internal_and_external_volumes() {
        let runtimes = Path::new("/Orbit/runtimes");
        assert_eq!(
            install_dir_for(runtimes, "9P8LR42PTRGJ", None).unwrap(),
            PathBuf::from("/Orbit/runtimes/containers/games/msstore-9p8lr42ptrgj/install")
        );
        assert_eq!(
            install_dir_for(
                runtimes,
                "9P8LR42PTRGJ",
                Some(Path::new("/Volumes/SSD/Orbit Games"))
            )
            .unwrap(),
            PathBuf::from("/Volumes/SSD/Orbit Games/msstore/9P8LR42PTRGJ")
        );
        assert!(install_dir_for(runtimes, "../escape", None).is_err());
    }

    #[test]
    fn registers_installed_msstore_game_from_microsoft_game_config() {
        let dir = std::env::temp_dir().join(format!("orbit-msreg-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join("Binaries")).unwrap();
        std::fs::write(dir.join("Binaries/Game.exe"), b"ENCRYPTED_CIPHERTEXT").unwrap();
        std::fs::write(
            dir.join("MicrosoftGame.config"),
            r#"<Game><ShellVisuals DefaultDisplayName="33 Immortals"/><ExecutableList><Executable Name="Binaries\Game.exe" TargetDeviceFamily="PC"/></ExecutableList></Game>"#,
        )
        .unwrap();

        let repo = GameRepository::open_in_memory().unwrap();
        let entry = MsStoreCatalogEntry {
            product_id: "9P8LR42PTRGJ".into(),
            title: "33 Immortals".into(),
            description: Some("Co-op action roguelike".into()),
            content_id: Some("11111111-2222-3333-4444-555555555555".into()),
            package_family_name: None,
            xbox_title_id: None,
            install_size_bytes: Some(4096),
            cover_url: Some("https://store-images.s-microsoft.com/poster".into()),
            square_url: None,
            hero_url: None,
            logo_url: None,
            owned: true,
            game_pass_pc: true,
        };
        let game_id = register_installed_game(&repo, &entry, &dir, 4096).unwrap();
        let saved = repo.get_game(&game_id).unwrap().unwrap();
        assert_eq!(saved.provider, GameProvider::MsStore);
        assert_eq!(saved.platform, GamePlatform::Windows);
        assert_eq!(saved.source_id.as_deref(), Some("9P8LR42PTRGJ"));
        let LaunchConfiguration::Wine { profile } = saved.launch_config else {
            panic!("expected Wine config");
        };
        assert!(profile.executable.ends_with("Binaries/Game.exe"));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
