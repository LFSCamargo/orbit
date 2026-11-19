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

/// "Return to game": hand the screen back to the running game.
#[tauri::command]
pub fn hide_orbit_window(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let started = app
            .state::<crate::AppState>()
            .sessions
            .get_active()
            .and_then(|session| session_start(&session.started_at))
            .unwrap_or(std::time::UNIX_EPOCH);
        match objc2_foundation::MainThreadMarker::new() {
            Some(mtm) => {
                crate::platform::macos::game_focus::hand_off(mtm, started);
            }
            None => {
                let _ = app.hide();
            }
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| "Main window missing".to_string())?;
        window.hide().map_err(|err| err.to_string())
    }
}

fn session_start(started_at: &str) -> Option<std::time::SystemTime> {
    chrono::DateTime::parse_from_rfc3339(started_at)
        .ok()
        .map(std::time::SystemTime::from)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_start_parses_the_recorded_timestamp() {
        let parsed = session_start("2026-11-16T14:35:00.123+00:00").unwrap();
        let seconds = parsed
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        assert_eq!(seconds, 1_794_839_700);
        assert!(session_start("not a date").is_none());
    }
}
