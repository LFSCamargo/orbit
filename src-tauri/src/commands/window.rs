use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn set_window_fullscreen(app: AppHandle, fullscreen: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window missing".to_string())?;
    window
        .set_fullscreen(fullscreen)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn hide_orbit_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window missing".to_string())?;
    window.hide().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn show_orbit_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window missing".to_string())?;
    window.show().map_err(|err| err.to_string())?;
    window.unminimize().map_err(|err| err.to_string())?;
    window.set_focus().map_err(|err| err.to_string())
}
