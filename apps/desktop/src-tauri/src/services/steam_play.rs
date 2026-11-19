//! Play launches each Windows Steam title in its own Orbit-owned container.
//! The signed-in steam-windows prefix is a seed only: login files are copied
//! in, then the container's Steam client logs on with the saved session before
//! the game EXE starts with SteamAppId.

use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;

use super::container_steam::ClientWait;
use super::steam_windows::{self, steam_exe_in, steam_prefix};
use crate::database::GameRepository;
use crate::models::LaunchConfiguration;
use crate::runtimes::{prefix, wine::WineAdapter, RuntimeProcess};
use crate::utils::steam_account;

pub fn play_exit_message(code: i32) -> String {
    if code == 53 {
        "Steam was not ready. If a Steam update window is open, wait for it to finish or close it, then press Play. Otherwise sign in again from Settings → Steam.".into()
    } else {
        format!("The game exited with code {code}. Open Compatibility diagnostics for details.")
    }
}

pub fn launch_owned(
    repo: &GameRepository,
    app_id: &str,
    cancel: &AtomicBool,
) -> Result<Box<dyn RuntimeProcess>, String> {
    launch_owned_with(repo, app_id, cancel, &mut |_| {})
}

pub fn launch_owned_with(
    repo: &GameRepository,
    app_id: &str,
    cancel: &AtomicBool,
    progress: &mut impl FnMut(&str),
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
    let preferences = steam_windows::preferences(repo).unwrap_or_default();
    let mut resolved = crate::runtimes::settings::resolve_profile(repo, &profile)
        .map_err(|err| format!("{err:#}"))?;
    resolved.effective.graphics =
        super::game_fixes::graphics_for(app_id, resolved.effective.graphics, &resolved.selections);
    let prefix = play_environment(&resolved, app_id, cancel, &preferences, progress)?;
    resolved.shared_prefix = Some(prefix.to_string_lossy().into_owned());
    start_title(&resolved, &game.id, app_id, cancel, progress)
}

/// Clone a per-game container from the signed-in prefix, seed the saved login,
/// and wait until that container's Steam client has fully started.
pub fn play_environment(
    profile: &crate::runtimes::WineProfile,
    app_id: &str,
    cancel: &AtomicBool,
    preferences: &steam_windows::SteamWindowsPreferences,
    progress: &mut impl FnMut(&str),
) -> Result<PathBuf, String> {
    environment(
        profile,
        app_id,
        cancel,
        preferences,
        progress,
        ClientWait::Startup,
    )
}

/// The same container for a download, ready once its client is logged on.
pub fn download_environment(
    profile: &crate::runtimes::WineProfile,
    app_id: &str,
    cancel: &AtomicBool,
    preferences: &steam_windows::SteamWindowsPreferences,
    progress: &mut impl FnMut(&str),
) -> Result<PathBuf, String> {
    environment(
        profile,
        app_id,
        cancel,
        preferences,
        progress,
        ClientWait::LoggedOn,
    )
}

fn environment(
    profile: &crate::runtimes::WineProfile,
    app_id: &str,
    cancel: &AtomicBool,
    preferences: &steam_windows::SteamWindowsPreferences,
    progress: &mut impl FnMut(&str),
    wait: ClientWait,
) -> Result<PathBuf, String> {
    let extra_libraries = &preferences.additional_library_paths;
    let wine = Path::new(&profile.runtime_path);
    let runtime = crate::runtimes::detection::probe(wine).map_err(|err| format!("{err:#}"))?;
    let game_id = super::steam_native::downloads::container_id(app_id)?;
    let dir = crate::runtimes::containers::layout::directory(
        &crate::runtimes::containers::root_in(&crate::runtimes::root()),
        "games",
        &game_id,
    )
    .map_err(|err| format!("{err:#}"))?;
    let log = crate::runtimes::process::log_file(&dir.join("latest.log"))
        .map_err(|err| format!("{err:#}"))?;
    let request = crate::launching::first_launch::FirstLaunchRequest {
        game_id,
        app_id: Some(app_id.to_string()),
        wine: runtime,
        steam_source: Some(steam_prefix()),
        graphics: profile.effective.graphics,
        selections: profile.selections.clone(),
    };
    let prepared = crate::launching::first_launch::prepare(
        &crate::runtimes::root(),
        &request,
        cancel,
        &log,
        progress,
    )
    .map_err(|err| format!("{err:#}"))?;
    prepare_play_steam(&prepared.container.prefix, extra_libraries)?;
    // Steamworks titles need a logged-on client in their own container; run it
    // silently there instead of letting the game open a visible Steam.
    progress("steam");
    super::container_steam::ensure_running(
        &super::container_steam::SteamHost {
            wine: wine.to_path_buf(),
            prefix: prepared.container.prefix.clone(),
        },
        app_id,
        super::steam_play_config::PlayConfig {
            steam_input: preferences.steam_input,
            overlay: super::game_fixes::overlay_allowed(app_id, preferences.steam_overlay),
        },
        cancel,
        wait,
    )?;
    Ok(prepared.container.prefix)
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
    let prefix = profile
        .shared_prefix
        .as_deref()
        .map(Path::new)
        .ok_or("Sign in with Steam before playing this game")?;
    prefix::accept_shared(prefix, prefix).map_err(|err| err.to_string())?;
    let prepared = WineAdapter
        .prepare(profile, game_id, &crate::runtimes::root(), cancel, progress)
        .map_err(|err| format!("{err:#}"))?;
    if let Some(dir) = Path::new(&profile.executable).parent() {
        super::game_fixes::apply(app_id, dir);
    }
    progress("spawn");
    prepared
        .spawn(Some(app_id), cancel)
        .map_err(|err| format!("{err:#}"))
}

