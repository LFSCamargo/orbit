use anyhow::{bail, Result};
use chrono::Utc;
use parking_lot::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

use crate::database::GameRepository;
use crate::launching::progress::{emit_launch_failed, emit_launch_progress};
use crate::launching::{
    is_process_running, launch_game, list_process_pids_by_name, terminate_pid, LaunchContext,
};
use crate::models::{Game, GamePlatform, GameProvider, GameSession, SessionStopReason};
use crate::runtimes::RuntimeProcess;
use crate::services::container_steam::SteamHost;
use crate::AppState;
use std::sync::atomic::{AtomicBool, Ordering};

pub struct SessionManager {
    active: Mutex<Option<TrackedSession>>,
    launching: AtomicBool,
    cancel: AtomicBool,
}

struct TrackedSession {
    session: GameSession,
    preexisting_pids: Vec<u32>,
    runtime: Option<Box<dyn RuntimeProcess>>,
    /// The game container's Steam client. It stays logged on after the session
    /// (`steam_resident`), so a relaunch skips Steam's startup.
    steam_host: Option<SteamHost>,
    stopping: bool,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            active: Mutex::new(None),
            launching: AtomicBool::new(false),
            cancel: AtomicBool::new(false),
        }
    }

    pub fn is_launching(&self) -> bool {
        self.launching.load(Ordering::SeqCst)
    }

    /// The container prefix whose Steam the running game uses.
    pub fn active_steam_prefix(&self) -> Option<std::path::PathBuf> {
        self.active
            .lock()
            .as_ref()
            .and_then(|tracked| tracked.steam_host.as_ref())
            .map(|host| host.prefix.clone())
    }

    pub fn get_active(&self) -> Option<GameSession> {
        self.active
            .lock()
            .as_ref()
            .map(|tracked| tracked.session.clone())
    }

    pub fn launch_game(
        &self,
        app: &AppHandle,
        repo: &GameRepository,
        game: &Game,
    ) -> Result<GameSession> {
        if self
            .launching
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            bail!("A game launch is already in progress");
        }
        struct Reservation<'a>(&'a AtomicBool);
        impl Drop for Reservation<'_> {
            fn drop(&mut self) {
                self.0.store(false, Ordering::SeqCst);
            }
        }
        let _reservation = Reservation(&self.launching);
        self.cancel.store(false, Ordering::SeqCst);
        if self.active.lock().is_some() {
            bail!("A game session is already active");
        }

        let preexisting_pids = if game.provider == GameProvider::Astris {
            list_process_pids_by_name("Astris").unwrap_or_default()
        } else {
            Vec::new()
        };

        let ctx = LaunchContext::from_app(app);
        let last_step = Mutex::new("resolve".to_string());

        let mut steam_host: Option<SteamHost> = None;
        let result = match &game.launch_config {
            crate::models::LaunchConfiguration::Wine { profile } => {
                emit_launch_progress(app, &game.id, "resolve", Some(&game.title));
                let steam_windows =
                    game.provider == GameProvider::Steam && game.platform == GamePlatform::Windows;
                let msstore_windows = game.provider == GameProvider::MsStore
                    && game.platform == GamePlatform::Windows;
                {
                    let profile = wine_profile_for_play(
                        game,
                        profile,
                        crate::services::steam_windows::play_wine_binary(repo),
                    );
                    match crate::runtimes::settings::resolve_profile(repo, &profile) {
                        Ok(resolved) if msstore_windows => {
                            let product_id = game
                                .source_id
                                .clone()
                                .filter(|id| orbit_msstore::valid_product_id(id))
                                .ok_or_else(|| {
                                    anyhow::anyhow!(
                                        "This game's Microsoft Store product id is invalid"
                                    )
                                })?;
                            let session_dir = crate::services::msstore_auth::session_dir(
                                &crate::utils::paths::app_data_dir(),
                            );
                            crate::services::msstore_play::launch(
                                &resolved,
                                &game.id,
                                &product_id,
                                &crate::runtimes::root(),
                                &session_dir,
                                &self.cancel,
                                &mut |step| {
                                    *last_step.lock() = step.to_string();
                                    emit_launch_progress(app, &game.id, step, Some(&game.title));
                                },
                            )
                        }
                        Ok(mut resolved) if steam_windows => {
                            let app_id = game
                                .source_id
                                .clone()
                                .filter(|id| crate::services::steam_download::valid_app_id(id))
                                .ok_or_else(|| {
                                    anyhow::anyhow!("This game's Steam id must be a number")
                                })?;
                            let preferences = crate::services::steam_windows::preferences(repo)
                                .unwrap_or_default();
                            *last_step.lock() = "container".to_string();
                            emit_launch_progress(app, &game.id, "container", Some(&game.title));
                            match crate::services::steam_play::play_environment(
                                &resolved,
                                &app_id,
                                &self.cancel,
                                &preferences,
                                &mut |step| {
                                    *last_step.lock() = step.to_string();
                                    emit_launch_progress(app, &game.id, step, Some(&game.title));
                                },
                            ) {
                                Ok(prefix) => {
                                    steam_host = Some(SteamHost {
                                        wine: std::path::PathBuf::from(&resolved.runtime_path),
                                        prefix: prefix.clone(),
                                    });
                                    resolved.shared_prefix =
                                        Some(prefix.to_string_lossy().into_owned());
                                    crate::services::steam_play::start_title(
                                        &resolved,
                                        &game.id,
                                        &app_id,
                                        &self.cancel,
                                        &mut |step| {
                                            *last_step.lock() = step.to_string();
                                            emit_launch_progress(
                                                app,
                                                &game.id,
                                                step,
                                                Some(&game.title),
                                            );
                                        },
                                    )
                                    .map_err(|error| anyhow::anyhow!(error))
                                }
                                Err(error) => {
                                    emit_launch_failed(
                                        app,
                                        &game.id,
                                        last_step.lock().as_str(),
                                        &error,
                                        Some(&game.title),
                                    );
                                    let _ = app.emit(
                                        "game-session-error",
                                        serde_json::json!({ "message": error }),
                                    );
                                    Err(anyhow::anyhow!(error))
                                }
                            }
                        }
                        Ok(resolved) => crate::runtimes::wine::WineAdapter.launch_with_progress(
                            &resolved,
                            &game.id,
                            &crate::runtimes::root(),
                            &self.cancel,
                            &mut |step| {
                                *last_step.lock() = step.to_string();
                                emit_launch_progress(app, &game.id, step, Some(&game.title));
                            },
                        ),
                        Err(error) => {
                            *last_step.lock() = "graphics".to_string();
                            Err(error)
                        }
                    }
                    .map(Some)
                }
            }
            _ => {
                *last_step.lock() = "spawn".to_string();
                emit_launch_progress(app, &game.id, "spawn", Some(&game.title));
                launch_game(game, &ctx).map(|_| None)
            }
        };
        let mut runtime = match result {
            Ok(runtime) => runtime,
            Err(error) => {
                let message = format!("{error:#}");
                emit_launch_failed(
                    app,
                    &game.id,
                    last_step.lock().as_str(),
                    &message,
                    Some(&game.title),
                );
                let _ = app.emit(
                    "game-session-error",
                    serde_json::json!({ "message": message }),
                );
                return Err(error);
            }
        };
        if runtime.is_some() && self.cancel.load(Ordering::SeqCst) {
            if let Some(handle) = runtime.as_mut() {
                handle.stop()?;
            }
            emit_launch_failed(
                app,
                &game.id,
                last_step.lock().as_str(),
                "Launch cancelled",
                Some(&game.title),
            );
            bail!("Launch cancelled");
        }
        let pid = runtime
            .as_ref()
            .map(|handle| handle.pid())
            .or_else(|| detect_new_pid(&game.provider, &preexisting_pids));

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

        let wine_session = runtime.is_some();
        repo.record_play_start(&session)?;
        *self.active.lock() = Some(TrackedSession {
            session: session.clone(),
            preexisting_pids,
            runtime,
            steam_host,
            stopping: false,
        });

        emit_launch_progress(app, &game.id, "running", Some(&game.title));
        let _ = app.emit("game-session-started", &session);
        super::game_activity::set_running(true);
        if wine_session {
            focus_game(app.clone(), session.id.clone());
        } else {
            defer_minimize_orbit(app.clone(), session.id.clone());
        }

        spawn_monitor(app.clone(), session.id.clone());

        Ok(session)
    }

    pub fn cancel_launch(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }

    pub fn stop_game(
        &self,
        app: &AppHandle,
        repo: &GameRepository,
        session_id: &str,
    ) -> Result<GameSession> {
        // Move the owned handle out while stopping; do not hold the active-session
        // mutex during potentially slow Wine shutdown (UI queries need that lock).
        let (mut runtime, legacy_pid) = {
            let mut guard = self.active.lock();
            let current = guard
                .as_mut()
                .ok_or_else(|| anyhow::anyhow!("No active session"))?;
            if current.session.id != session_id {
                bail!("Session mismatch");
            }
            if current.stopping {
                bail!("Game shutdown is already in progress");
            }
            current.stopping = true;
            let legacy_pid = if current.runtime.is_none() {
                termination_target(&current.session)
            } else {
                None
            };
            (current.runtime.take(), legacy_pid)
        };
        if let Some(handle) = runtime.as_mut() {
            if let Err(error) = handle.stop() {
                if let Some(current) = self.active.lock().as_mut() {
                    current.runtime = runtime;
                    current.stopping = false;
                }
                return Err(error);
            }
        } else if let Some(pid) = legacy_pid {
            let _ = terminate_pid(pid);
        }
        let tracked = self
            .active
            .lock()
            .take()
            .ok_or_else(|| anyhow::anyhow!("No active session"))?;

        let ended = finalize_session(tracked.session, SessionStopReason::UserStopped, None);
        repo.record_play_end(&ended)?;
        let _ = app.emit("game-session-ended", &ended);
        after_session(app, tracked.steam_host.as_ref());
        Ok(ended)
    }

    pub fn on_process_exit(
        &self,
        app: &AppHandle,
        repo: &GameRepository,
        session_id: &str,
        exit_code: Option<i32>,
    ) {
        let tracked = {
            let mut guard = self.active.lock();
            match guard.as_ref() {
                Some(current) if current.session.id == session_id && !current.stopping => {
                    guard.take()
                }
                _ => None,
            }
        };

        if let Some(tracked) = tracked {
            let ended =
                finalize_session(tracked.session, SessionStopReason::ProcessExited, exit_code);
            let _ = repo.record_play_end(&ended);
            let _ = app.emit("game-session-ended", &ended);
            record_crash_fallback(app, repo, &ended);
            after_session(app, tracked.steam_host.as_ref());
        }
    }
}

