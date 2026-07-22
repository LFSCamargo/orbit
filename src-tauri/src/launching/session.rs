use anyhow::{bail, Result};
use chrono::Utc;
use parking_lot::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

use crate::database::GameRepository;
use crate::launching::{
    is_process_running, launch_game, list_process_pids_by_name, terminate_pid,
};
use crate::models::{Game, GameProvider, GameSession, SessionStopReason};
use crate::AppState;

pub struct SessionManager {
    active: Mutex<Option<TrackedSession>>,
}

struct TrackedSession {
    session: GameSession,
    preexisting_pids: Vec<u32>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            active: Mutex::new(None),
        }
    }

    pub fn get_active(&self) -> Option<GameSession> {
        self.active.lock().as_ref().map(|tracked| tracked.session.clone())
    }

    pub fn launch_game(
        &self,
        app: &AppHandle,
        repo: &GameRepository,
        game: &Game,
    ) -> Result<GameSession> {
        if self.active.lock().is_some() {
            bail!("A game session is already active");
        }

        let preexisting_pids = if game.provider == GameProvider::Astris {
            list_process_pids_by_name("Astris").unwrap_or_default()
        } else {
            Vec::new()
        };

        if let Err(error) = launch_game(game) {
            let _ = app.emit(
                "game-session-error",
                serde_json::json!({ "message": error.to_string() }),
            );
            // Do not count failed launches as play sessions.
            return Err(error);
        }

        let pid = detect_new_pid(&game.provider, &preexisting_pids);

        let session = GameSession {
            id: Uuid::new_v4().to_string(),
            game_id: game.id.clone(),
            provider: game.provider.clone(),
            pid,
            started_at: Utc::now().to_rfc3339(),
            ended_at: None,
            exit_code: None,
            stop_reason: None,
            duration_seconds: None,
        };

        repo.record_play_start(&session)?;
        *self.active.lock() = Some(TrackedSession {
            session: session.clone(),
            preexisting_pids,
        });

        let _ = app.emit("game-session-started", &session);
        defer_minimize_orbit(app.clone());

        spawn_monitor(app.clone(), session.id.clone());

        Ok(session)
    }

    pub fn stop_game(&self, app: &AppHandle, repo: &GameRepository, session_id: &str) -> Result<GameSession> {
        let tracked = {
            let mut guard = self.active.lock();
            let current = guard
                .as_ref()
                .ok_or_else(|| anyhow::anyhow!("No active session"))?;
            if current.session.id != session_id {
                bail!("Session mismatch");
            }
            guard.take().unwrap()
        };

        if let Some(pid) = tracked.session.pid {
            let _ = terminate_pid(pid);
        }

        let ended = finalize_session(tracked.session, SessionStopReason::UserStopped, None);
        repo.record_play_end(&ended)?;
        let _ = app.emit("game-session-ended", &ended);
        show_orbit(app);
        Ok(ended)
    }

    pub fn on_process_exit(&self, app: &AppHandle, repo: &GameRepository, session_id: &str) {
        let tracked = {
            let mut guard = self.active.lock();
            match guard.as_ref() {
                Some(current) if current.session.id == session_id => guard.take(),
                _ => None,
            }
        };

        if let Some(tracked) = tracked {
            let ended = finalize_session(tracked.session, SessionStopReason::ProcessExited, Some(0));
            let _ = repo.record_play_end(&ended);
            let _ = app.emit("game-session-ended", &ended);
            show_orbit(app);
        }
    }
}

fn finalize_session(
    mut session: GameSession,
    reason: SessionStopReason,
    exit_code: Option<i32>,
) -> GameSession {
    let ended_at = Utc::now();
    let started = chrono::DateTime::parse_from_rfc3339(&session.started_at)
        .ok()
        .map(|dt| dt.with_timezone(&Utc));
    let duration = started
        .map(|start| (ended_at - start).num_seconds().max(0))
        .unwrap_or(0);

    session.ended_at = Some(ended_at.to_rfc3339());
    session.stop_reason = Some(reason);
    session.exit_code = exit_code;
    session.duration_seconds = Some(duration);
    session
}

fn detect_new_pid(provider: &GameProvider, preexisting: &[u32]) -> Option<u32> {
    let name = match provider {
        GameProvider::Astris => "Astris",
        GameProvider::Steam => "steam",
        GameProvider::Native => return None,
        GameProvider::Gamehub => "GameHub",
        GameProvider::Manual => return None,
    };

    // Give the process a brief moment to appear.
    std::thread::sleep(Duration::from_millis(400));
    let pids = list_process_pids_by_name(name).unwrap_or_default();
    pids.into_iter()
        .find(|pid| !preexisting.contains(pid))
        .or_else(|| preexisting.first().copied())
}

fn defer_minimize_orbit(app: AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(1600));
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.minimize();
        }
    });
}

fn show_orbit(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn spawn_monitor(app: AppHandle, session_id: String) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(2));
        let state = app.state::<AppState>();
        let active = state.sessions.get_active();
        let Some(session) = active else {
            break;
        };
        if session.id != session_id {
            break;
        }

        let running = match session.pid {
            Some(pid) => is_process_running(pid),
            None => {
                // URL / Steam launches may not expose a stable PID.
                // Keep session until user stops, unless Astris and process vanished entirely.
                if session.provider == GameProvider::Astris {
                    list_process_pids_by_name("Astris")
                        .map(|pids| !pids.is_empty())
                        .unwrap_or(true)
                } else {
                    true
                }
            }
        };

        if !running {
            state
                .sessions
                .on_process_exit(&app, &state.repo, &session_id);
            break;
        }
    });
}