/// Keep Steam in the background when a saved login exists. Play does not open
/// the Steam store window and does not ask for another sign-in.
fn prepare_play_steam(prefix: &Path, extra_libraries: &[String]) -> Result<(), String> {
    let steam = steam_exe_in(prefix);
    if !steam.is_file() {
        return Ok(());
    }
    let Some(steam_root) = steam.parent() else {
        return Ok(());
    };
    let loginusers = steam_root.join("config/loginusers.vdf");
    if loginusers.is_file() {
        steam_account::enable_saved_login(&loginusers);
    }
    let _ = write_play_steam_cfg(steam_root);
    if extra_libraries.is_empty() {
        return Ok(());
    }
    // Games reach the container's `C:` library through these links; drive
    // libraries are never registered inside a container.
    super::steam_client_library::link_installs(steam_root, extra_libraries)?;
    Ok(())
}

pub fn silent_client_args(steam_exe: &Path) -> Vec<String> {
    vec![
        steam_exe.to_string_lossy().into_owned(),
        "-silent".into(),
        "-nofriendsui".into(),
        "-no-dwrite".into(),
        "-noverifyfiles".into(),
    ]
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{Duration, Instant};

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
    fn play_seeds_steam_files_without_waiting_for_steam_exe() {
        let root = std::env::temp_dir().join(format!("orbit-play-seed-{}", uuid::Uuid::new_v4()));
        let steam_root = root.join("drive_c/Program Files (x86)/Steam");
        fs::create_dir_all(steam_root.join("config")).unwrap();
        fs::write(root.join("system.reg"), b"reg").unwrap();
        fs::write(steam_root.join("steam.exe"), b"MZ").unwrap();
        fs::write(
            steam_root.join("config/loginusers.vdf"),
            "\"users\"\n{\n\t\"76561197960265729\"\n\t{\n\t\t\"AccountName\"\t\t\"orbit_player\"\n\t\t\"AutoLogin\"\t\t\"0\"\n\t}\n}\n",
        )
        .unwrap();
        prepare_play_steam(&root, &[]).unwrap();
        let cfg = fs::read_to_string(steam_root.join("steam.cfg")).unwrap();
        assert!(cfg.contains("BootStrapperInhibitAll = Enable"));
        let login = fs::read_to_string(steam_root.join("config/loginusers.vdf")).unwrap();
        assert!(login.contains("\"AutoLogin\"\t\t\"1\""));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn play_starts_steam_silently_instead_of_opening_the_store() {
        let args = silent_client_args(Path::new("/Steam/steam.exe"));
        assert!(args.contains(&"-silent".into()));
        assert!(args.contains(&"-nofriendsui".into()));
        assert!(!args.iter().any(|arg| arg == "-applaunch"));
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
    #[ignore = "plays Resident Evil 2 with the saved Settings sign-in"]
    fn live_play_re2_with_the_saved_sign_in() {
        let repo = GameRepository::open(&crate::utils::paths::database_path()).unwrap();
        let start = Instant::now();
        let mut trace = |step: &str| {
            eprintln!(
                "{:>6.1}s {} {step}",
                start.elapsed().as_secs_f32(),
                chrono::Local::now().format("%H:%M:%S")
            )
        };
        let mut runtime =
            launch_owned_with(&repo, "883710", &AtomicBool::new(false), &mut trace).unwrap();
        trace("spawned");
        while !process_mentions("re2.exe") {
            std::thread::sleep(Duration::from_millis(250));
        }
        trace("re2.exe running");
        let deadline = Instant::now() + Duration::from_secs(90);
        while Instant::now() < deadline {
            if let Ok(Some(code)) = runtime.poll() {
                panic!("game exited with {code}: {}", play_exit_message(code));
            }
            std::thread::sleep(Duration::from_secs(1));
        }
        runtime.stop().unwrap();
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
            "extra-library installs must count as installed"
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
