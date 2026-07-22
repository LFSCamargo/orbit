use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

pub const GAMEHUB_SHORTCUT_BUNDLE_PREFIX: &str = "com.gamehub.shortcut.";
pub const GAMEHUB_MAIN_BUNDLE_ID: &str = "com.gamemac.www";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GameHubShortcutInfo {
    pub bundle_id: String,
    pub display_name: String,
    pub deep_link: Option<String>,
    pub shortcut_path: PathBuf,
}

pub fn is_gamehub_main_app(path: &Path) -> bool {
    path.file_stem()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.eq_ignore_ascii_case("GameHub"))
        || read_bundle_identifier(path).is_some_and(|id| id == GAMEHUB_MAIN_BUNDLE_ID)
}

pub fn is_gamehub_shortcut(path: &Path) -> bool {
    inspect_gamehub_shortcut(path).is_some()
}

pub fn inspect_gamehub_shortcut(path: &Path) -> Option<GameHubShortcutInfo> {
    if path.extension().and_then(|ext| ext.to_str()) != Some("app") || !path.is_dir() {
        return None;
    }
    if is_gamehub_main_app(path) {
        return None;
    }

    let bundle_id = read_bundle_identifier(path)?;
    let display_name = read_plist_value(path, "CFBundleDisplayName")
        .or_else(|| read_plist_value(path, "CFBundleName"))
        .or_else(|| {
            path.file_stem()
                .and_then(|name| name.to_str())
                .map(str::to_string)
        })?;

    if bundle_id.starts_with(GAMEHUB_SHORTCUT_BUNDLE_PREFIX) {
        return Some(GameHubShortcutInfo {
            deep_link: read_launcher_deep_link(path),
            bundle_id,
            display_name,
            shortcut_path: path.to_path_buf(),
        });
    }

    let executable = read_plist_value(path, "CFBundleExecutable")?;
    if executable != "launcher" {
        return None;
    }

    let deep_link = read_launcher_deep_link(path)?;
    if !deep_link.starts_with("gamehub://") {
        return None;
    }

    Some(GameHubShortcutInfo {
        deep_link: Some(deep_link),
        bundle_id,
        display_name,
        shortcut_path: path.to_path_buf(),
    })
}

fn read_launcher_deep_link(path: &Path) -> Option<String> {
    let launcher = launcher_script_path(path);
    let content = fs::read_to_string(launcher).ok()?;
    if !content.contains("GameHub Game Launcher") && !content.contains("gamehub://") {
        return None;
    }
    parse_deep_link(&content)
}

fn launcher_script_path(path: &Path) -> PathBuf {
    let executable = read_plist_value(path, "CFBundleExecutable").unwrap_or_else(|| "launcher".into());
    path.join("Contents/MacOS").join(executable)
}

fn parse_deep_link(content: &str) -> Option<String> {
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(value) = trimmed.strip_prefix("DEEP_LINK=") {
            let link = value.trim().trim_matches('"');
            if link.starts_with("gamehub://") {
                return Some(link.to_string());
            }
        }
        if trimmed.contains("gamehub://") {
            if let Some(start) = trimmed.find("gamehub://") {
                let rest = &trimmed[start..];
                let end = rest.find('"').unwrap_or(rest.len());
                let end = rest.find('\'').map_or(end, |idx| idx.min(end));
                let link = rest[..end].trim_end_matches('"').trim_end_matches('\'');
                if !link.is_empty() {
                    return Some(link.to_string());
                }
            }
        }
    }
    None
}

fn read_bundle_identifier(path: &Path) -> Option<String> {
    read_plist_value(path, "CFBundleIdentifier")
}

fn read_plist_value(app_path: &Path, key: &str) -> Option<String> {
    let plist = app_path.join("Contents/Info.plist");
    if !plist.exists() {
        return None;
    }
    let output = Command::new("/usr/libexec/PlistBuddy")
        .args(["-c", &format!("Print :{key}"), plist.to_str()?])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if value.is_empty() || value.starts_with("Print:") {
        None
    } else {
        Some(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_shortcut(
        dir: &Path,
        bundle_id: &str,
        deep_link: &str,
    ) -> PathBuf {
        let app = dir.join("Resident Evil Requiem.app");
        let macos = app.join("Contents/MacOS");
        fs::create_dir_all(&macos).unwrap();
        fs::write(
            app.join("Contents/Info.plist"),
            format!(
                r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleDisplayName</key><string>Resident Evil Requiem</string>
  <key>CFBundleExecutable</key><string>launcher</string>
  <key>CFBundleIdentifier</key><string>{bundle_id}</string>
  <key>CFBundleName</key><string>Resident Evil Requiem</string>
  <key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>"#
            ),
        )
        .unwrap();
        fs::File::create(macos.join("launcher"))
            .unwrap()
            .write_all(
                format!(
                    "#!/bin/bash\n# GameHub Game Launcher\nDEEP_LINK=\"{deep_link}\"\n"
                )
                .as_bytes(),
            )
            .unwrap();
        app
    }

    #[test]
    fn detects_shortcut_by_bundle_id_prefix() {
        let dir = std::env::temp_dir().join(format!("orbit-gh-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let app = write_shortcut(
            &dir,
            "com.gamehub.shortcut.resident_evil_requiem",
            "gamehub://launch/steam/3764200",
        );
        let info = inspect_gamehub_shortcut(&app).expect("shortcut");
        assert_eq!(info.display_name, "Resident Evil Requiem");
        assert_eq!(
            info.deep_link.as_deref(),
            Some("gamehub://launch/steam/3764200")
        );
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn rejects_steam_wrapper_shortcut() {
        let dir = std::env::temp_dir().join(format!("orbit-gh-steam-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let app = dir.join("Cyberpunk 2077.app");
        let macos = app.join("Contents/MacOS");
        fs::create_dir_all(&macos).unwrap();
        fs::write(
            app.join("Contents/Info.plist"),
            r#"<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>CFBundleExecutable</key><string>run.sh</string>
  <key>CFBundleName</key><string>Cyberpunk 2077</string>
</dict></plist>"#,
        )
        .unwrap();
        fs::write(macos.join("run.sh"), b"open steam://run/1091500").unwrap();
        assert!(!is_gamehub_shortcut(&app));
        let _ = fs::remove_dir_all(dir);
    }
}
