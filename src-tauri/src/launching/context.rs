#[derive(Clone, Debug, Default)]
pub struct LaunchContext {
    #[cfg(target_os = "macos")]
    pub orbit_screen: Option<crate::platform::macos::OrbitScreenPlacement>,
}

impl LaunchContext {
    pub fn from_app(app: &tauri::AppHandle) -> Self {
        #[cfg(target_os = "macos")]
        {
            Self {
                orbit_screen: crate::platform::macos::OrbitScreenPlacement::from_orbit_app(app),
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = app;
            Self
        }
    }

    #[cfg(target_os = "macos")]
    pub fn spawn_fullscreen_watcher(&self, process_name: &str) {
        if let Some(placement) = &self.orbit_screen {
            crate::platform::macos::spawn_app_fullscreen_watcher(process_name, placement.clone());
        }
    }

    #[cfg(target_os = "macos")]
    pub fn spawn_fullscreen_watchers<'a, I>(&self, process_names: I)
    where
        I: IntoIterator<Item = &'a str>,
    {
        for process_name in process_names {
            self.spawn_fullscreen_watcher(process_name);
        }
    }

    #[cfg(not(target_os = "macos"))]
    pub fn spawn_fullscreen_watcher(&self, _process_name: &str) {}

    #[cfg(not(target_os = "macos"))]
    pub fn spawn_fullscreen_watchers<'a, I>(&self, _process_names: I)
    where
        I: IntoIterator<Item = &'a str>,
    {
    }
}
