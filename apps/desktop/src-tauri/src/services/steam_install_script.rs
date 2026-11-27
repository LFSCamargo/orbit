//! Runs the "Run Process" steps of a Steam game's `installscript.vdf` once per
//! container, as the Steam client does before a first launch. Orbit starts the
//! game EXE directly, so without this a game's own prerequisites never install:
//! God of War Ragnarök stops with "PlayStation(R) PC SDK Runtime is missing"
//! (`SCE_PSPC_ERROR_CANNOT_LOAD_DLL`) until `install_pspc_sdk_runtime.bat` runs.
//!
//! Only programs inside the install folder run (`%INSTALLDIR%\\…` with no `..`,
//! `.exe`/`.bat`/`.cmd`/`.msi`), arguments with cmd metacharacters are refused,
//! and a step that succeeded is recorded in the container's
//! `install-scripts.json`. A failed step is logged, retried next launch, and never
//! blocks the game from starting.
use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
    sync::atomic::AtomicBool,
    time::Duration,
};

use crate::runtimes::process;
use crate::utils::steam_vdf::{self, Value};

const SCRIPT: &str = "installscript.vdf";
const DONE_FILE: &str = "install-scripts.json";
const LOG_FILE: &str = "install-scripts.log";
/// Install scripts are a few hundred bytes; anything larger is not one.
const SCRIPT_LIMIT: u64 = 64 * 1024;
const MAX_STEPS: usize = 16;
const MAX_PROCESSES: usize = 8;
const MAX_ARGS_LEN: usize = 512;
/// A 500 MB MSI under Wine finishes in seconds; this only stops a hung installer.
const STEP_TIMEOUT: Duration = Duration::from_secs(15 * 60);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Process {
    /// Path below the install folder, one component per entry.
    pub relative: PathBuf,
    /// Raw `Command N` text; `%INSTALLDIR%` is expanded at run time.
    pub command: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Step {
    pub name: String,
    pub processes: Vec<Process>,
}

impl Step {
    fn key(&self) -> String {
        let paths: Vec<String> = self
            .processes
            .iter()
            .map(|p| p.relative.to_string_lossy().into_owned())
            .collect();
        format!("{}|{}", self.name, paths.join(";"))
    }
}

fn child<'a>(fields: &'a [(String, Value)], key: &str) -> Option<&'a [(String, Value)]> {
    fields.iter().find_map(|(name, value)| match value {
        Value::Object(inner) if name.eq_ignore_ascii_case(key) => Some(inner.as_slice()),
        _ => None,
    })
}

fn text<'a>(fields: &'a [(String, Value)], key: &str) -> Option<&'a str> {
    fields.iter().find_map(|(name, value)| match value {
        Value::Text(text) if name.eq_ignore_ascii_case(key) => Some(text.as_str()),
        _ => None,
    })
}

/// `%INSTALLDIR%\\dir\\setup.exe` → `dir/setup.exe`; None for anything that
/// could leave the install folder or is not a program Orbit knows how to run.
pub fn relative_process(value: &str) -> Option<PathBuf> {
    let marker = "%INSTALLDIR%";
    let head = value.get(..marker.len())?;
    if !head.eq_ignore_ascii_case(marker) {
        return None;
    }
    let rest = value[marker.len()..].trim_start_matches(['\\', '/']);
    let mut path = PathBuf::new();
    for part in rest.split(['\\', '/']) {
        if part.is_empty()
            || part == "."
            || part == ".."
            || part.contains(':')
            || part.chars().any(char::is_control)
        {
            return None;
        }
        path.push(part);
    }
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    matches!(ext.as_str(), "exe" | "bat" | "cmd" | "msi").then_some(path)
}

/// The steps a game's install script asks for, invalid entries dropped.
pub fn parse(content: &str) -> Vec<Step> {
    let Ok(tree) = steam_vdf::parse(content) else {
        return Vec::new();
    };
    let Some(run) = child(&tree, "InstallScript").and_then(|script| child(script, "Run Process"))
    else {
        return Vec::new();
    };
    run.iter()
        .take(MAX_STEPS)
        .filter_map(|(name, value)| {
            let Value::Object(fields) = value else {
                return None;
            };
            let processes: Vec<Process> = (1..=MAX_PROCESSES)
                .map_while(|n| text(fields, &format!("Process {n}")).map(|p| (n, p)))
                .filter_map(|(n, raw)| {
                    Some(Process {
                        relative: relative_process(raw)?,
                        command: text(fields, &format!("Command {n}"))
                            .unwrap_or_default()
                            .to_string(),
                    })
                })
                .collect();
            (!processes.is_empty()).then(|| Step {
                name: name.clone(),
                processes,
            })
        })
        .collect()
}

