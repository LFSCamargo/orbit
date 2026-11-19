//! Steam client options a game container plays with: no in-game overlay
//! unless asked (it hooks the game's rendering), no background shader work,
//! and the Settings → Steam choice for Steam Input. Written into the
//! container's own `localconfig.vdf` before its Steam starts, because Steam
//! rewrites that file when it exits. The Mac Steam client is never touched.
use std::path::{Path, PathBuf};

use crate::utils::steam_vdf::{self, Value};

const LOCALCONFIG_LIMIT: u64 = 256 * 1024;
/// SteamID64 of account 0 in the public universe.
const STEAM_ID64_BASE: u64 = 76_561_197_960_265_728;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PlayConfig {
    pub steam_input: bool,
    pub overlay: bool,
}

/// Apply `config` for `app_id` to the Steam folder of a container. A missing
/// or unreadable `localconfig.vdf` is replaced only when it does not exist.
pub fn apply(
    steam_root: &Path,
    steam_id: &str,
    app_id: &str,
    config: PlayConfig,
) -> Result<(), String> {
    if !crate::services::steam_download::valid_app_id(app_id) {
        return Err("This game's Steam id must be a number".into());
    }
    let path = localconfig_path(steam_root, steam_id)?;
    let mut fields = match read_capped(&path)? {
        Some(text) => match steam_vdf::parse(&text) {
            Ok(fields) => fields,
            // Steam's own file in a shape Orbit cannot round-trip: leave it.
            Err(_) => return Ok(()),
        },
        None => Vec::new(),
    };
    let flag = |on: bool| if on { "1" } else { "0" };
    let store = object(&mut fields, "UserLocalConfigStore");
    let system = object(store, "system");
    set(system, "EnableGameOverlay", flag(config.overlay));
    set(system, "EnableShaderBackgroundProcessing", "0");
    let apps = object(store, "apps");
    let app = object(apps, app_id);
    // 2 turns Steam Input on for the title, 0 off (as the Steam client writes).
    set(
        app,
        "UseSteamControllerConfig",
        if config.steam_input { "2" } else { "0" },
    );
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    std::fs::write(&path, steam_vdf::write(&fields)).map_err(|err| err.to_string())
}

fn localconfig_path(steam_root: &Path, steam_id: &str) -> Result<PathBuf, String> {
    let account = steam_id
        .parse::<u64>()
        .ok()
        .and_then(|id| id.checked_sub(STEAM_ID64_BASE))
        .filter(|account| *account > 0 && *account <= u64::from(u32::MAX))
        .ok_or("Steam id is missing")?;
    Ok(steam_root.join(format!("userdata/{account}/config/localconfig.vdf")))
}

fn read_capped(path: &Path) -> Result<Option<String>, String> {
    let Ok(meta) = path.symlink_metadata() else {
        return Ok(None);
    };
    if meta.file_type().is_symlink() || !meta.is_file() {
        return Err("Steam's local settings cannot be a link".into());
    }
    if meta.len() > LOCALCONFIG_LIMIT {
        return Err("Steam's local settings are too large to update".into());
    }
    std::fs::read_to_string(path)
        .map(Some)
        .map_err(|err| err.to_string())
}

/// The object stored at `key`, created when missing or when `key` held text.
fn object<'a>(fields: &'a mut Vec<(String, Value)>, key: &str) -> &'a mut Vec<(String, Value)> {
    let index = match fields.iter().position(|(name, value)| {
        name.eq_ignore_ascii_case(key) && matches!(value, Value::Object(_))
    }) {
        Some(index) => index,
        None => {
            fields.push((key.to_string(), Value::Object(Vec::new())));
            fields.len() - 1
        }
    };
    match &mut fields[index].1 {
        Value::Object(children) => children,
        Value::Text(_) => unreachable!("selected entries are objects"),
    }
}

fn set(fields: &mut Vec<(String, Value)>, key: &str, value: &str) {
    match fields
        .iter_mut()
        .find(|(name, _)| name.eq_ignore_ascii_case(key))
    {
        Some(entry) => entry.1 = Value::Text(value.to_string()),
        None => fields.push((key.to_string(), Value::Text(value.to_string()))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    const STEAM_ID: &str = "76561198000000000";

    fn config_path(root: &Path) -> PathBuf {
        root.join("userdata/39734272/config/localconfig.vdf")
    }

    #[test]
    fn turns_the_overlay_off_and_keeps_steams_other_settings() {
        let root = std::env::temp_dir().join(format!("orbit-play-config-{}", uuid::Uuid::new_v4()));
        let path = config_path(&root);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(
            &path,
            "\"UserLocalConfigStore\"\n{\n\t\"system\"\n\t{\n\t\t\"PushToTalkKey\"\t\t\"0\"\n\t\t\"EnableGameOverlay\"\t\t\"1\"\n\t}\n\t\"friends\"\n\t{\n\t\t\"note\"\t\t\"say \\\"hi\\\"\"\n\t}\n}\n",
        )
        .unwrap();
        apply(
            &root,
            STEAM_ID,
            "883710",
            PlayConfig {
                steam_input: false,
                overlay: false,
            },
        )
        .unwrap();
        let fields = steam_vdf::parse(&fs::read_to_string(&path).unwrap()).unwrap();
        let mut fields = fields;
        let store = object(&mut fields, "UserLocalConfigStore");
        let system = object(store, "system");
        let get = |fields: &Vec<(String, Value)>, key: &str| {
            fields
                .iter()
                .find(|(name, _)| name == key)
                .map(|(_, value)| value.clone())
        };
        assert_eq!(
            get(system, "EnableGameOverlay"),
            Some(Value::Text("0".into()))
        );
        assert_eq!(
            get(system, "EnableShaderBackgroundProcessing"),
            Some(Value::Text("0".into()))
        );
        assert_eq!(get(system, "PushToTalkKey"), Some(Value::Text("0".into())));
        let friends = object(store, "friends");
        assert_eq!(get(friends, "note"), Some(Value::Text("say \"hi\"".into())));
        let app = object(object(store, "apps"), "883710");
        assert_eq!(
            get(app, "UseSteamControllerConfig"),
            Some(Value::Text("0".into()))
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn steam_input_and_overlay_follow_the_settings_on_a_fresh_container() {
        let root =
            std::env::temp_dir().join(format!("orbit-play-config-new-{}", uuid::Uuid::new_v4()));
        apply(
            &root,
            STEAM_ID,
            "1593500",
            PlayConfig {
                steam_input: true,
                overlay: true,
            },
        )
        .unwrap();
        let text = fs::read_to_string(config_path(&root)).unwrap();
        let mut fields = steam_vdf::parse(&text).unwrap();
        let store = object(&mut fields, "UserLocalConfigStore");
        assert!(object(store, "system")
            .iter()
            .any(|(key, value)| key == "EnableGameOverlay" && *value == Value::Text("1".into())));
        assert!(object(object(store, "apps"), "1593500")
            .iter()
            .any(|(key, value)| key == "UseSteamControllerConfig"
                && *value == Value::Text("2".into())));
        assert!(apply(
            &root,
            "not-an-id",
            "1593500",
            PlayConfig {
                steam_input: true,
                overlay: true
            }
        )
        .is_err());
        assert!(apply(
            &root,
            STEAM_ID,
            "../x",
            PlayConfig {
                steam_input: true,
                overlay: true
            }
        )
        .is_err());
        let _ = fs::remove_dir_all(root);
    }
}
