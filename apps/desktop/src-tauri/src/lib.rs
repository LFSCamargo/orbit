#![allow(dead_code)]

mod commands;
mod database;
mod importers;
mod launching;
mod models;
mod platform;
mod services;
mod utils;

use std::sync::Arc;

use database::{GameRepository, MetadataCacheRepository};
use launching::SessionManager;
use utils::api_keys::init_env;
use utils::paths::{database_path, metadata_cache_path};

pub struct AppState {
    pub repo: Arc<GameRepository>,
    pub metadata_cache: Arc<MetadataCacheRepository>,
    pub sessions: Arc<SessionManager>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_env();
    let db_path = database_path();
    let repo = GameRepository::open(&db_path).expect("Failed to open Orbit database");
    let metadata_cache = MetadataCacheRepository::open(&metadata_cache_path())
        .expect("Failed to open metadata cache database");
    let sessions = SessionManager::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            platform::macos::start_controller_home(app.handle().clone());
            Ok(())
        })
        .manage(AppState {
            repo: Arc::new(repo),
            metadata_cache: Arc::new(metadata_cache),
            sessions: Arc::new(sessions),
        })
        .invoke_handler(tauri::generate_handler![
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
            commands::session::launch_game,
            commands::session::stop_game,
            commands::session::get_active_session,
            commands::window::set_window_fullscreen,
            commands::window::hide_orbit_window,
            commands::window::show_orbit_window,
            commands::window::quit_orbit,
            commands::importers::detect_importers,
            commands::gamehub::get_gamehub_library,
            commands::gamehub::open_gamehub,
            commands::steam::open_steam_library,
            commands::steam::install_steam_game,
            commands::importers::scan_steam_library,
            commands::importers::scan_astris_folder,
            commands::importers::scan_native_apps,
            commands::importers::scan_gamehub_folder,
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
        .run(tauri::generate_context!())
        .expect("error while running Orbit");
}
