//! Silent in-prefix Steam for Steamworks titles. Play shares the signed-in
//! steam-windows prefix instead of creating a private Wine bottle.

use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use super::steam_windows::{self, steam_exe, steam_prefix, steam_runtime_command};
use crate::database::GameRepository;
use crate::models::LaunchConfiguration;
use crate::runtimes::{prefix, wine::WineAdapter, RuntimeProcess};
use crate::utils::steam_account;

const STEAM_READY: Duration = Duration::from_secs(3 * 60);
const LOG_LIMIT: u64 = 256 * 1024;

pub fn silent_argv(steam_exe: &Path) -> Vec<String> {
    vec![
        steam_exe.to_string_lossy().into_owned(),
        "-silent".into(),
        "-nofriendsui".into(),
        "-no-dwrite".into(),
        "-noverifyfiles".into(),
        "-norepairfiles".into(),
    ]
}

/// Tell a logged-on Steam to stay in the tray. GameHub prefixes also have no
/// ConnectCache; Play needs that resident client, not a fresh autologin.
pub fn nudge_silent_client(wine: &Path, prefix: &Path) {
    let steam = steam_exe();
    let Some(steam_root) = steam.parent() else {
        return;
    };
    if !steam.is_file() || !wine.is_file() || !prefix.is_dir() {
        return;
    }
    if !steam_running(&process_commands(), prefix) {
        return;
    }
    let _ = write_play_steam_cfg(steam_root);
    let mut command = steam_runtime_command(wine, prefix);
    command.args(silent_argv(&steam));
    command.current_dir(steam_root);
    command
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    let _ = command.spawn();
}

pub fn play_exit_message(code: i32) -> String {
    if code == 53 {
        "Steam was not ready. If a Steam update window is open, wait for it to finish or close it, then press Play. Otherwise sign in again from Settings → Steam.".into()
    } else {
        format!("The game exited with code {code}. Open Compatibility diagnostics for details.")
    }
}

pub fn play_prefix() -> Result<PathBuf, String> {
    prefix::accept_shared(&steam_prefix(), &steam_prefix()).map_err(|err| err.to_string())
}

pub fn launch_owned(
    repo: &GameRepository,
    app_id: &str,
    cancel: &AtomicBool,
) -> Result<Box<dyn RuntimeProcess>, String> {
    let game_id = steam_windows::play(repo, app_id)?;
    let game = repo
        .get_game(&game_id)
        .map_err(|err| err.to_string())?
        .ok_or("Game not found")?;
    let LaunchConfiguration::Wine { mut profile } = game.launch_config else {
        return Err("This game is not a Windows install".into());
    };
    if let Some(path) = steam_windows::play_wine_binary(repo) {
        profile.runtime_path = path.to_string_lossy().into_owned();
    }
    let prefix = play_prefix()?;
    profile.shared_prefix = Some(prefix.to_string_lossy().into_owned());
    let extras = steam_windows::preferences(repo)
        .map(|prefs| prefs.additional_library_paths)
        .unwrap_or_default();
    ensure_silent_client(Path::new(&profile.runtime_path), &prefix, cancel, &extras)?;
    let resolved = crate::runtimes::settings::resolve_profile(repo, &profile)
        .map_err(|err| format!("{err:#}"))?;
    start_title(&resolved, &game.id, app_id, cancel, &mut |_| {})
}

pub fn start_title(
    profile: &crate::runtimes::WineProfile,
    game_id: &str,
    app_id: &str,
    cancel: &AtomicBool,
    progress: &mut impl FnMut(&str),
) -> Result<Box<dyn RuntimeProcess>, String> {
    if !super::steam_download::valid_app_id(app_id) {
        return Err("This game's Steam id must be a number".into());
    }
    let prefix = play_prefix()?;
    if !client_ready(&steam_exe(), &prefix) {
        return Err(
            "Windows Steam is still signing in. Wait until Steam is ready, then press Play.".into(),
        );
    }
    let prepared = WineAdapter
        .prepare(profile, game_id, &crate::runtimes::root(), cancel, progress)
        .map_err(|err| format!("{err:#}"))?;
    progress("spawn");
    // The resident Steam client retains the CPU-only sign-in environment.
    // A second steam.exe -applaunch forwards only the app id to that process,
    // losing the prepared graphics DLL paths, options and game arguments.
    prepared
        .spawn(Some(app_id), cancel)
        .map_err(|err| format!("{err:#}"))
}

