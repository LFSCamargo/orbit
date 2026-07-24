use tauri::{AppHandle, Manager};

#[cfg(target_os = "macos")]
pub(crate) fn activate_orbit_app() {
    use objc2_app_kit::NSApplication;
    use objc2_foundation::MainThreadMarker;

    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let app = NSApplication::sharedApplication(mtm);
    app.activate();

    if let Some(window) = app.windows().iter().next() {
        window.makeKeyAndOrderFront(None);
    }
}

pub(crate) fn is_orbit_focused(app: &AppHandle) -> bool {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::NSApplication;
        use objc2_foundation::MainThreadMarker;

        if let Some(mtm) = MainThreadMarker::new() {
            if !NSApplication::sharedApplication(mtm).isActive() {
                return false;
            }
        }
    }

    app.get_webview_window("main")
        .and_then(|window| window.is_focused().ok())
        .unwrap_or(false)
}

pub(crate) fn focus_orbit_window(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    activate_orbit_app();

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

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
pub fn quit_orbit(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn show_orbit_window(app: AppHandle) -> Result<(), String> {
    focus_orbit_window(&app);
    Ok(())
}
