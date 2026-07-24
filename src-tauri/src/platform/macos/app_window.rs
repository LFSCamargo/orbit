use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use tauri::{AppHandle, Manager};

/// Physical monitor bounds for the display Orbit is currently on.
#[derive(Clone, Debug)]
pub struct OrbitScreenPlacement {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

impl OrbitScreenPlacement {
    pub fn from_orbit_app(app: &AppHandle) -> Option<Self> {
        let window = app.get_webview_window("main")?;
        let monitor = window
            .current_monitor()
            .ok()
            .flatten()
            .or_else(|| window.primary_monitor().ok().flatten())?;
        let position = monitor.position();
        let size = monitor.size();
        Some(Self {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
            scale_factor: monitor.scale_factor(),
        })
    }

    fn applescript_position(&self) -> (i32, i32) {
        let x = (self.x as f64 / self.scale_factor).round() as i32;
        let y = (self.y as f64 / self.scale_factor).round() as i32;
        (x, y)
    }

    fn applescript_size(&self) -> (i32, i32) {
        let width = (self.width as f64 / self.scale_factor).round() as i32;
        let height = (self.height as f64 / self.scale_factor).round() as i32;
        (width, height)
    }
}

/// While a launcher app boots, keep nudging its window onto Orbit's monitor and into fullscreen.
pub fn spawn_app_fullscreen_watcher(process_name: &str, placement: OrbitScreenPlacement) {
    let process_name = process_name.to_string();
    thread::spawn(move || {
        const ATTEMPTS: &[u64] = &[0, 500, 1_500, 3_000, 5_000, 8_000, 12_000];

        let started = Instant::now();
        for &offset_ms in ATTEMPTS {
            let elapsed = started.elapsed();
            let target = Duration::from_millis(offset_ms);
            if elapsed < target {
                thread::sleep(target - elapsed);
            }
            let _ = apply_app_fullscreen_on_screen(&process_name, &placement);
        }
    });
}

fn apply_app_fullscreen_on_screen(
    process_name: &str,
    placement: &OrbitScreenPlacement,
) -> Result<()> {
    let (x, y) = placement.applescript_position();
    let (width, height) = placement.applescript_size();
    let script = format!(
        r#"tell application "System Events"
  if not (exists process "{process_name}") then error "{process_name} not running"
  tell process "{process_name}"
    set frontmost to true
    repeat 20 times
      if (count of windows) > 0 then exit repeat
      delay 0.15
    end repeat
    if (count of windows) is 0 then error "No {process_name} window"
    set appWindow to window 1
    set position of appWindow to {{{x}, {y}}}
    set size of appWindow to {{{width}, {height}}}
    delay 0.2
    try
      set value of attribute "AXFullScreen" of appWindow to true
    on error
      keystroke "f" using {{command down, control down}}
    end try
  end tell
end tell"#
    );

    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .with_context(|| format!("Failed to run {process_name} fullscreen AppleScript"))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!(stderr.trim().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_retina_bounds_to_applescript_points() {
        let placement = OrbitScreenPlacement {
            x: 0,
            y: 0,
            width: 5120,
            height: 2880,
            scale_factor: 2.0,
        };
        assert_eq!(placement.applescript_position(), (0, 0));
        assert_eq!(placement.applescript_size(), (2560, 1440));
    }
}
