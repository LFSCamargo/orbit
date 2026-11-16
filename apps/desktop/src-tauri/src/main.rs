// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "macos")]
    orbit_lib::platform::macos::detached_spawn::run_if_requested();
    orbit_lib::run()
}
