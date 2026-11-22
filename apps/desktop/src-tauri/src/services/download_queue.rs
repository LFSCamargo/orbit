//! FIFO queue for Steam game downloads. SteamCMD runs one download at a time;
//! the rest wait in order. The queue is saved in settings so it survives a
//! restart; restored items come back paused so nothing starts on its own.
//! Losing the network stops the running title and holds the queue; the
//! network monitor resumes it once the Mac is back online.
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};

use crate::database::GameRepository;
use crate::services::steam_download::valid_app_id;
use crate::services::steam_windows::{self, DownloadOutcome};
use crate::AppState;

const QUEUE_KEY: &str = "download-queue-v1";
const SIZES_KEY: &str = "steam-download-sizes-v1";
pub const QUEUE_EVENT: &str = "download-queue-changed";
/// Upper bound so a corrupted settings row cannot grow the queue without limit.
const QUEUE_LIMIT: usize = 200;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DownloadProvider {
    #[default]
    Steam,
    MsStore,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueuedDownload {
    pub app_id: String,
    pub title: String,
    #[serde(default)]
    pub cover_url: Option<String>,
    #[serde(default)]
    pub paused: bool,
    #[serde(default)]
    pub provider: DownloadProvider,
}

fn valid_download_id(provider: DownloadProvider, id: &str) -> bool {
    match provider {
        DownloadProvider::Steam => valid_app_id(id),
        DownloadProvider::MsStore => orbit_msstore::valid_product_id(id),
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadQueue {
    pub active: Option<QueuedDownload>,
    pub pending: VecDeque<QueuedDownload>,
    /// The Mac is offline: nothing starts until the network is back.
    #[serde(default)]
    pub waiting_for_network: bool,
}

impl DownloadQueue {
    fn position(&self, app_id: &str) -> Option<usize> {
        self.pending.iter().position(|item| item.app_id == app_id)
    }

    fn is_active(&self, app_id: &str) -> bool {
        self.active
            .as_ref()
            .is_some_and(|item| item.app_id == app_id)
    }

    /// Adds a title at the back. A paused copy already waiting is resumed in
    /// place instead of duplicated. Returns false when nothing changed.
    pub fn enqueue(&mut self, item: QueuedDownload) -> bool {
        if self.is_active(&item.app_id) {
            return false;
        }
        if let Some(index) = self.position(&item.app_id) {
            let waiting = &mut self.pending[index];
            let changed = waiting.paused;
            waiting.paused = false;
            return changed;
        }
        if self.pending.len() >= QUEUE_LIMIT {
            return false;
        }
        self.pending.push_back(QueuedDownload {
            paused: false,
            ..item
        });
        true
    }

    /// Drops a waiting title. The active one is stopped through `cancel`.
    pub fn remove(&mut self, app_id: &str) -> bool {
        match self.position(app_id) {
            Some(index) => self.pending.remove(index).is_some(),
            None => false,
        }
    }

    /// Moves a waiting title to the front and clears its pause.
    pub fn move_to_front(&mut self, app_id: &str) -> bool {
        let Some(index) = self.position(app_id) else {
            return false;
        };
        let Some(mut item) = self.pending.remove(index) else {
            return false;
        };
        item.paused = false;
        self.pending.push_front(item);
        true
    }

    /// Starts the first title that is not paused.
    pub fn take_next(&mut self) -> Option<QueuedDownload> {
        if self.active.is_some() || self.waiting_for_network {
            return None;
        }
        let index = self.pending.iter().position(|item| !item.paused)?;
        let item = self.pending.remove(index)?;
        self.active = Some(item.clone());
        Some(item)
    }

    /// Clears the active slot. A paused title goes back to the front; one
    /// stopped by the network goes back unpaused, to resume on its own.
    pub fn finish_active(&mut self, outcome: Option<DownloadOutcome>) {
        let Some(mut item) = self.active.take() else {
            return;
        };
        match outcome {
            Some(DownloadOutcome::Paused) => {
                item.paused = true;
                self.pending.push_front(item);
            }
            Some(DownloadOutcome::Offline) => self.pending.push_front(item),
            _ => {}
        }
    }

    pub fn has_runnable(&self) -> bool {
        !self.waiting_for_network && self.pending.iter().any(|item| !item.paused)
    }

    /// Something is downloading or will once the network allows it.
    pub fn has_work(&self) -> bool {
        self.active.is_some() || self.pending.iter().any(|item| !item.paused)
    }

    /// Records the network state. Returns true when it changed.
    pub fn set_online(&mut self, online: bool) -> bool {
        let changed = self.waiting_for_network == online;
        self.waiting_for_network = !online;
        changed
    }

    /// The persisted form: everything still to do, all paused.
    fn saved(&self) -> Vec<QueuedDownload> {
        self.active
            .iter()
            .chain(self.pending.iter())
            .map(|item| QueuedDownload {
                paused: true,
                ..item.clone()
            })
            .collect()
    }

    fn restore(items: Vec<QueuedDownload>) -> Self {
        let mut queue = Self::default();
        for item in items
            .into_iter()
            .filter(|item| valid_download_id(item.provider, &item.app_id))
            .take(QUEUE_LIMIT)
        {
            if queue.position(&item.app_id).is_none() {
                queue.pending.push_back(QueuedDownload {
                    paused: true,
                    ..item
                });
            }
        }
        queue
    }
}

static QUEUE: Mutex<DownloadQueue> = Mutex::new(DownloadQueue {
    active: None,
    pending: VecDeque::new(),
    waiting_for_network: false,
});
static WORKER: AtomicBool = AtomicBool::new(false);

/// Restores the saved queue once at startup.
pub fn restore(repo: &GameRepository) {
    let items = repo
        .get_setting(QUEUE_KEY)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value::<Vec<QueuedDownload>>(value).ok())
        .unwrap_or_default();
    let mut queue = QUEUE.lock();
    let waiting = queue.waiting_for_network;
    *queue = DownloadQueue::restore(items);
    queue.waiting_for_network = waiting;
}

pub fn snapshot() -> DownloadQueue {
    QUEUE.lock().clone()
}

pub fn enqueue(app: &AppHandle, item: QueuedDownload) -> Result<(), String> {
    if !valid_download_id(item.provider, &item.app_id) {
        return Err(match item.provider {
            DownloadProvider::Steam => "Steam app id must be a number".into(),
            DownloadProvider::MsStore => {
                "Microsoft Store product id must be 12 alphanumeric characters".into()
            }
        });
    }
    let changed = QUEUE.lock().enqueue(item);
    if changed {
        changed_queue(app);
    }
    ensure_worker(app);
    Ok(())
}

fn active_provider() -> Option<DownloadProvider> {
    QUEUE.lock().active.as_ref().map(|item| item.provider)
}

pub fn remove(app: &AppHandle, app_id: &str) {
    let active_match = {
        let queue = QUEUE.lock();
        queue
            .active
            .as_ref()
            .filter(|item| item.app_id == app_id)
            .map(|item| item.provider)
    };
    if let Some(provider) = active_match {
        match provider {
            DownloadProvider::Steam => steam_windows::cancel_download(),
            DownloadProvider::MsStore => crate::services::msstore_download::cancel_download(),
        }
        return;
    }
    if QUEUE.lock().remove(app_id) {
        changed_queue(app);
    }
}

/// Runs a waiting title next. The running one is paused and waits behind it.
pub fn start_now(app: &AppHandle, app_id: &str) {
    let moved = QUEUE.lock().move_to_front(app_id);
    if !moved {
        return;
    }
    changed_queue(app);
    if let Some(provider) = active_provider() {
        match provider {
            DownloadProvider::Steam => steam_windows::pause_download(),
            DownloadProvider::MsStore => crate::services::msstore_download::pause_download(),
        }
    }
    ensure_worker(app);
}

pub fn pause_active() {
    match active_provider() {
        Some(DownloadProvider::MsStore) => crate::services::msstore_download::pause_download(),
        _ => steam_windows::pause_download(),
    }
}

pub fn has_work() -> bool {
    QUEUE.lock().has_work()
}

/// Called by the network monitor when the Mac goes offline or comes back.
/// Offline stops the running title (it waits at the front, unpaused);
/// online starts the queue again. Steam resumes from its partial download.
pub fn network_changed(app: &AppHandle, online: bool) {
    let (changed, active) = {
        let mut queue = QUEUE.lock();
        (queue.set_online(online), queue.active.as_ref().map(|i| i.provider))
    };
    if !changed {
        return;
    }
    changed_queue(app);
    if online {
        ensure_worker(app);
    } else if let Some(provider) = active {
        match provider {
            DownloadProvider::Steam => steam_windows::stop_for_network(),
            DownloadProvider::MsStore => crate::services::msstore_download::stop_for_network(),
        }
    }
}

pub fn is_queued(app_id: &str) -> bool {
    let queue = QUEUE.lock();
    queue.is_active(app_id) || queue.position(app_id).is_some()
}

/// Download sizes SteamCMD reported, keyed by app id.
pub fn download_sizes(repo: &GameRepository) -> std::collections::HashMap<String, i64> {
    repo.get_setting(SIZES_KEY)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

pub fn forget_download_size(repo: &GameRepository, app_id: &str) {
    let mut sizes = download_sizes(repo);
    if sizes.remove(app_id).is_some() {
        let _ = repo.set_setting(SIZES_KEY, &json!(sizes));
    }
}

fn record_download_size(repo: &GameRepository, app_id: &str, bytes: i64) {
    let mut sizes = download_sizes(repo);
    sizes.insert(app_id.to_string(), bytes);
    let _ = repo.set_setting(SIZES_KEY, &json!(sizes));
}

fn changed_queue(app: &AppHandle) {
    let queue = snapshot();
    let state = app.state::<AppState>();
    let _ = state.repo.set_setting(QUEUE_KEY, &json!(queue.saved()));
    let _ = app.emit(QUEUE_EVENT, &queue);
}

fn ensure_worker(app: &AppHandle) {
    if !QUEUE.lock().has_runnable() {
        return;
    }
    if WORKER
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || run_worker(&app));
}

/// Drains runnable titles one at a time. O(n) over the queue per item.
fn run_worker(app: &AppHandle) {
    loop {
        let next = QUEUE.lock().take_next();
        let Some(item) = next else {
            WORKER.store(false, Ordering::SeqCst);
            // An enqueue may have landed between the take and the store.
            if QUEUE.lock().has_runnable()
                && WORKER
                    .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
                    .is_ok()
            {
                continue;
            }
            return;
        };
        changed_queue(app);
        let outcome = run_one(app, &item);
        QUEUE.lock().finish_active(outcome);
        changed_queue(app);
    }
}

fn run_one(app: &AppHandle, item: &QueuedDownload) -> Option<DownloadOutcome> {
    let state = app.state::<AppState>();
    let (event_name, key) = match item.provider {
        DownloadProvider::Steam => ("steam-download-progress", format!("steam:{}", item.app_id)),
        DownloadProvider::MsStore => (
            crate::services::msstore_download::PROGRESS_EVENT,
            crate::services::msstore_catalog::stable_key(&item.app_id),
        ),
    };
    let busy = state.sessions.get_active().is_some() || state.sessions.is_launching();
    let result = match item.provider {
        DownloadProvider::Steam => {
            if busy {
                Err("Close your game first. Downloads use Steam, which the game is using now."
                    .into())
            } else {
                steam_windows::download(app, &state.repo, &item.app_id, &item.title)
            }
        }
        DownloadProvider::MsStore => {
            let session_dir =
                crate::services::msstore_auth::session_dir(&crate::utils::paths::app_data_dir());
            crate::services::msstore_download::download(
                app,
                &state.repo,
                &state.metadata_cache,
                &session_dir,
                &item.app_id,
                &item.title,
            )
        }
    };
    match result {
        Ok(DownloadOutcome::Completed) => {
            match item.provider {
                DownloadProvider::Steam => {
                    if let Some(bytes) = steam_windows::last_download_total() {
                        record_download_size(&state.repo, &item.app_id, bytes);
                    }
                    if let Err(error) =
                        steam_windows::register_download(&state.repo, &item.app_id)
                    {
                        eprintln!(
                            "[orbit] could not register download {}: {error}",
                            item.app_id
                        );
                    }
                }
                DownloadProvider::MsStore => {
                    if let Some(bytes) = crate::services::msstore_download::last_download_total() {
                        record_download_size(&state.repo, &item.app_id, bytes);
                    }
                }
            }
            crate::services::storage::invalidate();
            crate::services::install_roots::forget_measurements();
            let _ = app.emit("steam-library-updated", ());
            if item.provider == DownloadProvider::MsStore {
                let _ = app.emit("msstore-library-updated", ());
            }
            Some(DownloadOutcome::Completed)
        }
        Ok(outcome) => {
            let _ = app.emit(
                event_name,
                json!({ "key": key, "label": item.title, "done": true, "stopped": true }),
            );
            Some(outcome)
        }
        // Downloads fail in many ways when the network drops mid-step; while
        // offline that is a stop to resume, not an error to show.
        Err(_) if !crate::services::network_monitor::online() => {
            let _ = app.emit(
                event_name,
                json!({ "key": key, "label": item.title, "done": true, "stopped": true }),
            );
            Some(DownloadOutcome::Offline)
        }
        Err(error) => {
            let _ = app.emit(
                event_name,
                json!({ "key": key, "label": item.title, "done": true, "error": error }),
            );
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(app_id: &str) -> QueuedDownload {
        QueuedDownload {
            app_id: app_id.into(),
            title: format!("Game {app_id}"),
            cover_url: None,
            paused: false,
            provider: DownloadProvider::Steam,
        }
    }

    #[test]
    fn restores_legacy_v1_steam_queue_and_mixed_msstore_items() {
        let legacy: Vec<QueuedDownload> =
            serde_json::from_str(r#"[{"appId":"570","title":"Dota 2"}]"#).unwrap();
        assert_eq!(legacy[0].provider, DownloadProvider::Steam);

        let mut items = legacy;
        items.push(QueuedDownload {
            app_id: "9P8LR42PTRGJ".into(),
            title: "33 Immortals".into(),
            cover_url: None,
            paused: false,
            provider: DownloadProvider::MsStore,
        });
        items.push(QueuedDownload {
            app_id: "../bad".into(),
            title: "Bad".into(),
            cover_url: None,
            paused: false,
            provider: DownloadProvider::MsStore,
        });
        let restored = DownloadQueue::restore(items);
        assert_eq!(ids(&restored), ["570", "9P8LR42PTRGJ"]);
        assert_eq!(restored.pending[1].provider, DownloadProvider::MsStore);
    }

    fn ids(queue: &DownloadQueue) -> Vec<&str> {
        queue
            .pending
            .iter()
            .map(|item| item.app_id.as_str())
            .collect()
    }

    #[test]
    fn runs_titles_in_the_order_they_were_added() {
        let mut queue = DownloadQueue::default();
        assert!(queue.enqueue(item("10")));
        assert!(queue.enqueue(item("20")));
        assert!(!queue.enqueue(item("10")));
        assert_eq!(queue.take_next().unwrap().app_id, "10");
        assert!(queue.take_next().is_none(), "one download at a time");
        assert!(
            !queue.enqueue(item("10")),
            "the active title is not queued twice"
        );
        queue.finish_active(Some(DownloadOutcome::Completed));
        assert_eq!(queue.take_next().unwrap().app_id, "20");
    }

    #[test]
    fn removes_and_reorders_waiting_titles() {
        let mut queue = DownloadQueue::default();
        for id in ["1", "2", "3"] {
            queue.enqueue(item(id));
        }
        assert!(queue.move_to_front("3"));
        assert_eq!(ids(&queue), ["3", "1", "2"]);
        assert!(queue.remove("1"));
        assert!(!queue.remove("1"));
        assert_eq!(ids(&queue), ["3", "2"]);
    }

    #[test]
    fn a_paused_download_waits_at_the_front_until_resumed() {
        let mut queue = DownloadQueue::default();
        queue.enqueue(item("1"));
        queue.enqueue(item("2"));
        queue.take_next();
        queue.finish_active(Some(DownloadOutcome::Paused));
        assert_eq!(ids(&queue), ["1", "2"]);
        assert!(queue.pending[0].paused);
        assert_eq!(
            queue.take_next().unwrap().app_id,
            "2",
            "paused titles are skipped"
        );
        queue.finish_active(Some(DownloadOutcome::Completed));
        assert!(!queue.has_runnable());
        assert!(queue.enqueue(item("1")), "enqueueing again resumes it");
        assert_eq!(queue.take_next().unwrap().app_id, "1");
    }

    #[test]
    fn cancelled_and_failed_downloads_leave_the_queue() {
        let mut queue = DownloadQueue::default();
        queue.enqueue(item("1"));
        queue.take_next();
        queue.finish_active(Some(DownloadOutcome::Cancelled));
        queue.enqueue(item("2"));
        queue.take_next();
        queue.finish_active(None);
        assert!(queue.active.is_none());
        assert!(queue.pending.is_empty());
    }

    #[test]
    fn going_offline_holds_the_queue_and_requeues_the_active_title_unpaused() {
        let mut queue = DownloadQueue::default();
        queue.enqueue(item("1"));
        queue.enqueue(item("2"));
        queue.take_next();
        assert!(queue.set_online(false));
        assert!(!queue.set_online(false), "no change the second time");
        queue.finish_active(Some(DownloadOutcome::Offline));
        assert_eq!(ids(&queue), ["1", "2"]);
        assert!(!queue.pending[0].paused, "it resumes on its own");
        assert!(queue.take_next().is_none(), "nothing starts offline");
        assert!(!queue.has_runnable());
        assert!(queue.has_work(), "the probe keeps watching");
        assert!(queue.set_online(true));
        assert_eq!(queue.take_next().unwrap().app_id, "1");
    }

    #[test]
    fn paused_titles_alone_are_not_work_for_the_network_probe() {
        let mut queue = DownloadQueue::default();
        assert!(!queue.has_work());
        queue.enqueue(item("1"));
        queue.take_next();
        queue.finish_active(Some(DownloadOutcome::Paused));
        assert!(!queue.has_work());
    }

    #[test]
    fn a_restored_queue_is_paused_valid_and_unique() {
        let mut queue = DownloadQueue::default();
        queue.enqueue(item("1"));
        queue.enqueue(item("2"));
        queue.take_next();
        let mut saved = queue.saved();
        saved.push(item("../9"));
        saved.push(item("2"));
        let restored = DownloadQueue::restore(saved);
        assert_eq!(ids(&restored), ["1", "2"]);
        assert!(restored.pending.iter().all(|item| item.paused));
        assert!(restored.active.is_none());
    }
}
