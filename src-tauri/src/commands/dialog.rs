use std::path::PathBuf;

use rfd::FileDialog;
use serde::Deserialize;
use tauri::{AppHandle, Manager, WebviewWindow};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DialogFilter {
    name: String,
    extensions: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PickOpenOptions {
    title: Option<String>,
    #[serde(default)]
    filters: Vec<DialogFilter>,
    #[serde(default)]
    multiple: bool,
    #[serde(default)]
    directory: bool,
    default_path: Option<String>,
}

/// Native open panel that runs on the AppKit main thread (avoids NSOpenPanel NULL panics).
#[tauri::command]
pub async fn pick_open_path(
    app: AppHandle,
    window: WebviewWindow,
    options: PickOpenOptions,
) -> Result<Option<String>, String> {
    prepare_macos_for_dialog(&app)?;

    let window_for_parent = window.clone();
    let options_for_dialog = options.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        build_dialog(&window_for_parent, &options_for_dialog).pick()
    })
        .await
        .map_err(|err| err.to_string())??;

    if let Some(path) = &picked {
        allow_picked_path(&window, path, options.directory)?;
    }

    Ok(picked)
}

fn prepare_macos_for_dialog(app: &AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = std::sync::mpsc::sync_channel(1);
        app.run_on_main_thread(move || {
            crate::commands::window::activate_orbit_app();
            let _ = tx.send(());
        })
        .map_err(|err| err.to_string())?;
        rx.recv().map_err(|err| err.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
    }
    Ok(())
}

struct BuiltDialog {
    inner: FileDialog,
    directory: bool,
    multiple: bool,
}

impl BuiltDialog {
    fn pick(self) -> Result<Option<String>, String> {
        let path = if self.directory {
            if self.multiple {
                self.inner
                    .pick_folders()
                    .and_then(|paths| paths.into_iter().next())
            } else {
                self.inner.pick_folder()
            }
        } else if self.multiple {
            self.inner
                .pick_files()
                .and_then(|paths| paths.into_iter().next())
        } else {
            self.inner.pick_file()
        };

        Ok(path.map(|value| value.to_string_lossy().into_owned()))
    }
}

fn build_dialog(window: &WebviewWindow, options: &PickOpenOptions) -> BuiltDialog {
    let mut dialog = FileDialog::new().set_parent(window);

    if let Some(title) = &options.title {
        dialog = dialog.set_title(title);
    }

    if let Some(path) = options
        .default_path
        .as_ref()
        .filter(|value| !value.is_empty())
    {
        dialog = dialog.set_directory(path);
    }

    for filter in &options.filters {
        let extensions: Vec<&str> = filter.extensions.iter().map(String::as_str).collect();
        dialog = dialog.add_filter(&filter.name, &extensions);
    }

    BuiltDialog {
        inner: dialog,
        directory: options.directory,
        multiple: options.multiple,
    }
}

fn allow_picked_path(
    window: &WebviewWindow,
    path: &str,
    directory: bool,
) -> Result<(), String> {
    let path = PathBuf::from(path);
    let scopes = window.state::<tauri::scope::Scopes>();

    if directory {
        scopes
            .allow_directory(&path, true)
            .map_err(|err| err.to_string())?;
    } else {
        scopes.allow_file(&path).map_err(|err| err.to_string())?;
    }

    Ok(())
}
