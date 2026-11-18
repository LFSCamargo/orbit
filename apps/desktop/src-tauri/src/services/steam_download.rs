//! SteamCMD argument construction and progress parsing.
//! The account name is the only identity passed through, never a password.

use std::path::{Path, PathBuf};

use std::collections::VecDeque;

/// What SteamCMD is doing with the bytes it reports.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DownloadStage {
    Downloading,
    Verifying,
    Preallocating,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DownloadProgress {
    pub stage: DownloadStage,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
}

pub fn valid_app_id(app_id: &str) -> bool {
    !app_id.is_empty()
        && app_id.len() <= 10
        && app_id.chars().all(|c| c.is_ascii_digit())
        && app_id != "0"
}

pub fn install_dir(session_dir: &Path, app_id: &str) -> Result<PathBuf, String> {
    if !valid_app_id(app_id) {
        return Err("Steam app id must be a number".into());
    }
    let dir = session_dir.join("games").join(app_id);
    if dir
        .components()
        .any(|part| matches!(part, std::path::Component::ParentDir))
    {
        return Err("Install directory escapes the Steam session folder".into());
    }
    Ok(dir)
}

/// Official headless client arguments. There is no password argument.
pub fn steamcmd_arguments(
    account: &str,
    app_id: &str,
    install_dir: &Path,
    offline_mode: bool,
    verify_files: bool,
) -> Result<Vec<String>, String> {
    if !crate::utils::steam_account::valid_account_name(account) {
        return Err("Steam account name is missing".into());
    }
    if !valid_app_id(app_id) {
        return Err("Steam app id must be a number".into());
    }
    let mut args = vec![
        "+@ShutdownOnFailedCommand".into(),
        "1".into(),
        "+@sSteamCmdForcePlatformType".into(),
        "windows".into(),
        "+force_install_dir".into(),
        install_dir.to_string_lossy().into_owned(),
    ];
    if offline_mode {
        args.push("+@bClientTryOfflineMode".into());
        args.push("1".into());
    }
    args.extend([
        "+login".into(),
        account.into(),
        "+app_update".into(),
        app_id.into(),
    ]);
    if verify_files {
        args.push("validate".into());
    }
    args.push("+quit".into());
    Ok(args)
}

pub fn parse_progress_line(line: &str) -> Option<DownloadProgress> {
    let marker = "progress:";
    let start = line.find(marker)? + marker.len();
    let rest = line[start..].trim();
    let open = rest.find('(')? + 1;
    let close = rest.find(')')?;
    let mut parts = rest[open..close].split('/');
    let downloaded = parts.next()?.trim().parse().ok()?;
    let total = parts.next()?.trim().parse().ok()?;
    if total == 0 {
        return None;
    }
    let state = line[..start].to_ascii_lowercase();
    let stage = if state.contains("verifying") {
        DownloadStage::Verifying
    } else if state.contains("preallocating") {
        DownloadStage::Preallocating
    } else {
        DownloadStage::Downloading
    };
    Some(DownloadProgress {
        stage,
        downloaded_bytes: downloaded,
        total_bytes: total,
    })
}

pub fn asks_for_secret(line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    lower.contains("password") || lower.contains("steam guard") || lower.contains("two-factor")
}

