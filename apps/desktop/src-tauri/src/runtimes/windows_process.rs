//! Recognise Windows processes Orbit launched: the game versus Steam and
//! Wine's own services. Wine rewrites a process's `argv[0]` to its Windows
//! path, which `ps` and `KERN_PROCARGS2` report.

const HELPERS: [&str; 17] = [
    "steam.exe",
    "steamwebhelper.exe",
    "steamwebhelper-orbit-original.exe",
    "steamservice.exe",
    "steamerrorreporter.exe",
    "steam-session-helper.exe",
    "crs-handler.exe",
    "explorer.exe",
    "services.exe",
    "winedevice.exe",
    "plugplay.exe",
    "svchost.exe",
    "rpcss.exe",
    "lsass.exe",
    "tabtip.exe",
    "conhost.exe",
    "start.exe",
];

/// The `.exe` name of a Windows command line, lowercased.
pub fn exe_name(argv0: &str) -> Option<String> {
    let name = argv0
        .rsplit(['\\', '/'])
        .next()?
        .trim()
        .to_ascii_lowercase();
    name.ends_with(".exe").then_some(name)
}

/// A Windows process that is not Steam or a Wine service.
pub fn is_game_process(argv0: &str) -> bool {
    exe_name(argv0).is_some_and(|name| !HELPERS.contains(&name.as_str()))
}

/// `Some(true)` when this Steam helper command belongs to a signed-in client.
/// The account id is not kept.
pub fn webhelper_is_logged_in(command: &str) -> Option<bool> {
    if !command.to_ascii_lowercase().contains("steamwebhelper") {
        return None;
    }
    let marker = "-steamid=";
    let lower = command.to_ascii_lowercase();
    let at = lower.find(marker)?;
    let rest = &command[at + marker.len()..];
    let mut digits = rest.chars().take_while(|ch| ch.is_ascii_digit());
    let first = digits.next()?;
    let longer = digits.next().is_some();
    Some(first != '0' || longer)
}

/// Wine prefix that owns a `.../prefix/drive_c/...` path.
pub fn prefix_before_drive_c(path: &str) -> Option<&str> {
    let idx = path.find("/drive_c/")?;
    let prefix = &path[..idx];
    (!prefix.is_empty()).then_some(prefix)
}

pub fn lsof_cwd_path(output: &str) -> Option<&str> {
    for line in output.lines() {
        let Some(cwd_at) = line.find(" cwd") else {
            continue;
        };
        let after = &line[cwd_at + 4..];
        let Some(slash) = after.find(" /") else {
            continue;
        };
        let path = after[slash + 1..].trim();
        if !path.is_empty() {
            return Some(path);
        }
    }
    None
}

pub fn same_directory(left: &std::path::Path, right: &std::path::Path) -> bool {
    let Ok(left) = left.canonicalize() else {
        return false;
    };
    let Ok(right) = right.canonicalize() else {
        return false;
    };
    left == right
}

/// Prefix of a Steam client that is already signed in.
/// One process-list read, then at most eight working-directory lookups.
pub fn logged_in_prefix_from(
    processes: &str,
    mut cwd_of: impl FnMut(&str) -> Option<String>,
    mut ready: impl FnMut(&std::path::Path) -> bool,
) -> Option<std::path::PathBuf> {
    if processes.len() > 8 * 1024 * 1024 {
        return None;
    }
    let mut seen = 0u8;
    for line in processes.lines() {
        if seen == 8 {
            break;
        }
        if webhelper_is_logged_in(line) != Some(true) {
            continue;
        }
        let pid = line.split_whitespace().next().unwrap_or("");
        if pid.is_empty() || pid.len() > 10 || !pid.chars().all(|ch| ch.is_ascii_digit()) {
            continue;
        }
        seen += 1;
        let Some(cwd) = cwd_of(pid) else {
            continue;
        };
        let Some(prefix) = prefix_before_drive_c(&cwd) else {
            continue;
        };
        let path = std::path::PathBuf::from(prefix);
        if ready(&path) {
            return Some(path);
        }
    }
    None
}