/// An RE Engine game that crashed while starting switches its ini to DirectX 11
/// for the next launch; the launch card says what changed.
fn record_crash_fallback(app: &AppHandle, repo: &GameRepository, ended: &GameSession) {
    use crate::services::game_fixes::{self, Fallback};
    if !game_fixes::is_startup_crash(ended.exit_code, ended.duration_seconds.unwrap_or(i64::MAX)) {
        return;
    }
    let (app_id, install_dir, title) =
        if let Some(app_id) = ended.game_id.strip_prefix("steam-windows:") {
            (
                app_id.to_string(),
                crate::services::steam_client_download::client_install_dir(app_id),
                None,
            )
        } else {
            let Ok(Some(game)) = repo.get_game(&ended.game_id) else {
                return;
            };
            let crate::models::LaunchConfiguration::Wine { profile } = &game.launch_config else {
                return;
            };
            let Some(app_id) = game.source_id.clone() else {
                return;
            };
            let dir = std::path::Path::new(&profile.executable)
                .parent()
                .map(std::path::Path::to_path_buf);
            (app_id, dir, Some(game.title))
        };
    let Some(next) = game_fixes::record_startup_crash(repo, &app_id, install_dir.as_deref()) else {
        return;
    };
    let change = match next {
        Fallback::DirectX11 => "switched it to DirectX 11",
        Fallback::None => return,
    };
    let name = title.unwrap_or_else(|| "The game".into());
    let _ = app.emit(
        "game-crash-fallback",
        serde_json::json!({
            "gameId": ended.game_id,
            "message": format!("{name} crashed while starting. Orbit {change}. Press Play to try again."),
        }),
    );
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
        GameProvider::Manual | GameProvider::Xcloud | GameProvider::MsStore => return None,
    };

    // Give the process a brief moment to appear.
    std::thread::sleep(Duration::from_millis(400));
    let pids = list_process_pids_by_name(name).unwrap_or_default();
    pids.into_iter()
        .find(|pid| !preexisting.contains(pid))
        .or_else(|| preexisting.first().copied())
}

