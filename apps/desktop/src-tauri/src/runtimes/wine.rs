use super::{
    detection::{probe, WineInstallation},
    prefix, process, settings, validation, RuntimeAdapter, RuntimeProcess, WineProfile,
};
use anyhow::{bail, Context, Result};
use std::{
    fs,
    path::{Path, PathBuf},
    process::{Child, Command},
    sync::atomic::AtomicBool,
    time::Duration,
};

pub struct WineAdapter;
impl RuntimeAdapter for WineAdapter {
    type Configuration = WineProfile;
    fn launch(
        &self,
        profile: &WineProfile,
        game_id: &str,
        root: &Path,
        cancel: &AtomicBool,
    ) -> Result<Box<dyn RuntimeProcess>> {
        profile.validate_options()?;
        let executable = validation::windows_executable(Path::new(&profile.executable))?;
        let runtime = probe(Path::new(&profile.runtime_path))?;
        let dir = prefix::game_directory(root, game_id)?;
        let log = process::log_file(&dir.join("latest.log"))?;
        let prefix = prefix::prepare(&dir, &runtime, cancel, &log)?;
        apply_prefix_settings(&runtime, &prefix, profile, cancel, &log)?;
        let graphics = setup_graphics(&prefix, profile.effective.graphics, &profile.selections)
            .unwrap_or_else(|error| {
                // Log but do not silently fail: the validation step already
                // rejected unavailable backends, so an error here is unexpected.
                eprintln!("Orbit graphics setup warning: {error}");
                GraphicsSetup::default()
            });
        if cancel.load(std::sync::atomic::Ordering::Relaxed) {
            bail!("Launch cancelled");
        }
        let mut profile = profile.clone();
        if !graphics.overrides.is_empty() {
            let existing = profile
                .environment
                .entry("WINEDLLOVERRIDES".into())
                .or_default();
            if !existing.is_empty() {
                *existing = format!("{existing};{}", graphics.overrides);
            } else {
                *existing = graphics.overrides;
            }
        }
        if let Some(dll_path) = graphics.dll_path {
            // Applied after profile validation. This is the installed component
            // directory, not a user-supplied path.
            profile.environment.insert("WINEDLLPATH".into(), dll_path);
        }
        let child = process::spawn_logged(
            &mut game_command(Path::new(&runtime.path), &prefix, &executable, &profile),
            &log,
        )?;
        Ok(Box::new(WineProcess {
            child,
            waiter: None,
            runtime,
            prefix,
            code: None,
            finished: false,
        }))
    }
}
fn apply_prefix_settings(
    runtime: &WineInstallation,
    prefix: &Path,
    profile: &WineProfile,
    cancel: &AtomicBool,
    log: &std::sync::Arc<std::sync::Mutex<std::fs::File>>,
) -> Result<()> {
    for operation in profile.effective.registry_adds() {
        let mut command = process::command(Path::new(&runtime.path), prefix);
        command.arg("reg").arg("add").args(operation).arg("/f");
        let mut child = process::spawn_logged(&mut command, log)?;
        if !process::wait_bounded(&mut child, Duration::from_secs(15), cancel)?.success() {
            bail!("Could not apply the game's compatibility display settings");
        }
    }
    Ok(())
}

