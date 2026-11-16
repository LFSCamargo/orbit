use super::{
    detection::{probe, WineInstallation},
    prefix, process, settings, validation, RuntimeAdapter, RuntimeProcess, WineProfile,
};
use anyhow::{bail, Context, Result};
use std::{
    fs,
    path::{Path, PathBuf},
    process::{Child, Command},
    sync::{atomic::AtomicBool, Arc, Mutex},
    time::Duration,
};

pub struct PreparedWineLaunch {
    pub runtime: WineInstallation,
    pub prefix: PathBuf,
    pub profile: WineProfile,
    pub executable: PathBuf,
    pub log: Arc<Mutex<fs::File>>,
    pub shared: bool,
}

/// Spawn a process handle for a prefix Orbit does not own the lifecycle of
/// (GameHub containers). Exit is still bounded by that prefix's wineserver and
/// `stop` terminates the whole prefix — the same semantics GameHub itself uses
/// when stopping a game.
pub(crate) fn foreign_process(
    child: Child,
    runtime: WineInstallation,
    prefix: PathBuf,
) -> Box<dyn RuntimeProcess> {
    Box::new(WineProcess {
        child,
        waiter: None,
        runtime,
        prefix,
        shared: false,
        code: None,
        finished: false,
    })
}

pub struct WineAdapter;
impl WineAdapter {
    pub fn prepare<F: FnMut(&str)>(
        &self,
        profile: &WineProfile,
        game_id: &str,
        root: &Path,
        cancel: &AtomicBool,
        progress: &mut F,
    ) -> Result<PreparedWineLaunch> {
        progress("resolve");
        profile.validate_options()?;
        let executable = validation::windows_executable(Path::new(&profile.executable))?;
        progress("runtime");
        let runtime = probe(Path::new(&profile.runtime_path))?;
        let dir = prefix::game_directory(root, game_id)?;
        let log = process::log_file(&dir.join("latest.log"))?;
        progress("prefix");
        let shared = profile.shared_prefix.as_deref().map(Path::new);
        let prefix = if let Some(shared) = shared {
            prefix::accept_shared(shared, shared)?
        } else {
            prefix::prepare(&dir, &runtime, cancel, &log)?
        };
        progress("graphics");
        apply_prefix_settings(&runtime, &prefix, profile, cancel, &log)?;
        let graphics = setup_graphics(&prefix, profile.effective.graphics, &profile.selections)
            .context("Could not configure the selected graphics backend")?;
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
        Ok(PreparedWineLaunch {
            runtime,
            prefix,
            profile,
            executable,
            log,
            shared: shared.is_some(),
        })
    }