/// Wine games: wait for the game's own window, then hide Orbit and activate it.
fn focus_game(app: AppHandle, session_id: String) {
    #[cfg(target_os = "macos")]
    crate::platform::macos::game_focus::focus_game_when_ready(
        app.clone(),
        std::time::SystemTime::now(),
        Duration::from_secs(180),
        move || {
            app.state::<AppState>()
                .sessions
                .get_active()
                .is_some_and(|session| session.id == session_id)
        },
    );
    #[cfg(not(target_os = "macos"))]
    let _ = (app, session_id);
}

fn defer_minimize_orbit(app: AppHandle, session_id: String) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(1600));
        if !app
            .state::<AppState>()
            .sessions
            .get_active()
            .is_some_and(|s| s.id == session_id)
        {
            return;
        }
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.minimize();
        }
    });
}

fn after_session(app: &AppHandle, steam_host: Option<&SteamHost>) {
    super::game_activity::set_running(false);
    if let Some(prefix) = steam_host.map(|host| host.prefix.clone()) {
        // The resident client outlives the session at normal priority.
        std::thread::spawn(move || {
            crate::services::steam_helper_priority::set_background(&prefix, false)
        });
    }
    show_orbit(app);
}

fn show_orbit(app: &AppHandle) {
    // Wine sessions hide the whole app (see `focus_game`).
    #[cfg(target_os = "macos")]
    let _ = app.show();
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn spawn_monitor(app: AppHandle, session_id: String) {
    let mut tick: u64 = 0;
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(2));
        tick += 1;
        let state = app.state::<AppState>();
        let active = state.sessions.get_active();
        let Some(session) = active else {
            break;
        };
        if session.id != session_id {
            break;
        }

        let (stopping, runtime_status) = {
            let mut guard = state.sessions.active.lock();
            match guard.as_mut().filter(|t| t.session.id == session_id) {
                Some(tracked) if !tracked.stopping => (
                    false,
                    tracked.runtime.as_mut().map(|runtime| runtime.poll()),
                ),
                _ => (true, None),
            }
        };
        if stopping {
            continue;
        }
        if crate::services::steam_helper_priority::sweep_due(tick) {
            if let Some(prefix) = state.sessions.active_steam_prefix() {
                crate::services::steam_helper_priority::set_background(&prefix, true);
            }
        }
        if let Some(status) = runtime_status {
            match status {
                Ok(Some(code)) => {
                    state
                        .sessions
                        .on_process_exit(&app, &state.repo, &session_id, Some(code));
                    if code != 0 {
                        let message = crate::services::steam_play::play_exit_message(code);
                        let _ = app.emit(
                            "game-session-error",
                            serde_json::json!({"message": message}),
                        );
                    }
                    break;
                }
                Ok(None) => continue,
                Err(error) => {
                    let _ = app.emit(
                        "game-session-error",
                        serde_json::json!({"message":error.to_string()}),
                    );
                    continue;
                }
            }
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
                .on_process_exit(&app, &state.repo, &session_id, None);
            break;
        }
    });
}