/// The install script in this folder, if any. Symlinks and large files are skipped.
pub fn steps(install_dir: &Path) -> Vec<Step> {
    let path = install_dir.join(SCRIPT);
    match fs::symlink_metadata(&path) {
        Ok(meta) if meta.is_file() && meta.len() <= SCRIPT_LIMIT => {}
        _ => return Vec::new(),
    }
    fs::read_to_string(path)
        .map(|content| parse(&content))
        .unwrap_or_default()
}

/// Splits `Command N` on whitespace outside double quotes, expanding
/// `%INSTALLDIR%`. None when it holds cmd metacharacters or is too long.
pub fn arguments(command: &str, install_dir_windows: &str) -> Option<Vec<String>> {
    if command.len() > MAX_ARGS_LEN
        || command
            .chars()
            .any(|c| c.is_control() || matches!(c, '&' | '|' | '<' | '>' | '^'))
    {
        return None;
    }
    let mut args = Vec::new();
    let mut current = String::new();
    let mut quoted = false;
    let mut started = false;
    for c in command.chars() {
        match c {
            '"' => {
                quoted = !quoted;
                started = true;
            }
            c if c.is_whitespace() && !quoted => {
                if started {
                    args.push(std::mem::take(&mut current));
                    started = false;
                }
            }
            c => {
                current.push(c);
                started = true;
            }
        }
    }
    if quoted {
        return None;
    }
    if started {
        args.push(current);
    }
    Some(
        args.into_iter()
            .map(|arg| replace_install_dir(&arg, install_dir_windows))
            .collect(),
    )
}

fn replace_install_dir(arg: &str, install_dir_windows: &str) -> String {
    let lower = arg.to_ascii_lowercase();
    match lower.find("%installdir%") {
        Some(at) => format!(
            "{}{}{}",
            &arg[..at],
            install_dir_windows,
            &arg[at + "%installdir%".len()..]
        ),
        None => arg.to_string(),
    }
}

/// Wine's `Z:` drive maps `/`.
pub fn windows_path(path: &Path) -> Option<String> {
    let unix = path.to_str()?;
    (!unix.chars().any(char::is_control)).then(|| format!("Z:{}", unix.replace('/', "\\")))
}

/// Wine arguments for one program: batch files go through `cmd /c`, MSIs
/// through `msiexec /i`, executables run as they are.
pub fn wine_args(program_windows: &str, args: Vec<String>) -> Vec<String> {
    let lower = program_windows.to_ascii_lowercase();
    let mut out = if lower.ends_with(".bat") || lower.ends_with(".cmd") {
        vec!["cmd".into(), "/c".into(), program_windows.to_string()]
    } else if lower.ends_with(".msi") {
        vec!["msiexec".into(), "/i".into(), program_windows.to_string()]
    } else {
        vec![program_windows.to_string()]
    };
    out.extend(args);
    out
}

fn done_path(prefix: &Path) -> Option<PathBuf> {
    prefix.parent().map(|dir| dir.join(DONE_FILE))
}

fn load_done(prefix: &Path) -> BTreeSet<String> {
    done_path(prefix)
        .filter(|path| path.symlink_metadata().is_ok_and(|meta| meta.is_file()))
        .and_then(|path| fs::read(path).ok())
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn save_done(prefix: &Path, done: &BTreeSet<String>) {
    let Some(path) = done_path(prefix) else {
        return;
    };
    if path
        .symlink_metadata()
        .is_ok_and(|meta| meta.file_type().is_symlink())
    {
        return;
    }
    if let Ok(json) = serde_json::to_vec(done) {
        if let Err(err) = fs::write(&path, json) {
            eprintln!("[orbit] could not record install scripts: {err}");
        }
    }
}

/// Forgets every finished step, so they all run again (Repair Installation).
pub fn forget(prefix: &Path) {
    if let Some(path) = done_path(prefix) {
        if path.symlink_metadata().is_ok_and(|meta| meta.is_file()) {
            let _ = fs::remove_file(path);
        }
    }
}

/// Steps not yet recorded as done in this container.
pub fn pending(install_dir: &Path, prefix: &Path) -> Vec<Step> {
    let done = load_done(prefix);
    steps(install_dir)
        .into_iter()
        .filter(|step| !done.contains(&step.key()))
        .collect()
}

fn run_process(
    wine: &Path,
    prefix: &Path,
    install_dir: &Path,
    entry: &Process,
    cancel: &AtomicBool,
    log: &std::sync::Arc<std::sync::Mutex<fs::File>>,
) -> Result<(), String> {
    let root = install_dir
        .canonicalize()
        .map_err(|_| "install folder is missing")?;
    let program = root
        .join(&entry.relative)
        .canonicalize()
        .map_err(|_| format!("{} is missing", entry.relative.display()))?;
    if !program.starts_with(&root) || !program.is_file() {
        return Err(format!(
            "{} is outside the install folder",
            entry.relative.display()
        ));
    }
    let root_windows = windows_path(&root).ok_or("install folder path is not usable")?;
    let program_windows = windows_path(&program).ok_or("installer path is not usable")?;
    let args = arguments(&entry.command, &root_windows)
        .ok_or_else(|| format!("refused arguments for {}", entry.relative.display()))?;
    let mut command = process::command(wine, prefix);
    command
        .args(wine_args(&program_windows, args))
        .current_dir(program.parent().unwrap_or(&root));
    let mut child = process::spawn_logged(&mut command, log).map_err(|err| err.to_string())?;
    let status =
        process::wait_bounded(&mut child, STEP_TIMEOUT, cancel).map_err(|err| err.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "{} exited with {}",
            entry.relative.display(),
            status.code().unwrap_or(-1)
        ))
    }
}