pub fn logged_in_steam_prefix() -> Option<std::path::PathBuf> {
    let output = std::process::Command::new("ps")
        .args(["axeww", "-o", "pid=,command="])
        .output()
        .ok()?;
    if output.stdout.len() > 8 * 1024 * 1024 {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    logged_in_prefix_from(&text, lsof_cwd, orbit_prefix_ready)
}

fn lsof_cwd(pid: &str) -> Option<String> {
    if pid.len() > 10 || !pid.chars().all(|ch| ch.is_ascii_digit()) {
        return None;
    }
    let output = std::process::Command::new("lsof")
        .args(["-a", "-p", pid, "-d", "cwd"])
        .output()
        .ok()?;
    if !output.status.success() || output.stdout.len() > 64 * 1024 {
        return None;
    }
    lsof_cwd_path(&String::from_utf8_lossy(&output.stdout)).map(str::to_string)
}

fn orbit_prefix_ready(prefix: &std::path::Path) -> bool {
    if !prefix.join("system.reg").is_file() {
        return false;
    }
    let Ok(root) = crate::utils::paths::app_data_dir().canonicalize() else {
        return false;
    };
    let Ok(canon) = prefix.canonicalize() else {
        return false;
    };
    canon.starts_with(root)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn steam_and_wine_services_are_not_the_game() {
        assert!(is_game_process(
            "C:\\Program Files (x86)\\Steam\\steamapps\\common\\GodOfWar\\GoW.exe"
        ));
        for helper in [
            "C:\\Program Files (x86)\\Steam\\steam.exe",
            "C:\\Program Files (x86)\\Steam\\bin\\cef\\cef.win64\\steamwebhelper.exe",
            "C:\\windows\\system32\\explorer.exe",
            "C:\\windows\\system32\\winedevice.exe",
            "./exec\\crs-handler.exe",
            "C:\\WINDOWS\\SYSTEM32\\SERVICES.EXE",
        ] {
            assert!(!is_game_process(helper), "{helper}");
        }
        // Unix processes (wineserver, Orbit) are never picked.
        assert!(!is_game_process("/opt/wine/bin/wineserver"));
        assert_eq!(exe_name("C:\\a\\B.EXE").as_deref(), Some("b.exe"));
    }

    #[test]
    fn a_signed_in_steam_helper_is_not_a_second_login() {
        assert_eq!(
            webhelper_is_logged_in("steamwebhelper.exe -steamid=76561198000000000"),
            Some(true)
        );
        assert_eq!(
            webhelper_is_logged_in("steamwebhelper.exe -steamid=0 -buildid=1"),
            Some(false)
        );
        assert_eq!(webhelper_is_logged_in("steam.exe -silent"), None);
    }

    #[test]
    fn play_uses_the_prefix_that_is_already_signed_in() {
        let root =
            std::env::temp_dir().join(format!("orbit-signed-in-prefix-{}", uuid::Uuid::new_v4()));
        let prefix = root.join("steam-ready/prefix");
        std::fs::create_dir_all(prefix.join("drive_c/Program Files (x86)/Steam")).unwrap();
        std::fs::write(prefix.join("system.reg"), b"reg").unwrap();
        let cwd = prefix
            .join("drive_c/Program Files (x86)/Steam")
            .to_string_lossy()
            .into_owned();
        let processes = format!("35103 steamwebhelper.exe -steamid=76561198000000000\n");
        let found = logged_in_prefix_from(
            &processes,
            |_| Some(cwd.clone()),
            |path| path.join("system.reg").is_file(),
        );
        assert_eq!(found.as_deref(), Some(prefix.as_path()));
        let listing = format!(
            "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\nsteamwebh 35103 user cwd DIR 1,17 2848 1 {cwd}\n"
        );
        assert!(lsof_cwd_path(&listing).unwrap().ends_with("Steam"));
        let logged_out = "64659 steamwebhelper.exe -steamid=0\n";
        assert!(logged_in_prefix_from(logged_out, |_| Some(cwd.clone()), |_| true).is_none());
        let _ = std::fs::remove_dir_all(root);
    }
}