/// Shallow search for a game executable. Crash and uninstall helpers are skipped.
/// Breadth-first, at most 400 entries and four levels. O(E), O(E) bounded storage.
/// A root executable is selected before descending into asset/crash folders.
pub fn find_game_executable(root: &Path) -> Option<PathBuf> {
    let mut directories = VecDeque::from([(root.to_path_buf(), 0usize)]);
    let mut seen = 0usize;
    while let Some((directory, depth)) = directories.pop_front() {
        if depth >= 4 || seen >= 400 {
            continue;
        }
        let Ok(entries) = std::fs::read_dir(directory) else {
            continue;
        };
        let mut best: Option<PathBuf> = None;
        for entry in entries.take(400 - seen) {
            seen += 1;
            let Ok(entry) = entry else {
                continue;
            };
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            if kind.is_dir() {
                directories.push_back((entry.path(), depth + 1));
                continue;
            }
            if !kind.is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
            if !name.ends_with(".exe")
                || ["uninstall", "crash", "setup"]
                    .iter()
                    .any(|word| name.contains(word))
            {
                continue;
            }
            let path = entry.path();
            if best.as_ref().is_none_or(|previous| path < *previous) {
                best = Some(path);
            }
        }
        if best.is_some() {
            return best;
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn arguments_force_windows_and_never_carry_a_password() {
        let args = steamcmd_arguments(
            "orbit_player",
            "570",
            Path::new("/tmp/orbit/games/570"),
            false,
            true,
        )
        .unwrap();
        assert!(args.iter().any(|arg| arg == "windows"));
        assert!(args.iter().any(|arg| arg == "+login"));
        assert!(args.iter().any(|arg| arg == "validate"));
        assert!(!args.iter().any(|arg| arg == "+@bClientTryOfflineMode"));
        assert_eq!(args.iter().filter(|arg| *arg == "orbit_player").count(), 1);
        let joined = args.join(" ").to_ascii_lowercase();
        assert!(!joined.contains("password"));
        assert!(!joined.contains("guard"));
        assert!(
            steamcmd_arguments("orbit_player", "../570", Path::new("/tmp"), false, true).is_err()
        );
    }

    #[test]
    fn offline_mode_uses_the_cached_session_and_can_skip_file_verification() {
        let args = steamcmd_arguments(
            "orbit_player",
            "570",
            Path::new("/tmp/orbit/games/570"),
            true,
            false,
        )
        .unwrap();
        let offline = args
            .iter()
            .position(|arg| arg == "+@bClientTryOfflineMode")
            .unwrap();
        let login = args.iter().position(|arg| arg == "+login").unwrap();
        assert!(offline < login);
        assert_eq!(args.get(offline + 1).map(String::as_str), Some("1"));
        assert!(!args.iter().any(|arg| arg == "validate"));
        assert!(!args.join(" ").to_ascii_lowercase().contains("password"));
    }

    #[test]
    fn parses_steamcmd_download_progress() {
        let line = "Update state (0x61) downloading, progress: 41.25 (100 / 400)";
        let progress = parse_progress_line(line).unwrap();
        assert_eq!(progress.downloaded_bytes, 100);
        assert_eq!(progress.total_bytes, 400);
        assert_eq!(progress.stage, DownloadStage::Downloading);
        assert!(parse_progress_line("Waiting for client config...").is_none());
        assert!(asks_for_secret("Password:"));
        assert!(!asks_for_secret(line));
    }

    #[test]
    fn verify_and_preallocate_lines_are_not_reported_as_downloading() {
        let verifying =
            parse_progress_line("Update state (0x5) verifying install, progress: 10.00 (10 / 100)")
                .unwrap();
        assert_eq!(verifying.stage, DownloadStage::Verifying);
        let allocating =
            parse_progress_line("Update state (0x11) preallocating, progress: 50.00 (50 / 100)")
                .unwrap();
        assert_eq!(allocating.stage, DownloadStage::Preallocating);
        assert!(
            parse_progress_line("Update state (0x3) reconfiguring, progress: 0.00 (0 / 0)")
                .is_none()
        );
    }

    #[test]
    fn god_of_war_root_executable_is_not_hidden_by_large_crash_data() {
        let root = std::env::temp_dir().join(format!("orbit-gow-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join(".crashdata/content")).unwrap();
        for n in 0..450 {
            fs::write(root.join(format!(".crashdata/content/{n}.bin")), b"asset").unwrap();
        }
        fs::write(root.join("GoW.exe"), b"MZ").unwrap();
        assert_eq!(find_game_executable(&root), Some(root.join("GoW.exe")));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn finds_the_shallow_game_executable_and_skips_uninstallers() {
        let root = std::env::temp_dir().join(format!("orbit-steam-exe-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("bin")).unwrap();
        fs::write(root.join("uninstall.exe"), b"no").unwrap();
        fs::write(root.join("bin").join("game.exe"), b"yes").unwrap();
        fs::write(root.join("UnityCrashHandler64.exe"), b"no").unwrap();
        let found = find_game_executable(&root).unwrap();
        assert!(found.ends_with("game.exe"));
        let _ = fs::remove_dir_all(root);
    }
}