    pub fn launch_with_progress<F: FnMut(&str)>(
        &self,
        profile: &WineProfile,
        game_id: &str,
        root: &Path,
        cancel: &AtomicBool,
        progress: &mut F,
    ) -> Result<Box<dyn RuntimeProcess>> {
        let prepared = self.prepare(profile, game_id, root, cancel, progress)?;
        progress("spawn");
        let child = process::spawn_logged(
            &mut game_command(
                Path::new(&prepared.runtime.path),
                &prepared.prefix,
                &prepared.executable,
                &prepared.profile,
            ),
            &prepared.log,
        )?;
        Ok(Box::new(WineProcess {
            child,
            waiter: None,
            runtime: prepared.runtime,
            prefix: prepared.prefix,
            shared: prepared.shared,
            code: None,
            finished: false,
        }))
    }
}
impl RuntimeAdapter for WineAdapter {
    type Configuration = WineProfile;
    fn launch(
        &self,
        profile: &WineProfile,
        game_id: &str,
        root: &Path,
        cancel: &AtomicBool,
    ) -> Result<Box<dyn RuntimeProcess>> {
        self.launch_with_progress(profile, game_id, root, cancel, &mut |_| {})
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
    shared: bool,
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
            self.code = Some(status.code().unwrap_or(-1));
            if self.shared {
                // Silent Steam stays in the prefix. The launched executable is
                // the session lifetime; stop() then shuts Steam down.
                return Ok(self.code);
            }
            // A launcher can exit after spawning the game. The dedicated prefix's
            // server is the lifetime boundary, not the initial loader PID.
            self.waiter = Some(
                process::command(Path::new(&self.runtime.server_path), &self.prefix)
                    .arg("-w")
                    .spawn()?,
            );
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
        if !self.shared {
            stop_prefix(&self.runtime, &self.prefix)?;
        }
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
        // wineserver -k exits 1 when nothing is running. Silent Steam can also
        // still be draining. Wait for -w instead of treating the kill status
        // as a play failure.
        let _ = process::wait_bounded(&mut kill, Duration::from_secs(5), &cancel);
        let mut wait = process::command(Path::new(&runtime.server_path), prefix)
            .arg("-w")
            .spawn()?;
        if process::wait_bounded(&mut wait, Duration::from_secs(8), &cancel).is_ok() {
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
            // Apple's PE builtins call companion Unix libraries, which in turn
            // load the framework relative to the installed payload. Keep that
            // layout intact; copying only PE files breaks the native bridge.
            let payload = selected(selections, "gptk")?;
            let libraries = [payload.join("redist/lib/wine"), payload.join("lib/wine")]
                .into_iter()
                .find(|path| path.join("x86_64-windows/d3d11.dll").is_file())
                .context("The Game Porting Toolkit has no D3DMetal libraries. Reimport the evaluation environment")?;
            for name in ["d3d11", "dxgi", "d3d12", "d3d12core"] {
                if !libraries
                    .join(format!("x86_64-windows/{name}.dll"))
                    .is_file()
                    || !libraries.join(format!("x86_64-unix/{name}.so")).is_file()
                {
                    bail!("D3DMetal is missing the {name} Windows/Unix library pair. Reimport the evaluation environment");
                }
            }
            let system32 = prefix.join("drive_c/windows/system32");
            fs::create_dir_all(&system32)?;
            // WINEDLLPATH alone follows Wine's own PE directory. Place the
            // selected PE files in the prefix so they win, while retaining the
            // matching Unix bridge directory in WINEDLLPATH.
            for name in ["d3d11", "dxgi", "d3d12", "d3d12core", "d3d10"] {
                let source = libraries.join(format!("x86_64-windows/{name}.dll"));
                if source.is_file() {
                    fs::copy(source, system32.join(format!("{name}.dll")))
                        .with_context(|| format!("Cannot install D3DMetal {name}"))?;
                }
            }
            Ok(GraphicsSetup {
                overrides: "d3d11=n,b;d3d10=n,b;d3d12=n,b;d3d12core=n,b;dxgi=n,b".into(),
                dll_path: Some(libraries.to_string_lossy().into_owned()),
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    #[test]
    fn d3dmetal_keeps_windows_and_unix_libraries_together() {
        let root = std::env::temp_dir().join(format!("orbit-metal-{}", uuid::Uuid::new_v4()));
        let libraries = root.join("redist/lib/wine");
        fs::create_dir_all(libraries.join("x86_64-windows")).unwrap();
        fs::create_dir_all(libraries.join("x86_64-unix")).unwrap();
        for dll in ["d3d11", "dxgi", "d3d12", "d3d12core", "d3d10"] {
            fs::write(libraries.join(format!("x86_64-windows/{dll}.dll")), b"PE").unwrap();
            fs::write(libraries.join(format!("x86_64-unix/{dll}.so")), b"bridge").unwrap();
        }
        let selections = BTreeMap::from([("gptk".into(), root.to_string_lossy().into_owned())]);
        let setup = setup_graphics(
            &root.join("prefix"),
            settings::GraphicsBackend::D3dmetal,
            &selections,
        )
        .unwrap();
        assert_eq!(setup.dll_path.as_deref(), libraries.to_str());
        assert!(setup.overrides.contains("d3d11=n,b"));
        assert_eq!(
            fs::read(root.join("prefix/drive_c/windows/system32/d3d11.dll")).unwrap(),
            b"PE"
        );
        assert!(!root
            .join("prefix/drive_c/windows/syswow64/d3d11.dll")
            .exists());
        fs::remove_file(libraries.join("x86_64-unix/d3d11.so")).unwrap();
        assert!(setup_graphics(
            &root.join("prefix"),
            settings::GraphicsBackend::D3dmetal,
            &selections
        )
        .is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn stopping_an_idle_prefix_is_not_a_play_failure() {
        let root = std::env::temp_dir().join(format!("orbit-stop-{}", uuid::Uuid::new_v4()));
        let bin = root.join("bin");
        fs::create_dir_all(&bin).unwrap();
        let wine = bin.join("wine");
        let server = bin.join("wineserver");
        fs::write(&wine, b"#!/bin/sh\nexit 0\n").unwrap();
        fs::write(
            &server,
            b"#!/bin/sh\ncase \"$1\" in\n-w) exit 0;;\n*) exit 1;;\nesac\n",
        )
        .unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&wine, fs::Permissions::from_mode(0o755)).unwrap();
            fs::set_permissions(&server, fs::Permissions::from_mode(0o755)).unwrap();
        }
        let runtime = WineInstallation {
            path: wine.to_string_lossy().into_owned(),
            server_path: server.to_string_lossy().into_owned(),
            version: "wine-9".into(),
        };
        stop_prefix(&runtime, &root.join("prefix")).unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn shared_steam_prefix_survives_stopping_the_game() {
        let root = std::env::temp_dir().join(format!("orbit-shared-stop-{}", uuid::Uuid::new_v4()));
        let bin = root.join("bin");
        fs::create_dir_all(&bin).unwrap();
        let wine = bin.join("wine");
        let server = bin.join("wineserver");
        let marker = root.join("killed");
        fs::write(&wine, b"#!/bin/sh\nexit 0\n").unwrap();
        fs::write(
            &server,
            format!(
                "#!/bin/sh\ncase \"$1\" in\n-k*|-k) echo k > \"{}\"; exit 0;;\n-w) exit 0;;\n*) exit 0;;\nesac\n",
                marker.display()
            ),
        )
        .unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&wine, fs::Permissions::from_mode(0o755)).unwrap();
            fs::set_permissions(&server, fs::Permissions::from_mode(0o755)).unwrap();
        }
        let child = Command::new("sleep")
            .arg("30")
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .unwrap();
        let mut process = WineProcess {
            child,
            waiter: None,
            runtime: WineInstallation {
                path: wine.to_string_lossy().into_owned(),
                server_path: server.to_string_lossy().into_owned(),
                version: "wine-9".into(),
            },
            prefix: root.join("prefix"),
            shared: true,
            code: None,
            finished: false,
        };
        process.stop().unwrap();
        assert!(!marker.exists());
        let _ = fs::remove_dir_all(root);
    }

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