/// Runs this game's pending install-script steps in its container. Never fails
/// the launch: an error is logged and the step runs again next time.
pub fn run_pending(
    wine: &Path,
    prefix: &Path,
    install_dir: &Path,
    cancel: &AtomicBool,
    progress: &mut impl FnMut(&str),
) {
    let steps = pending(install_dir, prefix);
    if steps.is_empty() {
        return;
    }
    let Some(log) = prefix
        .parent()
        .and_then(|dir| process::log_file(&dir.join(LOG_FILE)).ok())
    else {
        return;
    };
    let mut done = load_done(prefix);
    for step in steps {
        progress(&format!("prefix|Installing {}", step.name));
        let result = step
            .processes
            .iter()
            .try_for_each(|entry| run_process(wine, prefix, install_dir, entry, cancel, &log));
        match result {
            Ok(()) => {
                done.insert(step.key());
                save_done(prefix, &done);
            }
            Err(err) => eprintln!("[orbit] install script step {:?} failed: {err}", step.name),
        }
    }
}

/// The game's Steam install folder (`steamapps/common/<dir>`) for an
/// executable that may sit in a subfolder; else the executable's own folder.
pub fn install_dir_of(executable: &Path) -> Option<PathBuf> {
    executable
        .ancestors()
        .skip(1)
        .find(|dir| {
            dir.parent()
                .and_then(Path::file_name)
                .is_some_and(|name| name.eq_ignore_ascii_case("common"))
        })
        .or_else(|| executable.parent())
        .map(Path::to_path_buf)
}

#[cfg(test)]
mod tests {
    use super::*;

    const GOW_RAGNAROK: &str = r#""InstallScript"
{
	"Run Process"
	{
		"PlayStation SDK 2.50"
		{
			"HasRunKey"		"HKEY_CURRENT_USER\\Software\\Valve\\Steam\\Apps\\2322010"
			"Process 1"		"%INSTALLDIR%\\install_pspc_sdk_runtime.bat"
			"Command 1"		"quiet"
		}
	}
}
"kvsignatures"
{
	"InstallScript"		"3f52"
}
"#;

    #[test]
    fn gow_ragnarok_runs_the_playstation_runtime_installer_quietly() {
        // Regression: GoWR.exe stopped with "PlayStation(R) PC SDK Runtime is
        // missing" because Orbit never ran the game's installscript.vdf.
        let steps = parse(GOW_RAGNAROK);
        assert_eq!(
            steps,
            vec![Step {
                name: "PlayStation SDK 2.50".into(),
                processes: vec![Process {
                    relative: PathBuf::from("install_pspc_sdk_runtime.bat"),
                    command: "quiet".into(),
                }],
            }]
        );
        let args = arguments("quiet", "Z:\\games\\GoWR").unwrap();
        assert_eq!(
            wine_args("Z:\\games\\GoWR\\install_pspc_sdk_runtime.bat", args),
            vec![
                "cmd",
                "/c",
                "Z:\\games\\GoWR\\install_pspc_sdk_runtime.bat",
                "quiet"
            ]
        );
    }

