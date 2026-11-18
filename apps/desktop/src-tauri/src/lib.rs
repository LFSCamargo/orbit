#![allow(dead_code)]

mod commands;
mod database;
mod importers;
mod launching;
mod models;
pub mod platform;
mod runtimes;
mod services;
mod utils;

use std::sync::Arc;

use parking_lot::Mutex;

use tauri::{Manager, RunEvent};

use database::{GameRepository, MetadataCacheRepository};
use launching::SessionManager;
use services::steam_login;
use utils::api_keys::init_env;
use utils::paths::{database_path, metadata_cache_path};

pub struct AppState {
    pub repo: Arc<GameRepository>,
    pub metadata_cache: Arc<MetadataCacheRepository>,
    pub sessions: Arc<SessionManager>,
    pub steam_login: Mutex<steam_login::SteamLoginSession>,
    pub steam_catalog_job: Arc<std::sync::atomic::AtomicBool>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_env();
    let db_path = database_path();
    let repo = Arc::new(GameRepository::open(&db_path).expect("Failed to open Orbit database"));
    runtimes::retired_components::remove_in(&runtimes::root(), &repo);
    let metadata_cache = Arc::new(
        MetadataCacheRepository::open(&metadata_cache_path())
            .expect("Failed to open metadata cache database"),
    );
    let sessions = Arc::new(SessionManager::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            platform::macos::start_controller_home(app.handle().clone());
            services::download_queue::restore(&app.state::<AppState>().repo);
            Ok(())
        })
        .manage(AppState {
            repo,
            metadata_cache,
            sessions,
            steam_login: Mutex::new(steam_login::SteamLoginSession::new()),
            steam_catalog_job: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        })
        .invoke_handler(tauri::generate_handler![
            commands::runtimes::windows_compatibility,
            commands::runtimes::compatibility_catalog,
            commands::runtimes::compatibility_settings,
            commands::runtimes::update_compatibility_settings,
            commands::runtimes::install_windows_compatibility,
            commands::runtimes::install_component,
            commands::runtimes::component_status,
            commands::runtimes::install_gptk_via_homebrew,
            commands::runtimes::install_local_gptk_package,
            commands::runtimes::register_component_path,
            commands::runtimes::active_components,
            commands::runtimes::set_active_component,
            commands::runtimes::component_views,
            commands::runtimes::set_component_view,
            commands::runtimes::detect_runtimes,
            commands::runtimes::register_wine_runtime,
            commands::runtimes::runtime_diagnostics,
            commands::session::cancel_game_launch,
            commands::library::list_library_entries,
            commands::library::get_library_entry,
            commands::library::update_library_entry,
            commands::library::delete_library_entry,
            commands::games::list_games,
            commands::games::get_game,
            commands::hero::get_hero_lighting,
            commands::glass::get_glass_material,
            commands::games::create_game,
            commands::games::update_game,
            commands::games::toggle_favorite,
            commands::games::set_game_hidden,
            commands::games::delete_game,
            commands::games::clear_library,
            commands::games::get_setting,
            commands::games::set_setting,
            commands::dialog::pick_open_path,
            commands::dialog::reveal_path,
            commands::session::launch_game,
            commands::session::stop_game,
            commands::session::get_active_session,
            commands::window::set_window_fullscreen,
            commands::window::hide_orbit_window,
            commands::window::show_orbit_window,
            commands::window::quit_orbit,
            commands::importers::detect_importers,
            commands::steam::open_steam_library,
            commands::steam::install_steam_game,
            commands::steam_windows::steam_windows_status,
            commands::steam_windows::steam_windows_preferences,
            commands::steam_windows::set_steam_windows_preferences,
            commands::steam_windows::steam_windows_library,
            commands::steam_windows::begin_steam_windows_password,
            commands::steam_windows::submit_steam_windows_guard,
            commands::steam_windows::open_steam_windows_login,
            commands::steam_windows::place_steam_windows_login,
            commands::steam_windows::poll_steam_windows_login,
            commands::steam_windows::start_steam_windows_qr,
            commands::steam_windows::poll_steam_windows_qr,
            commands::steam_windows::connect_steam_windows,
            commands::steam_windows::install_windows_steam,
            commands::steam_windows::cancel_steam_windows_sign_in,
            commands::steam_windows::disconnect_steam_windows,
            commands::steam_windows::refresh_steam_windows_library,
            commands::steam_windows::retry_steam_catalog_metadata,
            commands::steam_windows::download_steam_windows_game,
            commands::steam_windows::cancel_steam_windows_download,
            commands::downloads::enqueue_steam_download,
            commands::downloads::get_download_queue,
            commands::downloads::remove_queued_download,
            commands::downloads::start_queued_download_now,
            commands::downloads::pause_active_download,
            commands::steam_windows::play_steam_windows_game,
            commands::importers::scan_steam_library,
            commands::importers::scan_astris_folder,
            commands::importers::scan_native_apps,
            commands::importers::scan_steam_installations,
            commands::importers::import_game_path,
            commands::switch_library::scan_switch_library_folder,
            commands::switch_library::scan_switch_library_from_library,
            commands::game_content::get_home_content_inventory,
            commands::themes::list_custom_themes,
            commands::themes::search_theme_artwork,
            commands::themes::fetch_theme_artwork,
            commands::themes::bundled_theme_artwork,
            commands::theme_previews::prepare_theme_previews,
            commands::themes::themes_directory,
            commands::themes::save_custom_theme,
            commands::themes::delete_custom_theme,
            commands::artwork::read_artwork_from_path,
            commands::artwork::fetch_artwork_from_url,
            commands::artwork::cache_artwork_from_url,
            commands::artwork::search_public_artwork,
            commands::artwork::search_game_artwork,
            commands::metadata::enrich_game_metadata,
            commands::metadata::enrich_games_metadata,
            commands::metadata::get_metadata_cache_stats,
            commands::metadata::test_metadata_api_keys,
        ])
        .build(tauri::generate_context!())
        .expect("error while running Orbit")
        .run(|app, event| {
            if matches!(event, RunEvent::Exit) {
                if let Some(state) = app.try_state::<AppState>() {
                    // Only an open sign-in has a client to close; finishing an
                    // idle one started Steam just as Orbit quit.
                    if state.steam_login.lock().is_active() {
                        if let Err(err) = steam_login::close(Some(app), &state.steam_login, false) {
                            eprintln!("Steam sign-in window could not be closed: {err}");
                        }
                    }
                    // Nothing of Orbit's keeps running after it quits, except
                    // the Steam a still-running game depends on.
                    let keep = state.sessions.active_steam_prefix();
                    services::steam_resident::stop_all_except(keep.as_deref());
                }
            }
        });
}
