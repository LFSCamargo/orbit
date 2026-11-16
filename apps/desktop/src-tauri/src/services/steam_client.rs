//! Keep the silent Windows Steam client alive while Orbit is open and emit
//! `steam-client` phases for Settings and Play.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use parking_lot::Mutex;
use tauri::{AppHandle, Emitter};

use super::steam_play;
use super::steam_windows;
use crate::database::GameRepository;

static LAST_ERROR: Mutex<Option<String>> = Mutex::new(None);
static WARMING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SteamClientPhase {
    Stopped,
    Starting,
    Connecting,
    Ready,
    Failed,
}

impl SteamClientPhase {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Stopped => "stopped",
            Self::Starting => "starting",
            Self::Connecting => "connecting",
            Self::Ready => "ready",
            Self::Failed => "failed",
        }
    }
}

pub fn phase(
    signed_in: bool,
    steam_installed: bool,
    client_running: bool,
    client_logged_in: bool,
    last_error: Option<&str>,
) -> SteamClientPhase {
    if client_logged_in {
        SteamClientPhase::Ready
    } else if last_error.is_some() && !client_running {
        SteamClientPhase::Failed
    } else if client_running {
        SteamClientPhase::Connecting
    } else if signed_in && steam_installed {
        SteamClientPhase::Starting
    } else {
        SteamClientPhase::Stopped
    }
}

pub fn caption(phase: SteamClientPhase, last_error: Option<&str>) -> String {
    match phase {
        SteamClientPhase::Stopped => String::new(),
        SteamClientPhase::Starting => "Waiting for Steam…".into(),
        SteamClientPhase::Connecting => "Waiting for Steam to sign in…".into(),
        SteamClientPhase::Ready => "Steam is ready".into(),
        SteamClientPhase::Failed => last_error
            .unwrap_or("Windows Steam could not start")
            .to_string(),
    }
}

pub fn describe(
    signed_in: bool,
    steam_installed: bool,
    client_running: bool,
    client_logged_in: bool,
) -> (String, String) {
    let error = LAST_ERROR.lock().clone();
    let phase = phase(
        signed_in,
        steam_installed,
        client_running,
        client_logged_in,
        error.as_deref(),
    );
    (phase.as_str().into(), caption(phase, error.as_deref()))
}

pub fn start(app: AppHandle, repo: Arc<GameRepository>) {
    let watch_repo = repo.clone();
    let watch_app = app.clone();
    let _ = std::thread::Builder::new()
        .name("orbit-steam-client".into())
        .spawn(move || watch(watch_app, watch_repo));
    let _ = std::thread::Builder::new()
        .name("orbit-steam-warm".into())
        .spawn(move || warm_loop(app, repo));
}

fn watch(app: AppHandle, repo: Arc<GameRepository>) {
    let mut last = None;
    loop {
        if let Ok(status) = steam_windows::status(&repo) {
            let key = (
                status.client_phase.clone(),
                status.client_running,
                status.client_logged_in,
            );
            if last.as_ref() != Some(&key) {
                let _ = app.emit("steam-client", &status);
                last = Some(key);
            }
        }
        std::thread::sleep(Duration::from_secs(1));
    }
}

fn warm_loop(app: AppHandle, repo: Arc<GameRepository>) {
    loop {
        warm_once(&app, &repo);
        std::thread::sleep(Duration::from_secs(5));
    }
}

fn warm_once(app: &AppHandle, repo: &GameRepository) {
    if steam_windows::login_in_progress() {
        return;
    }
    let Ok(status) = steam_windows::status(repo) else {
        return;
    };
    if !status.signed_in || !status.steam_installed || status.client_running {
        return;
    }
    if !WARMING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_ok()
    {
        return;
    }
    let result = start_silent_client(repo);
    WARMING.store(false, Ordering::SeqCst);
    match result {
        Ok(()) => {
            *LAST_ERROR.lock() = None;
        }
        Err(error) => {
            *LAST_ERROR.lock() = Some(error);
        }
    }
    if let Ok(status) = steam_windows::status(repo) {
        let _ = app.emit("steam-client", &status);
    }
}

fn start_silent_client(repo: &GameRepository) -> Result<(), String> {
    let Some(wine) = steam_windows::play_wine_binary(repo) else {
        return Err(
            "Install a Windows compatibility runtime in Settings before Steam can start".into(),
        );
    };
    let prefix = steam_play::play_prefix()?;
    let extras = steam_windows::preferences(repo)
        .map(|prefs| prefs.additional_library_paths)
        .unwrap_or_default();
    let cancel = AtomicBool::new(false);
    steam_play::ensure_silent_client(&wine, &prefix, &cancel, &extras)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ready_only_when_the_prefix_client_is_logged_on() {
        assert_eq!(phase(true, true, true, true, None), SteamClientPhase::Ready);
        assert_eq!(
            phase(true, true, true, false, None),
            SteamClientPhase::Connecting
        );
        assert_eq!(
            phase(true, true, false, false, None),
            SteamClientPhase::Starting
        );
        assert_eq!(
            phase(false, true, false, false, None),
            SteamClientPhase::Stopped
        );
        assert_eq!(
            phase(true, true, false, false, Some("no wine")),
            SteamClientPhase::Failed
        );
        assert_eq!(
            caption(SteamClientPhase::Connecting, None),
            "Waiting for Steam to sign in…"
        );
        assert_eq!(caption(SteamClientPhase::Ready, None), "Steam is ready");
    }
}