pub fn game_command(
    runtime: &Path,
    prefix: &Path,
    executable: &Path,
    profile: &WineProfile,
) -> Command {
    let mut cmd = process::command(runtime, prefix);
    cmd.arg(executable)
        .args(&profile.arguments)
        .envs(&profile.environment);
    if let Some(parent) = executable.parent() {
        cmd.current_dir(parent);
    }
    cmd
}
struct WineProcess {
    child: Child,
    waiter: Option<Child>,
    runtime: WineInstallation,
    prefix: PathBuf,
    code: Option<i32>,
    finished: bool,
}
impl RuntimeProcess for WineProcess {
    fn pid(&self) -> u32 {
        self.child.id()
    }
    fn poll(&mut self) -> Result<Option<i32>> {
        if self.code.is_none() {
            let Some(status) = self.child.try_wait()? else {
                return Ok(None);
            };
            // A launcher can exit after spawning the game. The dedicated prefix's
            // server is the lifetime boundary, not the initial loader PID.
            self.waiter = Some(
                process::command(Path::new(&self.runtime.server_path), &self.prefix)
                    .arg("-w")
                    .spawn()?,
            );
            self.code = Some(status.code().unwrap_or(-1));
        }
        if let Some(waiter) = self.waiter.as_mut() {
            match waiter.try_wait()? {
                None => return Ok(None),
                Some(status) if !status.success() => {
                    bail!("Wine server monitoring failed; stop the session before retrying")
                }
                Some(_) => {}
            }
        }
        self.finished = true;
        Ok(self.code)
    }
    fn stop(&mut self) -> Result<()> {
        if self.finished {
            return Ok(());
        }
        stop_prefix(&self.runtime, &self.prefix)?;
        let _ = self.child.kill();
        let _ = self.child.wait();
        if let Some(waiter) = self.waiter.as_mut() {
            let _ = waiter.kill();
            let _ = waiter.wait();
        }
        self.finished = true;
        Ok(())
    }
}
impl Drop for WineProcess {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

pub fn stop_prefix(runtime: &WineInstallation, prefix: &Path) -> Result<()> {
    let cancel = AtomicBool::new(false);
    for signal in ["-k15", "-k"] {
        let mut kill = process::command(Path::new(&runtime.server_path), prefix)
            .arg(signal)
            .spawn()?;
        if !process::wait_bounded(&mut kill, Duration::from_secs(3), &cancel)?.success() {
            bail!("Wine server refused to stop");
        }
        let mut wait = process::command(Path::new(&runtime.server_path), prefix)
            .arg("-w")
            .spawn()?;
        if process::wait_bounded(&mut wait, Duration::from_secs(3), &cancel).is_ok() {
            return Ok(());
        }
    }
    bail!("The game environment has not stopped; retry Stop before another launch")
}

#[derive(Default)]
pub(crate) struct GraphicsSetup {
    overrides: String,
    /// Directory Wine should search for builtin DXMT libraries (`x86_64-windows`
    /// and `x86_64-unix`). Empty when the backend only copies native DLLs.
    dll_path: Option<String>,
}

/// Configure the prefix for the selected graphics backend. Copies translation
/// DLLs into the Wine prefix and returns WINEDLLOVERRIDES entries that must be
/// merged into the launch environment. Payload paths come from the resolved
/// active-version selections, so the version the user picked is the one used.
pub fn setup_graphics(
    prefix: &Path,
    backend: settings::GraphicsBackend,
    selections: &std::collections::BTreeMap<String, String>,
) -> Result<GraphicsSetup> {
    match backend {
        settings::GraphicsBackend::Dxvk => {
            install_dlls(
                prefix,
                &selected(selections, "dxvk")?,
                &["d3d11.dll", "d3d10core.dll", "dxgi.dll"],
            )?;
            Ok(GraphicsSetup {
                overrides: "d3d11=n;dxgi=n;d3d10core=n".into(),
                dll_path: None,
            })
        }
        settings::GraphicsBackend::Dxmt => {
            let source = selected(selections, "dxmt")?;
            if source.join("x86_64-windows/d3d11.dll").is_file() {
                // Upstream builtin archives belong on WINEDLLPATH so Wine also
                // loads x86_64-unix/winemetal.so. Copying only the PE DLLs into
                // system32 drops that library.
                return Ok(GraphicsSetup {
                    overrides: "d3d11=b;dxgi=b;d3d10core=b".into(),
                    dll_path: Some(source.to_string_lossy().into_owned()),
                });
            }
            install_dlls(prefix, &source, &["d3d11.dll", "dxgi.dll"])?;
            Ok(GraphicsSetup {
                overrides: "d3d11=n;dxgi=n".into(),
                dll_path: None,
            })
        }
        settings::GraphicsBackend::D3dmetal => {
            // D3DMetal's runtime DLLs ship inside the Apple evaluation payload
            // and must be present in the prefix; the frameworks stay where they
            // were installed and are reached through the Wine build's rpath.
            let payload = selected(selections, "gptk")?;
            install_payload_dlls(
                prefix,
                &payload,
                &[
                    "d3d11.dll",
                    "d3d10core.dll",
                    "d3d12.dll",
                    "d3d12core.dll",
                    "dxgi.dll",
                ],
            )?;
            Ok(GraphicsSetup {
                overrides: "d3d11=n;d3d10core=n;d3d12=n;d3d12core=n;dxgi=n".into(),
                dll_path: None,
            })
        }
        settings::GraphicsBackend::Auto | settings::GraphicsBackend::Wine => {
            Ok(GraphicsSetup::default())
        }
    }
}

fn selected(selections: &std::collections::BTreeMap<String, String>, id: &str) -> Result<PathBuf> {
    selections.get(id).map(PathBuf::from).with_context(|| {
        format!(
            "The {id} component is not installed. Install it from Compatibility components first"
        )
    })
}

/// Copy translation DLLs from a downloaded component's x64/x32 layout.
fn install_dlls(prefix: &Path, source_dir: &Path, dlls: &[&str]) -> Result<()> {
    let system32 = prefix.join("drive_c/windows/system32");
    let syswow64 = prefix.join("drive_c/windows/syswow64");
    fs::create_dir_all(&system32)?;
    fs::create_dir_all(&syswow64)?;
    let mut copied = 0usize;
    for dll in dlls {
        for (architecture, destination) in [("x64", &system32), ("x32", &syswow64)] {
            let source = source_dir.join(format!("{architecture}/{dll}"));
            if source.is_file() {
                fs::copy(&source, destination.join(dll))
                    .with_context(|| format!("Cannot install {dll} ({architecture})"))?;
                copied += 1;
            }
        }
    }
    if copied == 0 {
        bail!(
            "The component at {} has no DLLs to install. Reinstall it or choose another version",
            source_dir.display()
        );
    }
    Ok(())
}

/// Copy D3DMetal's Windows runtime libraries from an Apple evaluation payload,
/// whose layout is `redist/lib/wine/x86_64-windows/*.dll` rather than x64/x32.
fn install_payload_dlls(prefix: &Path, payload: &Path, dlls: &[&str]) -> Result<()> {
    let candidates = [
        payload.join("redist/lib/wine/x86_64-windows"),
        payload.join("lib/wine/x86_64-windows"),
    ];
    let directory = candidates
        .iter()
        .find(|directory| directory.is_dir())
        .with_context(|| {
            format!(
                "The Game Porting Toolkit payload at {} has no Windows runtime libraries. Import the evaluation environment instead",
                payload.display()
            )
        })?;
    let system32 = prefix.join("drive_c/windows/system32");
    let syswow64 = prefix.join("drive_c/windows/syswow64");
    fs::create_dir_all(&system32)?;
    fs::create_dir_all(&syswow64)?;
    let mut copied = 0usize;
    for dll in dlls {
        let source = directory.join(dll);
        if source.is_file() {
            fs::copy(&source, system32.join(dll))
                .with_context(|| format!("Cannot install {dll}"))?;
            // The 32-bit directory shares the same translation libraries.
            let _ = fs::copy(&source, syswow64.join(dll));
            copied += 1;
        }
    }
    if copied == 0 {
        bail!(
            "The Game Porting Toolkit payload at {} contains no D3DMetal runtime DLLs. Import a newer package",
            payload.display()
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    #[test]
    fn dxmt_builtin_package_is_loaded_from_its_own_directory() {
        let root = std::env::temp_dir().join(format!("orbit-dxmt-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("x86_64-windows")).unwrap();
        fs::create_dir_all(root.join("x86_64-unix")).unwrap();
        fs::write(root.join("x86_64-windows/d3d11.dll"), b"d3d11").unwrap();
        fs::write(root.join("x86_64-unix/winemetal.so"), b"metal").unwrap();
        let mut selections = BTreeMap::new();
        selections.insert("dxmt".into(), root.to_string_lossy().into_owned());
        let setup = setup_graphics(
            Path::new("/tmp/orbit-unused-prefix"),
            settings::GraphicsBackend::Dxmt,
            &selections,
        )
        .unwrap();
        assert_eq!(setup.overrides, "d3d11=b;dxgi=b;d3d10core=b");
        assert_eq!(setup.dll_path.as_deref(), Some(root.to_str().unwrap()));
        let _ = fs::remove_dir_all(root);
    }
}
