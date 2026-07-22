#![allow(dead_code)]

mod commands;
mod database;
mod importers;
mod launching;
mod models;
mod services;
mod utils;

use std::sync::Arc;

use database::GameRepository;
use launching::SessionManager;
use utils::paths::database_path;

pub struct AppState {
    pub repo: Arc<GameRepository>,
    pub sessions: Arc<SessionManager>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_path = database_path();
    let repo = GameRepository::open(&db_path).expect("Failed to open Orbit database");
    let sessions = SessionManager::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            repo: Arc::new(repo),
            sessions: Arc::new(sessions),
        })
        .invoke_handler(tauri::generate_handler![
            commands::games::list_games,
            commands::games::get_game,
            commands::games::create_game,
            commands::games::update_game,
            commands::games::toggle_favorite,
            commands::games::set_game_hidden,
            commands::games::delete_game,
            commands::games::clear_library,
            commands::games::get_setting,
            commands::games::set_setting,
            commands::session::launch_game,
            commands::session::stop_game,
            commands::session::get_active_session,
            commands::window::set_window_fullscreen,
            commands::window::hide_orbit_window,
            commands::window::show_orbit_window,
            commands::importers::detect_importers,
            commands::importers::scan_steam_library,
            commands::importers::scan_astris_folder,
            commands::importers::scan_native_apps,
            commands::importers::scan_gamehub_folder,
            commands::importers::import_game_path,
            commands::themes::list_custom_themes,
            commands::themes::themes_directory,
            commands::artwork::read_artwork_from_path,
            commands::artwork::fetch_artwork_from_url,
            commands::artwork::search_public_artwork,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Orbit");
}
