//! Reads one app's progress from the Steam client's `logs/content_log.txt`.
//! The client logs every update step and the real totals there as they
//! happen, while its appmanifest byte counters often change only at the end.
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use regex::Regex;

/// Largest chunk read per poll, so a huge log cannot stall the watcher.
const READ_LIMIT: u64 = 512 * 1024;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum UpdateStep {
    #[default]
    Waiting,
    Preparing,
    Preallocating,
    Downloading,
    Verifying,
    Committing,
    Installed,
}

/// What the log has said about the app so far.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct UpdateLog {
    pub step: UpdateStep,
    /// Compressed bytes Steam fetches over the network.
    pub download_total: u64,
    /// Bytes Steam writes into `steamapps/downloading/<appid>`.
    pub stage_total: u64,
    pub failure: Option<String>,
}

impl UpdateLog {
    /// Applies one log line for `app_id`; other apps' lines are ignored.
    pub fn apply(&mut self, line: &str, app_id: &str) {
        let marker = format!("AppID {app_id} ");
        let Some(start) = line.find(&marker) else {
            return;
        };
        let text = &line[start + marker.len()..];
        if let Some(rest) = text.strip_prefix("update started : ") {
            self.download_total = total_of(rest, "download").unwrap_or(self.download_total);
            self.stage_total = total_of(rest, "stage").unwrap_or(self.stage_total);
            self.step = UpdateStep::Downloading;
            return;
        }
        if let Some(reason) = text
            .strip_prefix("update canceled : ")
            .or_else(|| text.strip_prefix("update failed : "))
        {
            self.failure = Some(reason.trim().to_string());
            return;
        }
        if text.starts_with("finished update") {
            self.step = UpdateStep::Installed;
            return;
        }
        if let Some(state) = text.strip_prefix("state changed : ") {
            if state.trim_end_matches(',') == "Fully Installed" {
                self.step = UpdateStep::Installed;
            }
            return;
        }
        let Some(flags) = text.strip_prefix("App update changed : ") else {
            return;
        };
        let next = if flags.contains("Committing") {
            UpdateStep::Committing
        } else if flags.contains("Verifying") {
            UpdateStep::Verifying
        } else if flags.contains("Downloading") || flags.contains("Staging") {
            UpdateStep::Downloading
        } else if flags.contains("Preallocating") {
            UpdateStep::Preallocating
        } else if flags.contains("Reconfiguring") || flags.contains("Validating") {
            UpdateStep::Preparing
        } else {
            return;
        };
        if self.step != UpdateStep::Installed {
            self.step = next;
        }
    }
}

/// `"download 0/129107072"` → `129107072`.
fn total_of(text: &str, name: &str) -> Option<u64> {
    let re = Regex::new(&format!(r"{name} \d+/(\d+)")).ok()?;
    re.captures(text)?.get(1)?.as_str().parse().ok()
}

/// Follows new lines appended to the client's content log.
pub struct ContentLog {
    path: PathBuf,
    offset: u64,
    partial: String,
}

impl ContentLog {
    /// Starts at the current end, so only this run's lines are read.
    pub fn from_end(path: &Path) -> Self {
        let offset = fs::metadata(path).map(|meta| meta.len()).unwrap_or(0);
        Self {
            path: path.to_path_buf(),
            offset,
            partial: String::new(),
        }
    }

    /// Complete lines written since the last call. A rotated (shorter) log
    /// is read from its start. Bounded to `READ_LIMIT` bytes per call.
    pub fn new_lines(&mut self) -> Vec<String> {
        let Ok(mut file) = fs::File::open(&self.path) else {
            return Vec::new();
        };
        let len = file.metadata().map(|meta| meta.len()).unwrap_or(0);
        if len < self.offset {
            self.offset = 0;
            self.partial.clear();
        }
        if len == self.offset || file.seek(SeekFrom::Start(self.offset)).is_err() {
            return Vec::new();
        }
        let mut chunk = Vec::new();
        let read = file.take(READ_LIMIT).read_to_end(&mut chunk).unwrap_or(0);
        self.offset += read as u64;
        self.partial.push_str(&String::from_utf8_lossy(&chunk));
        let mut lines: Vec<String> = self.partial.split('\n').map(str::to_string).collect();
        self.partial = lines.pop().unwrap_or_default();
        lines
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Lines from a real download of The Expendabros in an Orbit container.
    const RUN: &str = "\
[2026-11-17 18:56:37] AppID 312990 state changed : Update Required,Update Queued,Update Started,
[2026-11-17 18:56:37] AppID 312990 App update changed : Running Update,Reconfiguring,
[2026-11-17 18:56:39] AppID 312990 App update changed : Running Update,Preallocating,
[2026-11-17 18:56:39] AppID 312990 preallocated 44 files (634 MB)
[2026-11-17 18:56:39] AppID 312990 update started : download 0/129107072, store 0/0, reuse 0/0, delta 0/0, stage 0/669975131
[2026-11-17 18:56:39] AppID 312990 App update changed : Running Update,Downloading,Staging,
[2026-11-17 18:56:42] AppID 312990 App update changed : Running Update,Verifying Staged,
[2026-11-17 18:56:45] AppID 312990 App update changed : Running Update,Committing,
[2026-11-17 18:56:45] AppID 312990 state changed : Fully Installed,Update Queued,Update Running,
[2026-11-17 18:56:45] AppID 312990 finished update, 1 mounted depots (BuildID 413147) : 312991 (2085341841438002893),
";

    #[test]
    fn follows_each_step_of_a_real_steam_download() {
        let mut log = UpdateLog::default();
        let mut steps = Vec::new();
        for line in RUN.lines() {
            log.apply(line, "312990");
            if steps.last() != Some(&log.step) {
                steps.push(log.step);
            }
            if line.contains("update started") {
                assert_eq!(log.download_total, 129_107_072);
                assert_eq!(log.stage_total, 669_975_131);
            }
        }
        assert_eq!(
            steps,
            [
                UpdateStep::Waiting,
                UpdateStep::Preparing,
                UpdateStep::Preallocating,
                UpdateStep::Downloading,
                UpdateStep::Verifying,
                UpdateStep::Committing,
                UpdateStep::Installed,
            ]
        );
        assert!(log.failure.is_none());
    }

    #[test]
    fn ignores_other_apps_and_reports_why_steam_stopped() {
        let mut log = UpdateLog::default();
        log.apply(
            "[x] AppID 228980 App update changed : Running Update,Committing,",
            "312990",
        );
        assert_eq!(log.step, UpdateStep::Waiting);
        log.apply(
            "[x] AppID 312990 update canceled : Disk write failure (Disk full)",
            "312990",
        );
        assert_eq!(
            log.failure.as_deref(),
            Some("Disk write failure (Disk full)")
        );
    }

    #[test]
    fn reads_only_new_complete_lines_and_survives_rotation() {
        let path = std::env::temp_dir().join(format!("orbit-content-{}.txt", uuid::Uuid::new_v4()));
        fs::write(&path, "old line\n").unwrap();
        let mut log = ContentLog::from_end(&path);
        assert!(log.new_lines().is_empty());
        fs::write(&path, "old line\nfirst\nsec").unwrap();
        assert_eq!(log.new_lines(), ["first"]);
        fs::write(&path, "old line\nfirst\nsecond\n").unwrap();
        assert_eq!(log.new_lines(), ["second"]);
        fs::write(&path, "new\n").unwrap();
        assert_eq!(log.new_lines(), ["new"]);
        let _ = fs::remove_file(path);
    }
}
