//! Start games as their own macOS app, the way GameHub does.
//!
//! A process spawned by Orbit is attributed to Orbit ("responsible process"),
//! so macOS credits Game Mode to `com.orbit.launcher` and pauses it when the
//! game takes the foreground. Orbit re-runs its own executable with
//! [`FLAG`]; that trampoline replaces itself (same pid, so `Child` handles and
//! pipes stay valid) with the game command in a new session, disclaiming
//! responsibility. The game is then its own responsible process and Game Mode
//! follows it.
//!
//! Orbit ships with the hardened runtime, so dyld removes `DYLD_*` variables
//! from the trampoline's environment. They travel under [`CARRY`] and are
//! restored for the game's exec (GameHub's overlay is `DYLD_INSERT_LIBRARIES`).

use std::ffi::{CString, OsString};
use std::os::unix::ffi::{OsStrExt, OsStringExt};
use std::path::PathBuf;
use std::process::Command;

pub const FLAG: &str = "--orbit-exec-detached";
const CARRY: &str = "ORBIT_DETACHED_";

const POSIX_SPAWN_SETEXEC: libc::c_short = 0x0040;
const POSIX_SPAWN_SETSID: libc::c_short = 0x0400;

extern "C" {
    fn responsibility_spawnattrs_setdisclaim(
        attrs: *mut libc::posix_spawnattr_t,
        disclaim: libc::c_int,
    ) -> libc::c_int;
}

/// The same command, routed through Orbit's detaching trampoline. Commands
/// built by `runtimes::process::base_command` set every variable explicitly,
/// so the rebuilt command keeps an exact environment.
pub fn wrap(command: &Command) -> std::io::Result<Command> {
    let mut wrapped = Command::new(std::env::current_exe()?);
    wrapped
        .arg(FLAG)
        .arg(command.get_program())
        .args(command.get_args())
        .env_clear();
    for (key, value) in command.get_envs() {
        if let Some(value) = value {
            if key.as_bytes().starts_with(b"DYLD_") {
                let mut carried = OsString::from(CARRY);
                carried.push(key);
                wrapped.env(carried, value);
            } else {
                wrapped.env(key, value);
            }
        }
    }
    if let Some(dir) = command.get_current_dir() {
        wrapped.current_dir(dir);
    }
    Ok(wrapped)
}

/// The game's environment: carried `DYLD_*` variables get their names back.
/// Only `DYLD_*` names are restored from the carry prefix.
fn restored_environment(
    vars: impl IntoIterator<Item = (OsString, OsString)>,
) -> Vec<(OsString, OsString)> {
    vars.into_iter()
        .filter_map(|(key, value)| {
            let bytes = key.as_bytes();
            match bytes.strip_prefix(CARRY.as_bytes()) {
                Some(name) if name.starts_with(b"DYLD_") => {
                    Some((OsString::from_vec(name.to_vec()), value))
                }
                Some(_) => None,
                None if bytes.starts_with(b"DYLD_") => None,
                None => Some((key, value)),
            }
        })
        .collect()
}

/// `[program, args…]` when Orbit was started as the trampoline. Only an
/// absolute program path is accepted.
pub fn requested(args: &[OsString]) -> Option<(PathBuf, Vec<OsString>)> {
    if args.get(1).map(|arg| arg.as_os_str()) != Some(FLAG.as_ref()) {
        return None;
    }
    let program = PathBuf::from(args.get(2)?);
    program.is_absolute().then(|| (program, args[3..].to_vec()))
}

/// Run before Tauri starts. Returns only when Orbit was not started as the
/// trampoline; otherwise the process becomes the game or exits with 127.
pub fn run_if_requested() {
    let args: Vec<OsString> = std::env::args_os().collect();
    let Some((program, rest)) = requested(&args) else {
        return;
    };
    let error = exec_detached(&program, &rest);
    eprintln!("orbit: could not start {}: {error}", program.display());
    std::process::exit(127);
}

