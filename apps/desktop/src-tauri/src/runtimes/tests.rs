use super::*;
use std::{fs, path::PathBuf};

fn sandbox() -> PathBuf {
    let p = std::env::temp_dir().join(format!("orbit-runtime-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&p).unwrap();
    p
}

#[test]
fn profile_round_trip_and_old_launches_remain_readable() {
    let config: crate::models::LaunchConfiguration = serde_json::from_value(serde_json::json!({
        "type":"wine", "profile": {"executable":"/Games/My Game.exe", "runtimePath":"/opt/wine/bin/wine"}
    })).unwrap();
    let json = serde_json::to_string(&config).unwrap();
    assert_eq!(
        serde_json::from_str::<crate::models::LaunchConfiguration>(&json).unwrap(),
        config
    );
    assert!(serde_json::from_str::<crate::models::LaunchConfiguration>(
        r#"{"type":"steam","appId":"570"}"#
    )
    .is_ok());
}

#[test]
fn rejects_prefix_escape_and_symlinks() {
    let root = sandbox();
    assert!(prefix::game_directory(&root, "../outside").is_err());
    assert!(prefix::game_directory(&root, "/outside").is_err());
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(std::env::temp_dir(), root.join("game")).unwrap();
        assert!(prefix::game_directory(&root, "game").is_err());
    }
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn rejects_non_pe_files_and_reserved_environment() {
    let root = sandbox();
    let exe = root.join("fake.exe");
    fs::write(&exe, b"not a Windows executable").unwrap();
    assert!(validation::windows_executable(&exe).is_err());
    let mut profile = WineProfile::default();
    profile
        .environment
        .insert("WINEPREFIX".into(), "/shared".into());
    assert!(profile.validate_options().is_err());
    profile.environment.clear();
    profile
        .environment
        .insert("DYLD_INSERT_LIBRARIES".into(), "evil".into());
    assert!(profile.validate_options().is_err());
    profile.environment.clear();
    profile.arguments = vec!["a b".into(), "$(touch /tmp/should-not-exist)".into()];
    assert!(profile.validate_options().is_ok());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn valid_pe_and_arguments_remain_literal() {
    let root = sandbox();
    let exe = root.join("game with spaces.exe");
    let mut bytes = vec![0u8; 128];
    bytes[..2].copy_from_slice(b"MZ");
    bytes[60..64].copy_from_slice(&64u32.to_le_bytes());
    bytes[64..68].copy_from_slice(b"PE\0\0");
    fs::write(&exe, bytes).unwrap();
    assert!(validation::windows_executable(&exe).is_ok());
    let p = WineProfile {
        arguments: vec!["hello world".into(), "; echo nope".into()],
        ..Default::default()
    };
    let cmd = wine::game_command(&PathBuf::from("/wine"), &root, &exe, &p);
    assert_eq!(
        cmd.get_args()
            .map(|a| a.to_string_lossy().into_owned())
            .collect::<Vec<_>>(),
        vec![
            exe.to_string_lossy().into_owned(),
            "hello world".into(),
            "; echo nope".into()
        ]
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn bounded_child_wait_times_out_and_reaps() {
    #[cfg(unix)]
    {
        let mut child = std::process::Command::new("/bin/sleep")
            .arg("10")
            .spawn()
            .unwrap();
        let cancel = std::sync::atomic::AtomicBool::new(false);
        assert!(
            process::wait_bounded(&mut child, std::time::Duration::from_millis(20), &cancel)
                .is_err()
        );
        assert!(child.try_wait().unwrap().is_some());
    }
}

#[cfg(unix)]
fn script(path: &std::path::Path, body: &str) {
    use std::os::unix::fs::PermissionsExt;
    fs::write(path, format!("#!/bin/sh\n{body}\n")).unwrap();
    fs::set_permissions(path, fs::Permissions::from_mode(0o700)).unwrap();
}

#[test]
#[cfg(unix)]
fn detects_real_version_output_and_rejects_missing_server() {
    let root = sandbox();
    script(&root.join("wine"), "printf 'wine-test-1.0\\n'");
    assert!(detection::probe(&root.join("wine")).is_err());
    script(&root.join("wineserver"), "exit 0");
    assert_eq!(
        detection::probe(&root.join("wine")).unwrap().version,
        "wine-test-1.0"
    );
    script(&root.join("wine"), "printf 'not wine\\n'");
    assert!(detection::probe(&root.join("wine")).is_err());
    fs::remove_dir_all(root).unwrap();
}

#[test]
#[cfg(unix)]
fn probe_allows_slow_first_start_initialization() {
    let root = sandbox();
    script(&root.join("wine"), "sleep 4; printf 'wine-slow-start\\n'");
    script(&root.join("wineserver"), "exit 0");
    let runtime = detection::probe(&root.join("wine")).unwrap();
    assert_eq!(runtime.version, "wine-slow-start");
    fs::remove_dir_all(root).unwrap();
}

#[test]
#[cfg(unix)]
fn failed_prefix_setup_is_removed_and_can_be_retried() {
    use std::sync::atomic::AtomicBool;
    let root = sandbox();
    script(&root.join("wine"), "exit 7");
    script(&root.join("wineserver"), "exit 0");
    let runtime = detection::WineInstallation {
        path: root.join("wine").to_string_lossy().into_owned(),
        server_path: root.join("wineserver").to_string_lossy().into_owned(),
        version: "wine-test".into(),
    };
    let dir = prefix::game_directory(&root.join("data"), "game").unwrap();
    let log = process::log_file(&dir.join("latest.log")).unwrap();
    assert!(prefix::prepare(&dir, &runtime, &AtomicBool::new(false), &log).is_err());
    assert!(!dir.join("prefix").exists());
    script(&root.join("wine"), "touch \"$WINEPREFIX/system.reg\"");
    assert!(prefix::prepare(&dir, &runtime, &AtomicBool::new(false), &log).is_ok());
    let other = detection::WineInstallation {
        version: "wine-other".into(),
        ..runtime
    };
    assert!(prefix::prepare(&dir, &other, &AtomicBool::new(false), &log).is_err());
    assert!(dir.join("prefix/system.reg").exists());
    fs::remove_dir_all(root).unwrap();
}

#[test]
#[cfg(unix)]
fn lifecycle_tracks_child_exit_code_and_reaps_owned_process() {
    use std::sync::atomic::AtomicBool;
    let root = sandbox();
    script(&root.join("wine"), "case \"$1\" in --version) echo wine-test;; wineboot) touch \"$WINEPREFIX/system.reg\";; reg) exit 0;; *) echo game-started; exit 7;; esac");
    script(&root.join("wineserver"), "exit 0");
    let exe = root.join("demo.exe");
    let mut bytes = vec![0; 128];
    bytes[..2].copy_from_slice(b"MZ");
    bytes[60..64].copy_from_slice(&64u32.to_le_bytes());
    bytes[64..68].copy_from_slice(b"PE\0\0");
    fs::write(&exe, bytes).unwrap();
    let profile = WineProfile {
        executable: exe.to_string_lossy().into_owned(),
        runtime_path: root.join("wine").to_string_lossy().into_owned(),
        ..Default::default()
    };
    let mut handle = wine::WineAdapter
        .launch(
            &profile,
            "game",
            &root.join("data"),
            &AtomicBool::new(false),
        )
        .unwrap();
    let started = std::time::Instant::now();
    loop {
        if let Some(code) = handle.poll().unwrap() {
            assert_eq!(code, 7);
            break;
        }
        assert!(started.elapsed() < std::time::Duration::from_secs(3));
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    handle.stop().unwrap();
    assert!(fs::read_to_string(root.join("data/game/latest.log"))
        .unwrap()
        .contains("game-started"));
    fs::remove_dir_all(root).unwrap();
}

/// Opt-in hardware validation, never represented by a fake executable. Uses an
/// installed Wine distribution and real Windows binary supplied by the operator.
#[test]
#[ignore = "requires ORBIT_TEST_WINE and ORBIT_TEST_EXE on a real host"]
fn real_wine_launch_and_stop() {
    let root = sandbox();
    let profile = WineProfile {
        executable: std::env::var("ORBIT_TEST_EXE").unwrap(),
        runtime_path: std::env::var("ORBIT_TEST_WINE").unwrap(),
        ..Default::default()
    };
    let result = wine::WineAdapter.launch(
        &profile,
        "smoke-game",
        &root,
        &std::sync::atomic::AtomicBool::new(false),
    );
    let mut handle = match result {
        Ok(handle) => handle,
        Err(error) => panic!(
            "{error:#}; diagnostics: {}",
            fs::read_to_string(root.join("smoke-game/latest.log")).unwrap_or_default()
        ),
    };
    std::thread::sleep(std::time::Duration::from_secs(5));
    assert_eq!(
        handle.poll().unwrap(),
        None,
        "Windows game must remain running"
    );
    handle.stop().unwrap();
    drop(handle);
    fs::remove_dir_all(root).unwrap();
}

#[test]
#[cfg(unix)]
fn cancellation_reaps_preparation_and_never_creates_a_ready_marker() {
    use std::sync::atomic::AtomicBool;
    let root = sandbox();
    script(&root.join("wine"), "exec /bin/sleep 30");
    script(&root.join("wineserver"), "exit 0");
    let runtime = detection::WineInstallation {
        path: root.join("wine").to_string_lossy().into_owned(),
        server_path: root.join("wineserver").to_string_lossy().into_owned(),
        version: "wine-test".into(),
    };
    let dir = prefix::game_directory(&root.join("data"), "cancelled").unwrap();
    let log = process::log_file(&dir.join("latest.log")).unwrap();
    let start = std::time::Instant::now();
    assert!(prefix::prepare(&dir, &runtime, &AtomicBool::new(true), &log).is_err());
    assert!(start.elapsed() < std::time::Duration::from_secs(3));
    assert!(!dir.join("runtime.json").exists());
    assert!(!dir.join("prefix").exists());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn child_environment_does_not_inherit_orbit_credentials() {
    let command = process::command(
        std::path::Path::new("/wine"),
        std::path::Path::new("/private-prefix"),
    );
    let configured: Vec<_> = command
        .get_envs()
        .map(|(key, _)| key.to_string_lossy().into_owned())
        .collect();
    assert!(configured.contains(&"WINEPREFIX".into()));
    assert!(!configured.contains(&"RAWG_API_KEY".into()));
    assert!(!configured.contains(&"STEAMGRIDDB_API_KEY".into()));
    assert!(!configured.contains(&"DYLD_INSERT_LIBRARIES".into()));
}

#[test]
fn wine_profile_survives_database_reopen_without_changing_existing_games() {
    use crate::{
        database::GameRepository,
        models::{CreateGameRequest, GamePlatform, GameProvider, LaunchConfiguration},
    };
    let root = sandbox();
    let path = root.join("library.sqlite");
    let repo = GameRepository::open(&path).unwrap();
    let config = LaunchConfiguration::Wine {
        profile: WineProfile {
            executable: "/games/demo.exe".into(),
            runtime_path: "/wine/bin/wine".into(),
            arguments: vec!["two words".into()],
            ..Default::default()
        },
    };
    let game = repo
        .create_game(CreateGameRequest {
            title: "Windows game".into(),
            description: None,
            provider: GameProvider::Manual,
            platform: GamePlatform::Windows,
            launch_config: config.clone(),
            artwork: None,
            install_size_bytes: None,
        })
        .unwrap();
    drop(repo);
    let repo = GameRepository::open(&path).unwrap();
    let restored = repo.get_game(&game.id).unwrap().unwrap();
    assert_eq!(restored.launch_config, config);
    assert_eq!(restored.platform, GamePlatform::Windows);
    drop(repo);
    fs::remove_dir_all(root).unwrap();
}

#[test]
#[cfg(unix)]
fn diagnostics_are_capped_while_output_keeps_draining() {
    let root = sandbox();
    let log = process::log_file(&root.join("log")).unwrap();
    let mut command = std::process::Command::new("/usr/bin/head");
    command.args(["-c", "2097152", "/dev/zero"]);
    let mut child = process::spawn_logged(&mut command, &log).unwrap();
    assert!(process::wait_bounded(
        &mut child,
        std::time::Duration::from_secs(3),
        &std::sync::atomic::AtomicBool::new(false)
    )
    .unwrap()
    .success());
    assert!(fs::metadata(root.join("log")).unwrap().len() <= 1_048_576);
    fs::remove_dir_all(root).unwrap();
}

#[test]
#[cfg(unix)]
fn sanitized_child_environment_excludes_inherited_values() {
    std::env::set_var("ORBIT_RUNTIME_TEST_SECRET", "test-value");
    let output = process::base_command(std::path::Path::new("/usr/bin/env"))
        .output()
        .unwrap();
    std::env::remove_var("ORBIT_RUNTIME_TEST_SECRET");
    assert!(output.status.success());
    assert!(!String::from_utf8_lossy(&output.stdout).contains("ORBIT_RUNTIME_TEST_SECRET"));
}

#[test]
#[cfg(unix)]
fn failed_server_monitor_is_not_reported_as_successful_game_exit() {
    let root = sandbox();
    script(&root.join("wine"), "case \"$1\" in --version) echo wine-test;; wineboot) touch \"$WINEPREFIX/system.reg\";; reg) exit 0;; *) touch \"$WINEPREFIX/game-started\";; esac");
    script(
        &root.join("wineserver"),
        "if [ \"$1\" = -w ] && [ -f \"$WINEPREFIX/game-started\" ]; then exit 5; fi; exit 0",
    );
    let exe = root.join("demo.exe");
    let mut bytes = vec![0; 128];
    bytes[..2].copy_from_slice(b"MZ");
    bytes[60..64].copy_from_slice(&64u32.to_le_bytes());
    bytes[64..68].copy_from_slice(b"PE\0\0");
    fs::write(&exe, bytes).unwrap();
    let profile = WineProfile {
        executable: exe.to_string_lossy().into_owned(),
        runtime_path: root.join("wine").to_string_lossy().into_owned(),
        ..Default::default()
    };
    let mut handle = wine::WineAdapter
        .launch(
            &profile,
            "game",
            &root.join("data"),
            &std::sync::atomic::AtomicBool::new(false),
        )
        .unwrap();
    let start = std::time::Instant::now();
    loop {
        match handle.poll() {
            Err(_) => break,
            Ok(None) => {}
            Ok(Some(_)) => panic!("A failed monitor cannot certify game exit"),
        }
        assert!(start.elapsed() < std::time::Duration::from_secs(3));
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    fs::remove_file(root.join("data/game/prefix/game-started")).unwrap();
    handle.stop().unwrap();
    drop(handle);
    fs::remove_dir_all(root).unwrap();
}
