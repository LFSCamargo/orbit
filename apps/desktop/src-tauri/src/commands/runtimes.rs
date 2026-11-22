use crate::{
    runtimes::{
        self,
        components::{ComponentSpec, InstalledComponent},
        detection::{self, WineInstallation},
        homebrew::GptkFormula,
    },
    AppState,
};
use tauri::{ipc::Channel, AppHandle, Manager};

#[tauri::command]
pub async fn windows_compatibility() -> Result<runtimes::manager::CompatibilityStatus, String> {
    tauri::async_runtime::spawn_blocking(|| Ok(runtimes::manager::status(&runtimes::root())))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn install_windows_compatibility(
    app: AppHandle,
    on_progress: Channel<runtimes::manager::SetupProgress>,
) -> Result<WineInstallation, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let runtime = runtimes::manager::install(&runtimes::root(), |update| {
            let _ = on_progress.send(update);
        })
        .map_err(|e| format!("{e:#}"))?;
        app.state::<AppState>()
            .repo
            .set_setting("wine-runtime", &serde_json::json!(runtime.path))
            .map_err(|e| e.to_string())?;
        Ok(runtime)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// The installed Orbit Wine Play uses, and whether its base container is ready.
#[tauri::command]
pub async fn orbit_wine_status() -> Result<Option<runtimes::orbit_wine::OrbitWineStatus>, String> {
    tauri::async_runtime::spawn_blocking(|| runtimes::orbit_wine::status(&runtimes::root()))
        .await
        .map_err(|e| e.to_string())
}

/// Installs the newest published Orbit Wine and prepares its base container,
/// then makes it the default Wine.
#[tauri::command]
pub async fn install_orbit_wine(
    app: AppHandle,
    on_progress: Channel<runtimes::manager::SetupProgress>,
) -> Result<runtimes::orbit_wine::OrbitWineStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = runtimes::root();
        let release = runtimes::orbit_wine::latest_release().map_err(|e| format!("{e:#}"))?;
        runtimes::orbit_wine::install(&root, &release, |update| {
            let _ = on_progress.send(update);
        })
        .map_err(|e| format!("{e:#}"))?;
        let status = runtimes::orbit_wine::prepare_container(&root, |update| {
            let _ = on_progress.send(update);
        })
        .map_err(|e| format!("{e:#}"))?;
        app.state::<AppState>()
            .repo
            .set_setting("wine-runtime", &serde_json::json!(status.path))
            .map_err(|e| e.to_string())?;
        Ok(status)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn compatibility_catalog(
    force_refresh: bool,
) -> Result<runtimes::catalog::CompatibilityCatalog, String> {
    if !runtimes::manager::supported() {
        return Err("The compatibility catalog is only available on macOS".into());
    }
    Ok(runtimes::catalog::catalog(force_refresh).await)
}

#[tauri::command]
pub fn compatibility_settings(
    app: AppHandle,
) -> Result<runtimes::settings::CompatibilitySettings, String> {
    runtimes::settings::load_global(&app.state::<AppState>().repo).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub fn update_compatibility_settings(
    app: AppHandle,
    settings: runtimes::settings::CompatibilitySettings,
) -> Result<runtimes::settings::CompatibilitySettings, String> {
    runtimes::settings::save_global(&app.state::<AppState>().repo, &settings)
        .map_err(|e| format!("{e:#}"))?;
    runtimes::settings::load_global(&app.state::<AppState>().repo).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub async fn detect_runtimes(app: AppHandle) -> Result<Vec<WineInstallation>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let custom = app
            .state::<AppState>()
            .repo
            .get_setting("wine-runtime")
            .map_err(|e| e.to_string())?;
        Ok(detection::detect(custom.as_ref().and_then(|v| v.as_str())))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn register_wine_runtime(
    app: AppHandle,
    path: String,
) -> Result<WineInstallation, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let runtime =
            detection::probe(std::path::Path::new(&path)).map_err(|e| format!("{e:#}"))?;
        app.state::<AppState>()
            .repo
            .set_setting("wine-runtime", &serde_json::json!(runtime.path))
            .map_err(|e| e.to_string())?;
        Ok(runtime)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn install_component(
    _app: AppHandle,
    spec: ComponentSpec,
    on_progress: Channel<runtimes::manager::SetupProgress>,
) -> Result<InstalledComponent, String> {
    tauri::async_runtime::spawn_blocking(move || {
        runtimes::components::install(&runtimes::root(), spec, |update| {
            let _ = on_progress.send(update);
        })
        .map_err(|e| format!("{e:#}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn component_status() -> Result<Vec<InstalledComponent>, String> {
    Ok(runtimes::components::installed_components(&runtimes::root()))
}

#[tauri::command]
pub async fn install_gptk_via_homebrew(
    formula: GptkFormula,
    on_progress: Channel<String>,
) -> Result<InstalledComponent, String> {
    tauri::async_runtime::spawn_blocking(move || {
        runtimes::homebrew::install_gptk(&runtimes::root(), &formula, |update| {
            let _ = on_progress.send(update.into());
        })
        .map_err(|e| format!("{e:#}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn install_local_gptk_package(
    path: String,
    on_progress: Channel<runtimes::manager::SetupProgress>,
) -> Result<InstalledComponent, String> {
    tauri::async_runtime::spawn_blocking(move || {
        runtimes::gptk_local::import(&runtimes::root(), std::path::Path::new(&path), |update| {
            let _ = on_progress.send(update);
        })
        .map_err(|e| format!("{e:#}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn register_component_path(
    id: String,
    version: String,
    path: String,
) -> Result<InstalledComponent, String> {
    tauri::async_runtime::spawn_blocking(move || {
        runtimes::components::register(
            &runtimes::root(),
            id,
            version,
            std::path::PathBuf::from(path),
        )
        .map_err(|e| format!("{e:#}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn active_components(
    app: AppHandle,
) -> Result<runtimes::selections::ActiveComponents, String> {
    let actives = tauri::async_runtime::spawn_blocking(move || {
        runtimes::selections::load(&app.state::<AppState>().repo).map_err(|e| format!("{e:#}"))
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(actives)
}

#[tauri::command]
pub async fn component_views(
    app: AppHandle,
) -> Result<runtimes::selections::ComponentViews, String> {
    tauri::async_runtime::spawn_blocking(move || {
        runtimes::selections::load_views(&app.state::<AppState>().repo)
            .map_err(|e| format!("{e:#}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_component_view(
    app: AppHandle,
    group: String,
    key: String,
) -> Result<runtimes::selections::ComponentViews, String> {
    tauri::async_runtime::spawn_blocking(move || {
        runtimes::selections::set_view(&app.state::<AppState>().repo, &group, &key)
            .map_err(|e| format!("{e:#}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_active_component(
    app: AppHandle,
    component: String,
    version: String,
) -> Result<runtimes::selections::ActiveComponents, String> {
    tauri::async_runtime::spawn_blocking(move || {
        runtimes::selections::set_active(
            &app.state::<AppState>().repo,
            &runtimes::root(),
            &component,
            &version,
        )
        .map_err(|e| format!("{e:#}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn runtime_diagnostics(app: AppHandle, game_id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if app
            .state::<AppState>()
            .repo
            .get_game(&game_id)
            .map_err(|e| e.to_string())?
            .is_none()
        {
            return Err("Game not found".into());
        }
        let dir = runtimes::prefix::game_directory(&runtimes::root(), &game_id)
            .map_err(|e| e.to_string())?;
        let path = dir.join("latest.log");
        if path
            .symlink_metadata()
            .is_ok_and(|m| m.file_type().is_symlink())
        {
            return Err("Invalid diagnostic path".into());
        }
        use std::io::{Read, Seek, SeekFrom};
        let Ok(mut file) = std::fs::File::open(path) else {
            return Ok("No runtime log yet. Launch this game to capture diagnostics.".into());
        };
        let len = file.metadata().map_err(|e| e.to_string())?.len();
        file.seek(SeekFrom::Start(len.saturating_sub(32768)))
            .map_err(|e| e.to_string())?;
        let mut bytes = Vec::new();
        file.take(32768)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        Ok(String::from_utf8_lossy(&bytes).into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}
