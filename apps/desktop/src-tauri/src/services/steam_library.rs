use serde_json::Value;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_valid_steam_ids_can_be_used_for_installation() {
        assert_eq!(steam_install_url("620").unwrap(), "steam://install/620");
        for invalid in [
            "0",
            "0620",
            "../620",
            "620?arg=1",
            "4294967296",
            "-1",
            " 620",
        ] {
            assert!(steam_install_url(invalid).is_err());
        }
    }

    #[test]
    fn install_requires_a_mac_game_in_the_matching_store_entry() {
        let response = serde_json::json!({"620":{"success":true,"data":{"type":"game","platforms":{"mac":true}}}});
        assert!(advertises_mac_build(&response, "620"));
        assert!(!advertises_mac_build(&response, "621"));
        for data in [
            serde_json::json!({"type":"game","platforms":{"mac":false}}),
            serde_json::json!({"type":"dlc","platforms":{"mac":true}}),
        ] {
            let response = serde_json::json!({"620":{"success":true,"data":data}});
            assert!(!advertises_mac_build(&response, "620"));
        }
    }
}

fn steam_install_url(app_id: &str) -> Result<String, String> {
    let id = app_id.parse::<u32>().map_err(|_| "Invalid Steam App ID")?;
    if id == 0 || id.to_string() != app_id {
        return Err("Invalid Steam App ID".into());
    }
    Ok(format!("steam://install/{id}"))
}

fn advertises_mac_build(response: &Value, app_id: &str) -> bool {
    let entry = &response[app_id];
    entry["success"].as_bool() == Some(true)
        && entry["data"]["type"].as_str() == Some("game")
        && entry["data"]["platforms"]["mac"].as_bool() == Some(true)
}

pub async fn install(app_id: &str) -> Result<(), String> {
    let url = steam_install_url(app_id)?;
    let response: Value = crate::services::http::orbit_client()?
        .get("https://store.steampowered.com/api/appdetails")
        .query(&[("appids", app_id)])
        .send()
        .await
        .map_err(|_| "Could not check Steam Store availability")?
        .error_for_status()
        .map_err(|_| "Could not check Steam Store availability")?
        .json()
        .await
        .map_err(|_| "Steam Store returned an invalid response")?;
    if !advertises_mac_build(&response, app_id) {
        return Err(
            "Steam does not list a Mac build for this game. Check GameHub for compatibility."
                .into(),
        );
    }
    open(&url)
}

pub fn open_library() -> Result<(), String> {
    open("steam://nav/games")
}

fn open(url: &str) -> Result<(), String> {
    if !cfg!(target_os = "macos") {
        return Err("Steam handoff is available on macOS".into());
    }
    std::process::Command::new("open")
        .args(["-b", "com.valvesoftware.steam", url])
        .status()
        .map_err(|_| "Could not open Steam".to_string())
        .and_then(|status| {
            if status.success() {
                Ok(())
            } else {
                Err("Could not open Steam. Make sure Steam is installed.".into())
            }
        })
}
