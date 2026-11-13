use anyhow::{bail, Result};
use std::{
    fs::{File, OpenOptions},
    io::{Read, Write},
    path::Path,
    process::{Child, Command, ExitStatus, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

pub fn wait_bounded(
    child: &mut Child,
    timeout: Duration,
    cancel: &AtomicBool,
) -> Result<ExitStatus> {
    let start = Instant::now();
    loop {
        if let Some(status) = child.try_wait()? {
            return Ok(status);
        }
        if cancel.load(Ordering::Relaxed) || start.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            bail!("Runtime operation cancelled or timed out");
        }
        std::thread::sleep(Duration::from_millis(25));
    }
}

/// Fresh, private, capped diagnostics per launch. Drain both pipes even after the
/// cap is reached, so a noisy game cannot exhaust storage or deadlock on output.
pub fn log_file(path: &Path) -> Result<Arc<Mutex<File>>> {
    if path
        .symlink_metadata()
        .is_ok_and(|m| m.file_type().is_symlink())
    {
        bail!("Log path cannot be a symlink");
    }
    let mut options = OpenOptions::new();
    options.create(true).truncate(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    Ok(Arc::new(Mutex::new(options.open(path)?)))
}
pub fn spawn_logged(cmd: &mut Command, log: &Arc<Mutex<File>>) -> Result<Child> {
    let mut child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    drain(child.stdout.take().unwrap(), log.clone());
    drain(child.stderr.take().unwrap(), log.clone());
    Ok(child)
}
fn drain(mut input: impl Read + Send + 'static, log: Arc<Mutex<File>>) {
    std::thread::spawn(move || {
        let mut buffer = [0; 4096];
        while let Ok(n) = input.read(&mut buffer) {
            if n == 0 {
                break;
            }
            if let Ok(mut file) = log.lock() {
                let used = file.metadata().map(|m| m.len()).unwrap_or(1_048_576);
                let remaining = 1_048_576u64.saturating_sub(used) as usize;
                let _ = file.write_all(&buffer[..n.min(remaining)]);
            }
        }
    });
}

pub fn base_command(executable: &Path) -> Command {
    let mut cmd = Command::new(executable);
    // Do not pass Orbit's metadata API credentials to games.
    cmd.env_clear();
    for key in [
        "HOME",
        "USER",
        "TMPDIR",
        "LANG",
        "DISPLAY",
        "WAYLAND_DISPLAY",
        "XDG_RUNTIME_DIR",
    ] {
        if let Some(value) = std::env::var_os(key) {
            cmd.env(key, value);
        }
    }
    cmd.env("PATH", "/usr/bin:/bin:/usr/sbin:/sbin");
    cmd
}

pub fn command(executable: &Path, prefix: &Path) -> Command {
    let mut cmd = base_command(executable);
    cmd.env("WINEPREFIX", prefix).env("WINEDEBUG", "-all");
    cmd
}