pub fn ensure_silent_client(
    wine: &Path,
    prefix: &Path,
    cancel: &AtomicBool,
    extra_libraries: &[String],
) -> Result<(), String> {
    let steam = steam_exe();
    if !steam.is_file() {
        return Err(
            "Install Steam for Windows in Settings → Steam before playing this game".into(),
        );
    }
    let steam_root = steam
        .parent()
        .ok_or("Install Steam for Windows in Settings → Steam before playing this game")?;
    let loginusers = steam_root.join("config/loginusers.vdf");
    if !loginusers.is_file() {
        return Err("Sign in with Steam before playing this game".into());
    }
    steam_account::enable_saved_login(&loginusers);
    write_play_steam_cfg(steam_root)?;
    if !extra_libraries.is_empty() {
        super::steam_client_library::link_installs(steam_root, extra_libraries)?;
        if !steam_running(&process_commands(), prefix) {
            super::steam_client_library::register(steam_root, prefix, extra_libraries)?;
        }
    }
    if client_ready(&steam, prefix) {
        nudge_silent_client(wine, prefix);
        return Ok(());
    }
    let commands = process_commands();
    if !steam_running(&commands, prefix)
        && pid_present(&steam)
        && !prefix_busy_from(&commands, prefix)
    {
        let _ = std::fs::remove_file(steam_root.join("steam.pid"));
    }
    if !steam_running(&process_commands(), prefix) {
        super::steam_browser::prepare(&steam).map_err(|err| format!("{err:#}"))?;
        let mut command = steam_runtime_command(wine, prefix);
        command.args(silent_argv(&steam));
        command.current_dir(steam_root);
        command
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        command.spawn().map_err(|_| {
            "Windows Steam could not be started. Sign in again from Settings → Steam."
        })?;
    }
    let deadline = Instant::now() + STEAM_READY;
    while Instant::now() < deadline {
        if cancel.load(Ordering::Relaxed) {
            return Err("Launch cancelled".into());
        }
        if client_ready(&steam, prefix) {
            nudge_silent_client(wine, prefix);
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    if client_ready(&steam, prefix) {
        nudge_silent_client(wine, prefix);
        Ok(())
    } else if bootstrap_busy(&read_steam_log(steam_root, "bootstrap_log.txt")) {
        Err(
            "Steam is still updating. Wait until the Steam window finishes, then press Play."
                .into(),
        )
    } else {
        Err(
            "Windows Steam did not finish signing in. Sign in again from Settings → Steam, then press Play."
                .into(),
        )
    }
}

fn pid_present(steam_exe: &Path) -> bool {
    steam_exe
        .parent()
        .map(|dir| dir.join("steam.pid"))
        .is_some_and(|pid| pid.is_file())
}

fn client_ready(steam_exe: &Path, prefix: &Path) -> bool {
    let Some(root) = steam_exe.parent() else {
        return false;
    };
    play_client_ready(
        &process_commands(),
        prefix,
        &read_steam_log(root, "bootstrap_log.txt"),
        &read_steam_log(root, "connection_log.txt"),
    )
}

fn play_client_ready(commands: &str, prefix: &Path, bootstrap: &str, connection: &str) -> bool {
    steam_running(commands, prefix) && !bootstrap_busy(bootstrap) && client_logged_on(connection)
}

fn write_play_steam_cfg(steam_root: &Path) -> Result<(), String> {
    let path = steam_root.join("steam.cfg");
    if path
        .symlink_metadata()
        .is_ok_and(|meta| meta.file_type().is_symlink())
    {
        return Err("Steam configuration cannot be a symlink".into());
    }
    std::fs::write(
        &path,
        "BootStrapperInhibitAll = Enable\nBootStrapperForceSelfUpdate = False\n",
    )
    .map_err(|_| "Steam could not skip its updater before play".to_string())
}

fn read_steam_log(steam_root: &Path, name: &str) -> String {
    let path = steam_root.join("logs").join(name);
    let Ok(metadata) = std::fs::metadata(&path) else {
        return String::new();
    };
    let Ok(mut file) = std::fs::File::open(&path) else {
        return String::new();
    };
    if metadata.len() > LOG_LIMIT
        && file
            .seek(SeekFrom::Start(metadata.len() - LOG_LIMIT))
            .is_err()
    {
        return String::new();
    }
    let mut content = String::new();
    if file.take(LOG_LIMIT).read_to_string(&mut content).is_err() {
        return String::new();
    }
    content
}

fn bootstrap_busy(log: &str) -> bool {
    let Some(last) = log.lines().rev().find(|line| !line.trim().is_empty()) else {
        return false;
    };
    let last = last.to_ascii_lowercase();
    last.contains("verifying all executable checksums")
        || last.contains("verifying installation")
        || last.contains("checking for available updates")
        || last.contains("downloading manifest")
        || last.contains("updating steam")
}

fn client_logged_on(log: &str) -> bool {
    steam_account::connection_logged_on(log)
}

fn process_commands() -> String {
    let Ok(output) = std::process::Command::new("ps")
        .args(["axeww", "-o", "command="])
        .output()
    else {
        return String::new();
    };
    if output.stdout.len() > 8 * 1024 * 1024 {
        return String::new();
    }
    String::from_utf8_lossy(&output.stdout).into_owned()
}

fn steam_running(commands: &str, prefix: &Path) -> bool {
    let needle = prefix.to_string_lossy();
    if needle.is_empty() {
        return false;
    }
    commands.lines().any(|line| {
        line.contains(needle.as_ref()) && line.to_ascii_lowercase().contains("steam.exe")
    })
}

fn prefix_busy(prefix: &Path) -> bool {
    prefix_busy_from(&process_commands(), prefix)
}

fn prefix_busy_from(commands: &str, prefix: &Path) -> bool {
    let needle = prefix.to_string_lossy();
    !needle.is_empty() && commands.contains(needle.as_ref())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn silent_nudge_is_a_no_op_without_a_running_client() {
        nudge_silent_client(Path::new("/missing-wine"), Path::new("/missing-prefix"));
    }

    #[test]
    fn silent_steam_keeps_the_official_client_headless() {
        let argv = silent_argv(Path::new("/Steam/steam.exe"));
        assert_eq!(argv[0], "/Steam/steam.exe");
        assert!(argv.contains(&"-silent".into()));
        assert!(argv.contains(&"-noverifyfiles".into()));
        assert!(argv.contains(&"-norepairfiles".into()));
        assert!(!argv.iter().any(|flag| flag.contains("cef-disable-gpu")));
    }

    #[test]
    fn steamworks_exit_explains_the_missing_client() {
        let message = play_exit_message(53);
        assert!(message.contains("Steam was not ready"));
        assert!(message.to_ascii_lowercase().contains("sign in"));
        assert!(!play_exit_message(1).contains("sign in"));
        assert!(play_exit_message(1).contains("1"));
    }

    #[test]
    fn shared_prefix_must_be_the_signed_in_steam_environment() {
        let root = std::env::temp_dir().join(format!("orbit-shared-{}", uuid::Uuid::new_v4()));
        let allowed = root.join("steam-windows/prefix");
        fs::create_dir_all(allowed.join("drive_c")).unwrap();
        fs::write(allowed.join("system.reg"), b"reg").unwrap();
        let other = root.join("other");
        fs::create_dir_all(&other).unwrap();
        fs::write(other.join("system.reg"), b"reg").unwrap();
        assert!(prefix::accept_shared(&allowed, &allowed).is_ok());
        assert!(prefix::accept_shared(&other, &allowed).is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn verifying_bootstrap_is_not_ready_to_play() {
        let verifying = "[2026-11-15 20:23:16] Nothing to do\n[2026-11-15 20:23:16] Verifying installation...\n[2026-11-15 20:23:16] Verifying all executable checksums\n";
        assert!(bootstrap_busy(verifying));
        assert!(!bootstrap_busy(
            "[2026-11-15 20:20:51] Nothing to do\n[2026-11-15 20:20:51] Verifying installation...\n[2026-11-15 20:20:51] Verification skipped\n"
        ));
        let connecting = "[Connecting, 0, 7] [U:1:0] Connect() starting connection\n";
        let logged = "[Logged On, 4, 7] [U:1:280673132] RecvMsgClientLogOnResponse() : processing complete\n";
        assert!(!client_logged_on(connecting));
        assert!(client_logged_on(logged));
        assert!(!client_logged_on(&format!("{logged}{connecting}")));
        assert!(!client_logged_on(
            "[Logged Off, 0, 0] [U:1:280673132] CSteamEngine::CheckForBackupOrRestore() scheduling LogOn()\n"
        ));
        let prefix = Path::new("/tmp/orbit-steam-prefix");
        let running = format!(
            "WINEPREFIX={} C:\\\\Program Files (x86)\\\\Steam\\\\steam.exe -silent\n",
            prefix.display()
        );
        assert!(!play_client_ready(&running, prefix, verifying, logged));
        assert!(play_client_ready(
            &running,
            prefix,
            "[2026-11-15 20:20:51] Verification skipped\n",
            logged
        ));
    }

    #[test]
    fn play_log_reads_the_tail_of_a_large_file() {
        let root = std::env::temp_dir().join(format!("orbit-steam-log-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("logs")).unwrap();
        let mut body = "x".repeat(LOG_LIMIT as usize);
        body.push_str(
            "[Logged On, 4, 7] [U:1:280673132] RecvMsgClientLogOnResponse() : processing complete\n",
        );
        fs::write(root.join("logs/connection_log.txt"), body).unwrap();
        assert!(client_logged_on(&read_steam_log(
            &root,
            "connection_log.txt"
        )));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn play_steam_cfg_skips_the_updater_window() {
        let root = std::env::temp_dir().join(format!("orbit-steam-cfg-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        write_play_steam_cfg(&root).unwrap();
        let cfg = fs::read_to_string(root.join("steam.cfg")).unwrap();
        assert!(cfg.contains("BootStrapperInhibitAll = Enable"));
        assert!(cfg.contains("BootStrapperForceSelfUpdate = False"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn leftover_steam_pid_without_a_wineserver_is_not_ready() {
        let root = std::env::temp_dir().join(format!("orbit-stale-pid-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let steam = root.join("steam.exe");
        fs::write(&steam, b"MZ").unwrap();
        fs::write(root.join("steam.pid"), b"1").unwrap();
        assert!(pid_present(&steam));
        assert!(!prefix_busy(&root.join("missing-prefix")));
        assert!(!client_ready(&steam, &root.join("missing-prefix")));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn silent_steam_is_ready_when_steam_exe_is_in_the_prefix() {
        let prefix = Path::new("/tmp/orbit-steam-prefix");
        let running = format!(
            "WINEPREFIX={} C:\\\\Program Files (x86)\\\\Steam\\\\steam.exe -silent\n",
            prefix.display()
        );
        assert!(steam_running(&running, prefix));
        assert!(!steam_running(
            "WINEPREFIX=/tmp/orbit-steam-prefix wineserver\n",
            prefix
        ));
        assert!(!steam_running("C:\\\\Steam\\\\steam.exe -silent\n", prefix));
    }

    #[test]
    fn saved_login_flips_auto_login_in_place() {
        let root = std::env::temp_dir().join(format!("orbit-autologin-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("loginusers.vdf");
        fs::write(
            &path,
            "\"users\"\n{\n\t\"76561197960265729\"\n\t{\n\t\t\"AccountName\"\t\t\"orbit_player\"\n\t\t\"AutoLogin\"\t\t\"0\"\n\t}\n}\n",
        )
        .unwrap();
        steam_account::enable_saved_login(&path);
        let updated = fs::read_to_string(&path).unwrap();
        assert!(updated.contains("\"AutoLogin\"\t\t\"1\""));
        assert!(updated.contains("\"MostRecent\"\t\t\"1\""));
        assert!(!updated.contains("\"AutoLogin\"\t\t\"0\""));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn owned_play_rejects_non_numeric_app_ids() {
        let repo = GameRepository::open_in_memory().unwrap();
        let Err(error) = launch_owned(&repo, "re2", &AtomicBool::new(false)) else {
            panic!("non-numeric Steam ids must not start a play session");
        };
        assert!(error.contains("number"));
    }

    fn process_mentions(needle: &str) -> bool {
        let Ok(output) = std::process::Command::new("ps")
            .args(["axeww", "-o", "command="])
            .output()
        else {
            return false;
        };
        String::from_utf8_lossy(&output.stdout)
            .to_ascii_lowercase()
            .contains(&needle.to_ascii_lowercase())
    }

    fn wait_for_game(
        needle: &str,
        mut runtime: Box<dyn RuntimeProcess>,
    ) -> Result<Box<dyn RuntimeProcess>, String> {
        let deadline = Instant::now() + Duration::from_secs(120);
        while Instant::now() < deadline {
            if process_mentions(needle) {
                return Ok(runtime);
            }
            if let Ok(Some(code)) = runtime.poll() {
                return Err(play_exit_message(code));
            }
            std::thread::sleep(Duration::from_secs(2));
        }
        Err(format!("{needle} did not start"))
    }

    fn set_graphics(
        repo: &GameRepository,
        graphics: crate::runtimes::settings::GraphicsBackend,
    ) -> Result<(), String> {
        let mut settings =
            crate::runtimes::settings::load_global(repo).map_err(|err| format!("{err:#}"))?;
        settings.graphics = graphics;
        crate::runtimes::settings::save_global(repo, &settings).map_err(|err| format!("{err:#}"))
    }

    fn play_and_stop(repo: &GameRepository, app_id: &str, needle: &str) -> Result<(), String> {
        eprintln!("play {app_id} waiting for {needle}");
        let cancel = AtomicBool::new(false);
        let runtime = launch_owned(repo, app_id, &cancel)?;
        eprintln!("play {app_id} spawned pid={}", runtime.pid());
        let mut runtime = wait_for_game(needle, runtime)?;
        eprintln!("play {app_id} saw {needle}");
        std::thread::sleep(Duration::from_secs(8));
        runtime.stop().map_err(|err| format!("{err:#}"))?;
        eprintln!("play {app_id} stopped");
        Ok(())
    }

    #[test]
    #[ignore]
    fn live_play_re2_and_gow_with_graphics_presets() {
        let repo = GameRepository::open(&crate::utils::paths::database_path()).unwrap();
        let entries = steam_windows::stored_entries(&repo).unwrap();
        let paths = steam_windows::preferences(&repo)
            .unwrap()
            .additional_library_paths;
        let installed = steam_windows::installed_app_ids(&entries, &paths);
        let mut entries = crate::services::steam_catalog::include_installed(entries, &installed);
        let key = crate::utils::api_keys::steamgriddb_api_key(&repo);
        let changed = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(async {
                crate::services::steam_catalog::hydrate(
                    &mut entries,
                    key.as_deref(),
                    &installed,
                    &Default::default(),
                    false,
                )
                .await
            });
        if changed {
            steam_windows::save_library(&repo, &entries).unwrap();
        }
        let named = entries
            .iter()
            .filter(|entry| {
                !crate::services::steam_catalog::is_placeholder_title(&entry.title, &entry.app_id)
            })
            .count();
        eprintln!(
            "catalog {} owned, {} named, {} installed",
            entries.len(),
            named,
            installed.len()
        );
        if named < 4 {
            eprintln!("catalog titles still placeholders after hydrate named={named}");
        }
        assert!(
            installed.contains("883710") && installed.contains("1593500"),
            "GameHub installs must count as installed"
        );
        assert!(
            entries.len() > installed.len(),
            "All games must include owned titles that are not installed"
        );
        set_graphics(&repo, crate::runtimes::settings::GraphicsBackend::D3dmetal).unwrap();
        play_and_stop(&repo, "883710", "re2.exe").expect("GPTK Resident Evil 2");
        play_and_stop(&repo, "1593500", "gow.exe").expect("GPTK God of War");
        set_graphics(&repo, crate::runtimes::settings::GraphicsBackend::Dxmt).unwrap();
        play_and_stop(&repo, "883710", "re2.exe").expect("DXMT Resident Evil 2");
        set_graphics(&repo, crate::runtimes::settings::GraphicsBackend::Dxvk).unwrap();
        play_and_stop(&repo, "883710", "re2.exe").expect("DXVK Resident Evil 2");
        set_graphics(&repo, crate::runtimes::settings::GraphicsBackend::D3dmetal).unwrap();
    }
}