fn exec_detached(program: &std::path::Path, args: &[OsString]) -> std::io::Error {
    let Ok(path) = CString::new(program.as_os_str().as_bytes()) else {
        return std::io::ErrorKind::InvalidInput.into();
    };
    let mut owned = vec![path.clone()];
    for arg in args {
        match CString::new(arg.clone().into_vec()) {
            Ok(arg) => owned.push(arg),
            Err(_) => return std::io::ErrorKind::InvalidInput.into(),
        }
    }
    let mut argv: Vec<*mut libc::c_char> = owned
        .iter()
        .map(|arg| arg.as_ptr() as *mut libc::c_char)
        .collect();
    argv.push(std::ptr::null_mut());
    let mut entries = Vec::new();
    for (key, value) in restored_environment(std::env::vars_os()) {
        let mut entry = key.into_vec();
        entry.push(b'=');
        entry.extend(value.into_vec());
        match CString::new(entry) {
            Ok(entry) => entries.push(entry),
            Err(_) => return std::io::ErrorKind::InvalidInput.into(),
        }
    }
    let mut envp: Vec<*mut libc::c_char> = entries
        .iter()
        .map(|entry| entry.as_ptr() as *mut libc::c_char)
        .collect();
    envp.push(std::ptr::null_mut());
    // SAFETY: every pointer outlives the call; on success SETEXEC never returns.
    unsafe {
        let mut attrs: libc::posix_spawnattr_t = std::ptr::null_mut();
        if libc::posix_spawnattr_init(&mut attrs) != 0 {
            return std::io::Error::last_os_error();
        }
        libc::posix_spawnattr_setflags(&mut attrs, POSIX_SPAWN_SETEXEC | POSIX_SPAWN_SETSID);
        responsibility_spawnattrs_setdisclaim(&mut attrs, 1);
        let code = libc::posix_spawn(
            std::ptr::null_mut(),
            path.as_ptr(),
            std::ptr::null(),
            &attrs,
            argv.as_ptr(),
            envp.as_ptr(),
        );
        libc::posix_spawnattr_destroy(&mut attrs);
        std::io::Error::from_raw_os_error(code)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn os(values: &[&str]) -> Vec<OsString> {
        values.iter().map(OsString::from).collect()
    }

    #[test]
    fn only_the_exact_flag_with_an_absolute_program_runs_the_trampoline() {
        assert!(requested(&os(&["/Orbit"])).is_none());
        assert!(requested(&os(&["/Orbit", "--other", "/bin/wine"])).is_none());
        assert!(requested(&os(&["/Orbit", FLAG, "wine", "x"])).is_none());
        assert!(requested(&os(&["/Orbit", FLAG])).is_none());
        let (program, args) = requested(&os(&["/Orbit", FLAG, "/bin/wine", "C:\\steam.exe", "-x"]))
            .expect("trampoline");
        assert_eq!(program, PathBuf::from("/bin/wine"));
        assert_eq!(args, os(&["C:\\steam.exe", "-x"]));
    }

    #[test]
    fn dyld_variables_survive_the_hardened_trampoline() {
        let mut command = Command::new("/opt/wine/bin/wine");
        command
            .env_clear()
            .env("DYLD_INSERT_LIBRARIES", "/GameHub.app/libsandboxfs.dylib")
            .env("WINEPREFIX", "/tmp/prefix");
        let wrapped = wrap(&command).unwrap();
        let carried: Vec<(OsString, OsString)> = wrapped
            .get_envs()
            .map(|(key, value)| (key.to_owned(), value.unwrap().to_owned()))
            .collect();
        assert!(carried
            .iter()
            .all(|(key, _)| key != "DYLD_INSERT_LIBRARIES"));
        // dyld may also leave stray DYLD_* or other carried names: never trusted.
        let mut inherited = carried.clone();
        inherited.push(("DYLD_LIBRARY_PATH".into(), "/evil".into()));
        inherited.push(("ORBIT_DETACHED_PATH".into(), "/evil".into()));
        let mut restored = restored_environment(inherited);
        restored.sort();
        assert_eq!(
            restored,
            [
                (
                    OsString::from("DYLD_INSERT_LIBRARIES"),
                    OsString::from("/GameHub.app/libsandboxfs.dylib")
                ),
                (OsString::from("WINEPREFIX"), OsString::from("/tmp/prefix")),
            ]
        );
    }

    #[test]
    fn wrapped_commands_keep_program_arguments_environment_and_directory() {
        let mut command = Command::new("/opt/wine/bin/wine");
        command
            .env_clear()
            .env("WINEPREFIX", "/tmp/prefix")
            .arg("C:\\Program Files (x86)\\Steam\\steam.exe")
            .arg("--applaunch")
            .current_dir("/tmp");
        let wrapped = wrap(&command).unwrap();
        assert_eq!(wrapped.get_program(), std::env::current_exe().unwrap());
        let args: Vec<_> = wrapped.get_args().collect();
        assert_eq!(
            args,
            [
                FLAG,
                "/opt/wine/bin/wine",
                "C:\\Program Files (x86)\\Steam\\steam.exe",
                "--applaunch"
            ]
            .map(std::ffi::OsStr::new)
        );
        let envs: Vec<_> = wrapped.get_envs().collect();
        assert_eq!(
            envs,
            [(
                std::ffi::OsStr::new("WINEPREFIX"),
                Some(std::ffi::OsStr::new("/tmp/prefix"))
            )]
        );
        assert_eq!(
            wrapped.get_current_dir(),
            Some(std::path::Path::new("/tmp"))
        );
    }
}
