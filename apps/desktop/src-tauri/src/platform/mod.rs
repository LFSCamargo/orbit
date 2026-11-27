#[cfg(target_os = "macos")]
pub mod macos;

#[cfg(not(target_os = "macos"))]
pub mod macos {
    use tauri::AppHandle;

    pub fn start_controller_home(_app: AppHandle) {}
    pub fn refresh_controller_home_bindings() {}
    pub fn lend_xinput_pads() {}
    pub fn take_back_xinput_pads() {}
}
