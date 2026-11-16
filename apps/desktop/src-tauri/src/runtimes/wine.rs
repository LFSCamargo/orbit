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

impl PreparedWineLaunch {
    pub(crate) fn command(&self, steam_app_id: Option<&str>) -> Result<Command> {
        let mut command = game_command(
            Path::new(&self.runtime.path),
            &self.prefix,
            &self.executable,
            &self.profile,
        );
        if let Some(app_id) = steam_app_id {
            if !crate::services::steam_download::valid_app_id(app_id) {
                bail!("This game's Steam id must be a number");
            }
            command.env("SteamAppId", app_id).env("SteamGameId", app_id);
        }
        Ok(command)
    }

    pub(crate) fn spawn(
        self,
        steam_app_id: Option<&str>,
        cancel: &AtomicBool,
    ) -> Result<Box<dyn RuntimeProcess>> {
        if cancel.load(std::sync::atomic::Ordering::Relaxed) {
            bail!("Launch cancelled");
        }
        let child = process::spawn_logged(
            &mut process::detached(&self.command(steam_app_id)?)?,
            &self.log,
        )?;
        Ok(Box::new(WineProcess {
            child,
            waiter: None,
            runtime: self.runtime,
            prefix: self.prefix,
            shared: self.shared,
            code: None,
            finished: false,
        }))
    }
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
        let mut runtime = probe(Path::new(&profile.runtime_path))?;
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
        for (key, value) in graphics.env {
            profile.environment.insert(key, value);
        }
        if let Some(dll_path) = graphics.dll_path {
            // Wine searches its own builtins before WINEDLLPATH. Layer both the
            // Windows DLLs and Unix bridges into a private runtime so the chosen
            // renderer wins without changing the signed-in client distribution.
            let layered = super::layer::prepare(
                Path::new(&runtime.path),
                Path::new(&dll_path),
                &root.join("layers"),
            )
            .context("Could not prepare the selected graphics runtime")?;
            runtime = probe(&layered)?;
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
        prepared.spawn(None, cancel)
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
                // the session lifetime; stopping it leaves Steam running.
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
    /// Engine-controlled environment the selected payload needs (for example
    /// GPTK's `libd3dshared` bridge). These are not user options: they bypass
    /// the profile environment allowlist because Orbit derives them from the
    /// validated component layout.
    env: std::collections::BTreeMap<String, String>,
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
            let mut overrides = "d3d11=n;dxgi=n;d3d10core=n".to_string();
            // vkd3d-proton complements DXVK with D3D12. Its DLLs are plain PE
            // files (no Unix bridge), so they install exactly like DXVK's and
            // never touch dxgi, which DXVK owns.
            if let Some(vkd3d) = selections.get("vkd3d-proton").map(PathBuf::from) {
                if install_dlls_optional(
                    prefix,
                    &vkd3d,
                    &["d3d12.dll", "d3d12core.dll"],
                    &[("x86_64-windows", "i386-windows"), ("x64", "x32")],
                )? {
                    overrides.push_str(";d3d12=n;d3d12core=n");
                }
            }
            Ok(GraphicsSetup {
                overrides,
                dll_path: None,
                env: Default::default(),
            })
        }
        settings::GraphicsBackend::Dxmt => {
            let source = selected(selections, "dxmt")?;
            if source.join("x86_64-windows/d3d11.dll").is_file() {
                // Upstream builtin archives belong on WINEDLLPATH so Wine also
                // loads x86_64-unix/winemetal.so. Copying only the PE DLLs into
                // system32 drops that library.
                let bridge = source.join("x86_64-windows/winemetal.dll");
                if bridge.is_file() {
                    let system32 = prefix.join("drive_c/windows/system32");
                    fs::create_dir_all(&system32)?;
                    fs::copy(bridge, system32.join("winemetal.dll"))?;
                }
                return Ok(GraphicsSetup {
                    overrides: "d3d11=b;dxgi=b;d3d10core=b;winemetal=b".into(),
                    dll_path: Some(source.to_string_lossy().into_owned()),
                    env: Default::default(),
                });
            }
            install_dlls(prefix, &source, &["d3d11.dll", "dxgi.dll"])?;
            Ok(GraphicsSetup {
                overrides: "d3d11=n;dxgi=n".into(),
                dll_path: None,
                env: Default::default(),
            })
        }
        settings::GraphicsBackend::D3dmetal => {
            // Apple's PE builtins call companion Unix libraries, which in turn
            // load the framework relative to the installed payload. Keep that
            // layout intact; copying only PE files breaks the native bridge.
            let payload = selected(selections, "gptk")?;
            // Apple/Homebrew payloads nest under redist/lib/wine or lib/wine;
            // GameHub's engine components ship a flat `wine/` directory.
            let libraries = [
                payload.join("redist/lib/wine"),
                payload.join("lib/wine"),
                payload.join("wine"),
            ]
            .into_iter()
            .find(|path| path.join("x86_64-windows/d3d11.dll").is_file())
            .context("The Game Porting Toolkit has no D3DMetal libraries. Reimport the evaluation environment")?;
            for name in ["d3d11", "dxgi", "d3d12"] {
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
            let mut env = std::collections::BTreeMap::new();
            // GameHub-style GPTK components keep the Metal bridge beside the
            // payload; Apple's own builds resolve it through @rpath instead.
            let shared = payload.join("external/libd3dshared.dylib");
            if shared.is_file() {
                env.insert(
                    "WINE_GPTK_LIBD3DSHARED_PATH".into(),
                    shared.to_string_lossy().into_owned(),
                );
            }
            Ok(GraphicsSetup {
                overrides: "d3d11=b;d3d10=b;d3d12=b;d3d12core=b;dxgi=b".into(),
                dll_path: Some(libraries.to_string_lossy().into_owned()),
                env,
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
    if !install_dlls_optional(prefix, source_dir, dlls, &[("x64", "x32")])? {
        bail!(
            "The component at {} has no DLLs to install. Reinstall it or choose another version",
            source_dir.display()
        );
    }
    Ok(())
}

/// Copy PE DLLs into the prefix when the component provides them. Returns
/// whether anything was installed. `layouts` lists the architecture directory
/// pairs to try: classic (`x64`/`x32`) or Wine builtin trees
/// (`x86_64-windows`/`i386-windows`). 64-bit files land in system32, 32-bit in
/// syswow64. A missing component is not an error — callers decide.
fn install_dlls_optional(
    prefix: &Path,
    source_dir: &Path,
    dlls: &[&str],
    layouts: &[(&str, &str)],
) -> Result<bool> {
    let system32 = prefix.join("drive_c/windows/system32");
    let syswow64 = prefix.join("drive_c/windows/syswow64");
    let mut copied = 0usize;
    for dll in dlls {
        for (wide, narrow) in layouts {
            for (architecture, destination) in [(wide, &system32), (narrow, &syswow64)] {
                let source = source_dir.join(format!("{architecture}/{dll}"));
                if source.is_file() {
                    fs::create_dir_all(destination)?;
                    fs::copy(&source, destination.join(dll))
                        .with_context(|| format!("Cannot install {dll} ({architecture})"))?;
                    copied += 1;
                }
            }
        }
    }
    Ok(copied > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    #[test]
    #[cfg(unix)]
    fn builtin_backend_preparation_uses_the_selected_runtime_layer() {
        use std::os::unix::fs::PermissionsExt;
        let root =
            std::env::temp_dir().join(format!("orbit-prepare-layer-{}", uuid::Uuid::new_v4()));
        let base = root.join("base");
        let graphics = root.join("graphics");
        for dir in [
            base.join("bin"),
            base.join("lib/wine/x86_64-windows"),
            base.join("lib/wine/x86_64-unix"),
            graphics.join("x86_64-windows"),
            graphics.join("x86_64-unix"),
            root.join("prefix/drive_c"),
        ] {
            fs::create_dir_all(dir).unwrap();
        }
        for name in ["wine", "wineserver"] {
            let path = base.join("bin").join(name);
            fs::write(&path, b"#!/bin/sh\nprintf 'wine-fixture\\n'\n").unwrap();
            fs::set_permissions(path, fs::Permissions::from_mode(0o700)).unwrap();
        }
        fs::write(base.join("lib/wine/x86_64-windows/d3d11.dll"), b"default").unwrap();
        for name in ["d3d11", "dxgi", "winemetal", "d3d10core"] {
            fs::write(
                graphics.join(format!("x86_64-windows/{name}.dll")),
                b"selected",
            )
            .unwrap();
        }
        fs::write(graphics.join("x86_64-unix/winemetal.so"), b"bridge").unwrap();
        let mut pe = [0u8; 128];
        pe[..2].copy_from_slice(b"MZ");
        pe[60..64].copy_from_slice(&64u32.to_le_bytes());
        pe[64..68].copy_from_slice(b"PE\0\0");
        let exe = root.join("game.exe");
        fs::write(&exe, pe).unwrap();
        fs::write(root.join("prefix/system.reg"), b"reg").unwrap();
        let profile = WineProfile {
            runtime_path: base.join("bin/wine").to_string_lossy().into_owned(),
            executable: exe.to_string_lossy().into_owned(),
            shared_prefix: Some(root.join("prefix").to_string_lossy().into_owned()),
            selections: BTreeMap::from([("dxmt".into(), graphics.to_string_lossy().into_owned())]),
            effective: settings::CompatibilitySettings {
                graphics: settings::GraphicsBackend::Dxmt,
                ..Default::default()
            },
            ..Default::default()
        };
        let prepared = WineAdapter
            .prepare(
                &profile,
                "game",
                &root.join("data"),
                &AtomicBool::new(false),
                &mut |_| {},
            )
            .unwrap();
        assert!(Path::new(&prepared.runtime.path)
            .starts_with(root.join("data/layers").canonicalize().unwrap()));
        let runtime = Path::new(&prepared.runtime.path)
            .parent()
            .unwrap()
            .parent()
            .unwrap();
        assert_eq!(
            fs::read(runtime.join("lib/wine/x86_64-windows/d3d11.dll")).unwrap(),
            b"selected"
        );
        assert_eq!(
            fs::read(root.join("prefix/drive_c/windows/system32/winemetal.dll")).unwrap(),
            b"selected"
        );
        assert_eq!(
            fs::read(base.join("lib/wine/x86_64-windows/d3d11.dll")).unwrap(),
            b"default"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn prepared_steam_launch_preserves_graphics_and_game_arguments() {
        let root = std::env::temp_dir().join(format!("orbit-steam-env-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let prepared = PreparedWineLaunch {
            runtime: WineInstallation {
                path: "/wine/bin/wine".into(),
                server_path: "/wine/bin/wineserver".into(),
                version: "test".into(),
            },
            prefix: root.join("shared-prefix"),
            executable: root.join("God of War/GoW.exe"),
            profile: WineProfile {
                arguments: vec!["argument with spaces".into()],
                environment: BTreeMap::from([
                    ("WINEDLLPATH".into(), "/gptk/redist/lib/wine".into()),
                    ("WINEDLLOVERRIDES".into(), "d3d11=n,b;dxgi=n,b".into()),
                    ("D3DM_ENABLE_METALFX".into(), "1".into()),
                ]),
                ..Default::default()
            },
            log: process::log_file(&root.join("latest.log")).unwrap(),
            shared: true,
        };
        let command = prepared.command(Some("1593500")).unwrap();
        let env: BTreeMap<_, _> = command
            .get_envs()
            .filter_map(|(k, v)| {
                v.map(|v| {
                    (
                        k.to_string_lossy().into_owned(),
                        v.to_string_lossy().into_owned(),
                    )
                })
            })
            .collect();
        assert_eq!(env["WINEDLLPATH"], "/gptk/redist/lib/wine");
        assert_eq!(env["WINEDLLOVERRIDES"], "d3d11=n,b;dxgi=n,b");
        assert_eq!(env["D3DM_ENABLE_METALFX"], "1");
        assert_eq!(env["SteamAppId"], "1593500");
        assert_eq!(env["SteamGameId"], "1593500");
        assert!(!env.contains_key("WINE_D3D_CONFIG"));
        assert_eq!(env["WINEPREFIX"], prepared.prefix.to_string_lossy());
        assert_eq!(command.get_current_dir(), prepared.executable.parent());
        assert_eq!(
            command.get_args().collect::<Vec<_>>(),
            vec![
                prepared.executable.as_os_str(),
                std::ffi::OsStr::new("argument with spaces")
            ]
        );
        assert!(prepared.command(Some("1593500;bad")).is_err());
        assert!(!prepared
            .command(None)
            .unwrap()
            .get_envs()
            .any(|(key, _)| key == "SteamAppId"));
        fs::remove_dir_all(root).unwrap();
    }

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
        assert!(setup.overrides.contains("d3d11=b"));
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
        assert_eq!(setup.overrides, "d3d11=b;dxgi=b;d3d10core=b;winemetal=b");
        assert_eq!(setup.dll_path.as_deref(), Some(root.to_str().unwrap()));
        let _ = fs::remove_dir_all(root);
    }

    /// GameHub's GPTK components ship a flat `wine/` tree plus an external
    /// libd3dshared bridge instead of Apple's `redist/lib` layout. D3DMetal
    /// must accept that shape and surface the bridge as engine environment.
    #[test]
    fn d3dmetal_accepts_the_gamehub_component_layout() {
        let root = std::env::temp_dir().join(format!("orbit-gh-gptk-{}", uuid::Uuid::new_v4()));
        let libraries = root.join("wine");
        fs::create_dir_all(libraries.join("x86_64-windows")).unwrap();
        fs::create_dir_all(libraries.join("x86_64-unix")).unwrap();
        fs::create_dir_all(root.join("external")).unwrap();
        for dll in ["d3d11", "dxgi", "d3d12"] {
            fs::write(libraries.join(format!("x86_64-windows/{dll}.dll")), b"PE").unwrap();
            fs::write(libraries.join(format!("x86_64-unix/{dll}.so")), b"bridge").unwrap();
        }
        // GameHub's build merges d3d12core into d3d12; the pair check must not
        // require a separate d3d12core library.
        fs::write(root.join("external/libd3dshared.dylib"), b"shared").unwrap();
        let selections = BTreeMap::from([("gptk".into(), root.to_string_lossy().into_owned())]);
        let prefix = root.join("prefix");
        let setup =
            setup_graphics(&prefix, settings::GraphicsBackend::D3dmetal, &selections).unwrap();
        assert_eq!(setup.dll_path.as_deref(), libraries.to_str());
        assert_eq!(
            setup
                .env
                .get("WINE_GPTK_LIBD3DSHARED_PATH")
                .map(String::as_str),
            Some(root.join("external/libd3dshared.dylib").to_str().unwrap())
        );
        assert_eq!(
            fs::read(prefix.join("drive_c/windows/system32/d3d11.dll")).unwrap(),
            b"PE"
        );
        let _ = fs::remove_dir_all(root);
    }

    /// A missing Unix bridge pair is still a hard error in the GameHub layout.
    #[test]
    fn d3dmetal_gamehub_layout_still_requires_unix_bridges() {
        let root = std::env::temp_dir().join(format!("orbit-gh-gptk-bad-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("wine/x86_64-windows")).unwrap();
        fs::create_dir_all(root.join("wine/x86_64-unix")).unwrap();
        for dll in ["d3d11", "dxgi"] {
            fs::write(root.join(format!("wine/x86_64-windows/{dll}.dll")), b"PE").unwrap();
            fs::write(root.join(format!("wine/x86_64-unix/{dll}.so")), b"bridge").unwrap();
        }
        fs::write(root.join("wine/x86_64-windows/d3d12.dll"), b"PE").unwrap();
        // d3d12.so missing → the pair check must fail.
        let selections = BTreeMap::from([("gptk".into(), root.to_string_lossy().into_owned())]);
        assert!(setup_graphics(
            &root.join("prefix"),
            settings::GraphicsBackend::D3dmetal,
            &selections
        )
        .is_err());
        let _ = fs::remove_dir_all(root);
    }

    /// vkd3d-proton complements DXVK with D3D12 without touching dxgi, and a
    /// missing vkd3d component leaves plain DXVK behaviour intact.
    #[test]
    fn dxvk_pairs_with_vkd3d_proton_when_installed() {
        let root = std::env::temp_dir().join(format!("orbit-vkd3d-{}", uuid::Uuid::new_v4()));
        let dxvk = root.join("dxvk");
        fs::create_dir_all(dxvk.join("x64")).unwrap();
        fs::create_dir_all(dxvk.join("x32")).unwrap();
        for dll in ["d3d11.dll", "d3d10core.dll", "dxgi.dll"] {
            fs::write(dxvk.join(format!("x64/{dll}")), b"dxvk64").unwrap();
            fs::write(dxvk.join(format!("x32/{dll}")), b"dxvk32").unwrap();
        }
        let vkd3d = root.join("vkd3d");
        fs::create_dir_all(vkd3d.join("x86_64-windows")).unwrap();
        fs::create_dir_all(vkd3d.join("i386-windows")).unwrap();
        for dll in ["d3d12.dll", "d3d12core.dll", "dxgi.dll"] {
            fs::write(vkd3d.join(format!("x86_64-windows/{dll}")), b"vkd3d64").unwrap();
        }
        fs::write(vkd3d.join("i386-windows/d3d12.dll"), b"vkd3d32").unwrap();
        let prefix = root.join("prefix");

        // Without vkd3d selected: plain DXVK.
        let selections = BTreeMap::from([("dxvk".into(), dxvk.to_string_lossy().into_owned())]);
        let setup = setup_graphics(&prefix, settings::GraphicsBackend::Dxvk, &selections).unwrap();
        assert_eq!(setup.overrides, "d3d11=n;dxgi=n;d3d10core=n");
        assert!(!prefix.join("drive_c/windows/system32/d3d12.dll").exists());

        // With vkd3d selected: D3D12 lands beside DXVK, dxgi stays DXVK's.
        let mut selections = selections.clone();
        selections.insert("vkd3d-proton".into(), vkd3d.to_string_lossy().into_owned());
        let setup = setup_graphics(&prefix, settings::GraphicsBackend::Dxvk, &selections).unwrap();
        assert_eq!(
            setup.overrides,
            "d3d11=n;dxgi=n;d3d10core=n;d3d12=n;d3d12core=n"
        );
        assert_eq!(
            fs::read(prefix.join("drive_c/windows/system32/d3d12.dll")).unwrap(),
            b"vkd3d64"
        );
        assert_eq!(
            fs::read(prefix.join("drive_c/windows/system32/d3d12core.dll")).unwrap(),
            b"vkd3d64"
        );
        assert_eq!(
            fs::read(prefix.join("drive_c/windows/syswow64/d3d12.dll")).unwrap(),
            b"vkd3d32"
        );
        assert_eq!(
            fs::read(prefix.join("drive_c/windows/system32/dxgi.dll")).unwrap(),
            b"dxvk64",
            "DXVK keeps ownership of dxgi"
        );
        let _ = fs::remove_dir_all(root);
    }
}
