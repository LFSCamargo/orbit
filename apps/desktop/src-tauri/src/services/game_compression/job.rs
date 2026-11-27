//! The Settings switch for game compression and the background job that
//! compresses (or decompresses) every installed game, reporting progress on
//! `game-compression-progress`. A game that is running or downloading is
//! skipped; the download queue compresses it when its download finishes.
//! One folder is processed at a time across the job and the download queue.
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};

use super::targets::{self, Target};
use super::tree::{self, Direction, Totals};
use crate::database::GameRepository;
use crate::AppState;

const SETTING: &str = "game-compression-v1";
pub const EVENT: &str = "game-compression-progress";
const EMIT_EVERY: Duration = Duration::from_millis(250);

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressionStatus {
    pub enabled: bool,
    pub running: bool,
    /// True while compressing, false while decompressing.
    pub compressing: bool,
    pub games_done: u32,
    pub games_total: u32,
    pub current_title: Option<String>,
    pub bytes_done: u64,
    pub bytes_total: u64,
    /// Disk space saved (negative while decompressing gives it back).
    pub saved_bytes: i64,
    pub skipped_games: u32,
    pub error: Option<String>,
}

static STATUS: Mutex<Option<CompressionStatus>> = Mutex::new(None);
static CANCEL: Mutex<Option<Arc<AtomicBool>>> = Mutex::new(None);
/// One game folder at a time, shared with the download queue.
static FOLDER: Mutex<()> = Mutex::new(());

pub fn enabled(repo: &GameRepository) -> bool {
    repo.get_setting(SETTING)
        .ok()
        .flatten()
        .and_then(|value| value.get("enabled")?.as_bool())
        .unwrap_or(false)
}

pub fn status(repo: &GameRepository) -> CompressionStatus {
    let mut status = STATUS.lock().clone().unwrap_or_default();
    status.enabled = enabled(repo);
    status
}

fn publish(app: &AppHandle, status: &CompressionStatus) {
    *STATUS.lock() = Some(status.clone());
    let _ = app.emit(EVENT, status);
}

/// Saves the switch and starts the job that applies it to every game,
/// stopping a job already running in the other direction.
pub fn set_enabled(app: &AppHandle, on: bool) -> Result<CompressionStatus, String> {
    let state = app.state::<AppState>();
    state
        .repo
        .set_setting(SETTING, &json!({ "enabled": on }))
        .map_err(|err| err.to_string())?;
    let cancel = Arc::new(AtomicBool::new(false));
    if let Some(previous) = CANCEL.lock().replace(cancel.clone()) {
        previous.store(true, Ordering::SeqCst);
    }
    let status = CompressionStatus {
        enabled: on,
        running: true,
        compressing: on,
        ..Default::default()
    };
    publish(app, &status);
    let app = app.clone();
    std::thread::spawn(move || run_all(&app, on, &cancel));
    Ok(status)
}

fn busy(app: &AppHandle, target: &Target) -> bool {
    let state = app.state::<AppState>();
    let playing = state
        .sessions
        .get_active()
        .is_some_and(|session| target.game_ids.contains(&session.game_id));
    let downloading = target
        .app_id
        .as_deref()
        .is_some_and(crate::services::download_queue::is_queued);
    playing || downloading
}

fn run_all(app: &AppHandle, compress: bool, cancel: &AtomicBool) {
    let direction = if compress {
        Direction::Compress
    } else {
        Direction::Decompress
    };
    let state = app.state::<AppState>();
    let found = crate::commands::library::entries(&state)
        .map(|entries| targets::all(&entries))
        .unwrap_or_default();
    let mut status = CompressionStatus {
        enabled: compress,
        running: true,
        compressing: compress,
        games_total: found.len() as u32,
        ..Default::default()
    };
    publish(app, &status);
    for target in &found {
        if cancel.load(Ordering::SeqCst) {
            return;
        }
        if busy(app, target) {
            status.skipped_games += 1;
            status.games_done += 1;
            continue;
        }
        status.current_title = Some(target.title.clone());
        status.bytes_done = 0;
        status.bytes_total = 0;
        publish(app, &status);
        let shown = Mutex::new((status.clone(), Instant::now()));
        let result = {
            let _folder = FOLDER.lock();
            tree::apply(&target.root, direction, cancel, &|done, total| {
                let mut guard = shown.lock();
                if guard.1.elapsed() >= EMIT_EVERY || done == total {
                    guard.0.bytes_done = done;
                    guard.0.bytes_total = total;
                    guard.1 = Instant::now();
                    publish(app, &guard.0);
                }
            })
        };
        match result {
            Ok(totals) => status.saved_bytes += totals.saved(),
            Err(error) => {
                status.error = Some(error);
                break;
            }
        }
        status.games_done += 1;
    }
    if cancel.load(Ordering::SeqCst) {
        return;
    }
    status.running = false;
    status.current_title = None;
    publish(app, &status);
    crate::services::storage::invalidate();
    crate::services::install_roots::forget_measurements();
}

/// Compresses or decompresses one title's folders for the download queue.
/// `progress(done, total)` reports bytes. Errors are logged, never fatal.
pub fn apply_to(
    roots: &[PathBuf],
    direction: Direction,
    cancel: &AtomicBool,
    progress: &(dyn Fn(u64, u64) + Sync),
) -> Totals {
    let mut sum = Totals::default();
    for root in roots {
        let _folder = FOLDER.lock();
        match tree::apply(root, direction, cancel, progress) {
            Ok(totals) => sum.add(totals),
            Err(error) => eprintln!("[orbit] compression of {} stopped: {error}", root.display()),
        }
    }
    sum
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compression_is_off_until_turned_on() {
        let repo = GameRepository::open_in_memory().unwrap();
        assert!(!enabled(&repo));
        repo.set_setting(SETTING, &json!({ "enabled": true }))
            .unwrap();
        assert!(enabled(&repo));
        assert!(status(&repo).enabled);
        repo.set_setting(SETTING, &json!({ "enabled": "yes" }))
            .unwrap();
        assert!(!enabled(&repo), "malformed values read as off");
    }
}
