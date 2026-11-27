//! What the download queue does around a Steam download besides downloading:
//! with game compression on, the game's files are decompressed before Steam
//! updates them and compressed again afterwards; after a repair, the game's
//! install scripts run again. Failures are logged and never fail the download.
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};

use crate::services::download_queue::QueuedDownload;
use crate::services::game_compression::{job, targets, tree::Direction};
use crate::services::{steam_client_download, steam_install_script, steam_windows};
use crate::AppState;

const EMIT_EVERY: Duration = Duration::from_millis(500);

fn key(item: &QueuedDownload) -> String {
    format!("steam:{}", item.app_id)
}

/// Compression on and the title installed: its folders, else none.
fn compressed_roots(app: &AppHandle, item: &QueuedDownload) -> Vec<PathBuf> {
    let state = app.state::<AppState>();
    if !job::enabled(&state.repo) {
        return Vec::new();
    }
    crate::commands::library::entries(&state)
        .map(|entries| targets::for_app(&entries, &item.app_id))
        .unwrap_or_default()
}

fn run(
    app: &AppHandle,
    item: &QueuedDownload,
    roots: &[PathBuf],
    direction: Direction,
    message: Option<&str>,
) {
    let shown = Mutex::new(None::<Instant>);
    let cancel = AtomicBool::new(false);
    job::apply_to(roots, direction, &cancel, &|done, total| {
        let Some(message) = message else { return };
        let mut at = shown.lock();
        if at.is_some_and(|at| at.elapsed() < EMIT_EVERY) && done != total {
            return;
        }
        *at = Some(Instant::now());
        steam_windows::emit_game_progress(
            app,
            &key(item),
            &item.title,
            json!({
                "phase": "Installing",
                "component": item.title,
                "message": message,
                "downloadedBytes": done,
                "totalBytes": total,
            }),
        );
    });
}

/// Before Steam writes: decompress an installed, compressed game so the
/// update patches plain files.
pub fn before_download(app: &AppHandle, item: &QueuedDownload) {
    let roots = compressed_roots(app, item);
    if !roots.is_empty() {
        run(
            app,
            item,
            &roots,
            Direction::Decompress,
            Some("Preparing game files"),
        );
    }
}

/// After Steam stops. A finished repair reruns the install scripts; a
/// finished download is compressed with progress and a final "Installed";
/// a stopped one is compressed quietly.
pub fn after_download(app: &AppHandle, item: &QueuedDownload, completed: bool, native: bool) {
    if completed && item.repair && !native {
        rerun_install_scripts(app, item);
    }
    let roots = compressed_roots(app, item);
    if !roots.is_empty() {
        let message = completed.then_some("Compressing game files");
        run(app, item, &roots, Direction::Compress, message);
    }
    if completed && (item.repair || !roots.is_empty()) {
        ready(app, item);
    }
}

fn ready(app: &AppHandle, item: &QueuedDownload) {
    let message = if item.repair { "Repaired" } else { "Installed" };
    let _ = app.emit(
        "steam-download-progress",
        json!({
            "key": key(item),
            "label": item.title,
            "done": true,
            "progress": { "phase": "Ready", "component": item.title, "message": message }
        }),
    );
}

fn rerun_install_scripts(app: &AppHandle, item: &QueuedDownload) {
    let state = app.state::<AppState>();
    let Some(wine) = steam_windows::play_wine_binary(&state.repo) else {
        return;
    };
    let Ok((prefix, _)) = steam_client_download::container_paths(&item.app_id) else {
        return;
    };
    if !crate::runtimes::containers::layout::prefix_ready(&prefix) {
        return;
    }
    let Some(dir) = steam_client_download::client_install_dir(&item.app_id) else {
        return;
    };
    steam_install_script::forget(&prefix);
    let mut progress = |step: &str| {
        let (_, detail) = crate::launching::progress::split_step(step);
        steam_windows::emit_game_progress(
            app,
            &key(item),
            &item.title,
            json!({
                "phase": "Installing",
                "component": item.title,
                "message": detail.unwrap_or("Running setup steps"),
            }),
        );
    };
    steam_install_script::run_pending(&wine, &prefix, &dir, &AtomicBool::new(false), &mut progress);
}
