use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Ordered Steam Windows / Wine launch stages shown in the overlay.
pub const WINE_LAUNCH_STEPS: &[(&str, &str)] = &[
    ("resolve", "Finding the Windows install"),
    ("runtime", "Checking Steam for Windows"),
    ("container", "Preparing the game container"),
    ("compatibility", "Applying compatibility"),
    ("steam", "Seeding Steam into the container"),
    ("login", "Using the saved Steam login"),
    ("cloud", "Copying Steam Cloud saves"),
    ("prefix", "Preparing the Windows environment"),
    ("graphics", "Applying graphics settings"),
    ("spawn", "Starting the game"),
    ("running", "Game is running"),
];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LaunchProgress {
    pub game_id: String,
    pub step: String,
    pub message: String,
    pub index: u8,
    pub total: u8,
    pub failed: bool,
    /// Game title so the overlay can show the correct name even when the
    /// launch id is a synthetic handle (`steam-windows:{appId}`) that does not
    /// match a library game id.
    pub title: Option<String>,
}

pub fn wine_step_index(step: &str) -> u8 {
    WINE_LAUNCH_STEPS
        .iter()
        .position(|(id, _)| *id == step)
        .unwrap_or(0) as u8
}

pub fn wine_step_message(step: &str) -> &'static str {
    WINE_LAUNCH_STEPS
        .iter()
        .find(|(id, _)| *id == step)
        .map(|(_, message)| *message)
        .unwrap_or("Launching…")
}

pub fn launch_progress(
    game_id: &str,
    step: &str,
    failed: bool,
    detail: Option<&str>,
    title: Option<&str>,
) -> LaunchProgress {
    let index = wine_step_index(step);
    let message = if failed {
        detail.unwrap_or("Launch failed").to_string()
    } else {
        wine_step_message(step).to_string()
    };
    LaunchProgress {
        game_id: game_id.to_string(),
        step: step.to_string(),
        message,
        index,
        total: WINE_LAUNCH_STEPS.len() as u8,
        failed,
        title: title.map(str::to_string),
    }
}

pub fn emit_launch_progress(app: &AppHandle, game_id: &str, step: &str, title: Option<&str>) {
    let _ = app.emit(
        "game-launch-progress",
        launch_progress(game_id, step, false, None, title),
    );
}

pub fn emit_launch_failed(
    app: &AppHandle,
    game_id: &str,
    step: &str,
    error: &str,
    title: Option<&str>,
) {
    let _ = app.emit(
        "game-launch-progress",
        launch_progress(game_id, step, true, Some(error), title),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wine_steps_are_indexed_in_startup_order() {
        assert_eq!(wine_step_index("resolve"), 0);
        assert_eq!(wine_step_index("container"), 2);
        assert_eq!(wine_step_index("steam"), 4);
        assert_eq!(wine_step_index("prefix"), 7);
        assert_eq!(wine_step_index("running"), 10);
        assert_eq!(wine_step_index("unknown"), 0);
    }

    #[test]
    fn failed_progress_keeps_the_step_and_uses_the_error_detail() {
        let payload = launch_progress(
            "g1",
            "prefix",
            true,
            Some("Wine environment setup failed"),
            Some("God of War"),
        );
        assert_eq!(payload.step, "prefix");
        assert_eq!(payload.index, 7);
        assert!(payload.failed);
        assert_eq!(payload.message, "Wine environment setup failed");
        assert_eq!(payload.total, 11);
        assert_eq!(payload.title.as_deref(), Some("God of War"));
    }
}
