//! Orbit's own updates (Tauri updater). Releases carry `latest.json` and an
//! `.app.tar.gz` signed with Orbit's updater key (`scripts/release-macos.sh`);
//! the plugin checks the signature against the public key in
//! `tauri.conf.json` before anything is installed. Nothing installs on its
//! own: the launch dialog asks, and installing restarts Orbit.
use crate::runtimes::manager::SetupProgress;
use crate::AppState;
use serde::Serialize;
use tauri::{ipc::Channel, AppHandle, Manager};
use tauri_plugin_updater::UpdaterExt;

/// A newer Orbit release, for the update dialog.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdate {
    pub version: String,
    pub current_version: String,
    /// Plain-text Markdown release notes.
    pub notes: String,
    pub published_at: Option<String>,
}

fn describe(update: &tauri_plugin_updater::Update) -> AppUpdate {
    AppUpdate {
        version: update.version.clone(),
        current_version: update.current_version.clone(),
        notes: crate::utils::release_notes::plain_text(update.body.as_deref()),
        published_at: update.date.map(|date| date.to_string()),
    }
}

/// The release the dialog offered must be the one installed: a newer one
/// published in between has notes the person has not seen.
fn same_release(offered: &str, found: &str) -> Result<(), String> {
    if offered == found {
        Ok(())
    } else {
        Err(format!(
            "Orbit {found} was published since this dialog opened. Restart Orbit to see it"
        ))
    }
}

/// A newer Orbit release, or `None` when Orbit is current.
#[tauri::command]
pub async fn app_update_check(app: AppHandle) -> Result<Option<AppUpdate>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater.check().await.map_err(|e| e.to_string())?;
    Ok(update.as_ref().map(describe))
}

/// Downloads, verifies and installs `version`, then restarts Orbit. Refused
/// while a game runs: restarting would leave it without Orbit.
#[tauri::command]
pub async fn app_update_install(
    app: AppHandle,
    version: String,
    on_progress: Channel<SetupProgress>,
) -> Result<(), String> {
    {
        let state = app.state::<AppState>();
        if state.sessions.get_active().is_some() || state.sessions.is_launching() {
            return Err("Quit the running game before updating Orbit".into());
        }
    }
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Orbit is already up to date")?;
    same_release(&version, &update.version)?;
    let component = format!("Orbit {}", update.version);
    let mut downloaded = 0u64;
    update
        .download_and_install(
            |chunk, total| {
                downloaded += chunk as u64;
                let _ = on_progress.send(SetupProgress::Downloading {
                    component: component.clone(),
                    downloaded_bytes: downloaded,
                    total_bytes: total.unwrap_or(0),
                });
            },
            || {
                let _ = on_progress.send(SetupProgress::Installing {
                    component: component.clone(),
                });
            },
        )
        .await
        .map_err(|e| e.to_string())?;
    let _ = on_progress.send(SetupProgress::Ready {
        component: component.clone(),
        message: "Restarting Orbit".into(),
    });
    app.restart()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn installs_only_the_release_the_dialog_showed() {
        assert!(same_release("2.6.1", "2.6.1").is_ok());
        let error = same_release("2.6.1", "2.6.2").unwrap_err();
        assert!(error.contains("Orbit 2.6.2 was published"));
    }
}