    #[test]
    fn only_programs_inside_the_install_folder_are_accepted() {
        assert_eq!(
            relative_process("%INSTALLDIR%\\_CommonRedist\\vcredist\\VC_redist.x64.exe"),
            Some(PathBuf::from("_CommonRedist/vcredist/VC_redist.x64.exe"))
        );
        assert_eq!(
            relative_process("%installdir%/setup.msi"),
            Some(PathBuf::from("setup.msi"))
        );
        for bad in [
            "%INSTALLDIR%\\..\\..\\evil.exe",
            "C:\\Windows\\System32\\cmd.exe",
            "%INSTALLDIR%\\C:\\evil.exe",
            "%INSTALLDIR%\\readme.txt",
            "%INSTALLDIR%\\",
            "%INSTALLDIR%\\sub\\.\\setup.exe",
            "",
        ] {
            assert_eq!(relative_process(bad), None, "{bad}");
        }
    }

    #[test]
    fn arguments_are_split_expanded_and_metacharacters_refused() {
        assert_eq!(
            arguments(r#"/q /norestart "%INSTALLDIR%\log dir""#, "Z:\\My Game").unwrap(),
            vec!["/q", "/norestart", "Z:\\My Game\\log dir"]
        );
        assert_eq!(arguments("", "Z:\\g").unwrap(), Vec::<String>::new());
        assert_eq!(arguments("quiet & del x", "Z:\\g"), None);
        assert_eq!(arguments("a | b", "Z:\\g"), None);
        assert_eq!(arguments("\"unclosed", "Z:\\g"), None);
        assert_eq!(arguments(&"a".repeat(MAX_ARGS_LEN + 1), "Z:\\g"), None);
        assert_eq!(
            wine_args("Z:\\g\\a.msi", vec!["/qn".into()]),
            vec!["msiexec", "/i", "Z:\\g\\a.msi", "/qn"]
        );
        assert_eq!(wine_args("Z:\\g\\a.exe", vec![]), vec!["Z:\\g\\a.exe"]);
        assert_eq!(windows_path(Path::new("/a/b c")).unwrap(), "Z:\\a\\b c");
    }

    #[test]
    fn steps_without_a_valid_process_and_broken_scripts_are_skipped() {
        let script = r#""InstallScript" { "Run Process" {
            "bad" { "Process 1" "C:\\evil.exe" }
            "good" { "Process 1" "%INSTALLDIR%\\a.exe" "Process 2" "%INSTALLDIR%\\b.bat" "Command 2" "/s" }
        } }"#;
        let steps = parse(script);
        assert_eq!(steps.len(), 1);
        assert_eq!(steps[0].name, "good");
        assert_eq!(steps[0].processes.len(), 2);
        assert_eq!(steps[0].processes[0].command, "");
        assert!(parse("not vdf {").is_empty());
        assert!(parse(r#""InstallScript" { "Registry" { } }"#).is_empty());
    }

    #[test]
    fn a_finished_step_is_not_run_again_in_the_same_container() {
        let root =
            std::env::temp_dir().join(format!("orbit-installscript-{}", uuid::Uuid::new_v4()));
        let install = root.join("steamapps/common/God of War Ragnarök");
        let prefix = root.join("container/prefix");
        fs::create_dir_all(&install).unwrap();
        fs::create_dir_all(&prefix).unwrap();
        fs::write(install.join(SCRIPT), GOW_RAGNAROK).unwrap();
        let pending_steps = pending(&install, &prefix);
        assert_eq!(pending_steps.len(), 1);
        let mut done = BTreeSet::new();
        done.insert(pending_steps[0].key());
        save_done(&prefix, &done);
        assert!(pending(&install, &prefix).is_empty());
        forget(&prefix);
        assert_eq!(
            pending(&install, &prefix).len(),
            1,
            "a repair runs it again"
        );
        save_done(&prefix, &done);
        assert!(pending(&install, &root.join("other/prefix")).len() == 1);
        // No script, or a symlinked one, means nothing to run.
        assert!(steps(&root).is_empty());
        #[cfg(unix)]
        {
            let linked = root.join("linked");
            fs::create_dir_all(&linked).unwrap();
            std::os::unix::fs::symlink(install.join(SCRIPT), linked.join(SCRIPT)).unwrap();
            assert!(steps(&linked).is_empty());
        }
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn the_install_folder_is_found_above_a_nested_executable() {
        assert_eq!(
            install_dir_of(Path::new("/lib/steamapps/common/Game/bin/x64/game.exe")).unwrap(),
            PathBuf::from("/lib/steamapps/common/Game")
        );
        assert_eq!(
            install_dir_of(Path::new("/lib/steamapps/common/Game/game.exe")).unwrap(),
            PathBuf::from("/lib/steamapps/common/Game")
        );
        assert_eq!(
            install_dir_of(Path::new("/elsewhere/game.exe")).unwrap(),
            PathBuf::from("/elsewhere")
        );
    }
}