fn wine_profile_for_play(
    game: &Game,
    profile: &crate::runtimes::WineProfile,
    steam_wine: Option<std::path::PathBuf>,
) -> crate::runtimes::WineProfile {
    let mut profile = profile.clone();
    if matches!(game.provider, GameProvider::Steam | GameProvider::MsStore)
        && game.platform == GamePlatform::Windows
    {
        if let Some(path) = steam_wine {
            profile.runtime_path = path.to_string_lossy().into_owned();
        }
    }
    profile
}

fn termination_target(session: &GameSession) -> Option<u32> {
    session.pid
}

#[cfg(test)]
mod shared_host_tests {
    use super::*;
    #[test]
    fn steam_windows_play_uses_current_steam_wine() {
        let game = Game {
            id: "gow".into(),
            title: "God of War".into(),
            sort_title: "god of war".into(),
            description: None,
            provider: GameProvider::Steam,
            platform: GamePlatform::Windows,
            source_id: Some("1593500".into()),
            launch_config: crate::models::LaunchConfiguration::Wine {
                profile: crate::runtimes::WineProfile {
                    executable: "/Games/GoW.exe".into(),
                    runtime_path: "/old/wine".into(),
                    ..Default::default()
                },
            },
            artwork: crate::models::GameArtwork::default(),
            favorite: false,
            hidden: false,
            date_added: String::new(),
            last_played_at: None,
            total_playtime_seconds: 0,
            install_size_bytes: None,
            achievements: vec![],
        };
        let stored = crate::runtimes::WineProfile {
            executable: "/Games/GoW.exe".into(),
            runtime_path: "/old/wine".into(),
            ..Default::default()
        };
        let steam = wine_profile_for_play(
            &game,
            &stored,
            Some(std::path::PathBuf::from("/steam/wine-11.21/bin/wine")),
        );
        assert_eq!(steam.runtime_path, "/steam/wine-11.21/bin/wine");
        assert!(steam.shared_prefix.is_none());
        let mut manual = game.clone();
        manual.provider = GameProvider::Manual;
        let kept = wine_profile_for_play(
            &manual,
            &stored,
            Some(std::path::PathBuf::from("/steam/wine")),
        );
        assert_eq!(kept.runtime_path, "/old/wine");
    }
}
