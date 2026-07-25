use crate::models::LaunchConfiguration;

/// Extract a Steam app ID from a launch configuration when available.
pub fn steam_app_id_from_launch(config: &LaunchConfiguration) -> Option<String> {
    match config {
        LaunchConfiguration::Steam { app_id } => Some(app_id.clone()),
        LaunchConfiguration::OpenUrl { url } => steam_app_id_from_url(url),
        LaunchConfiguration::Gamehub { .. } => None,
        _ => None,
    }
}

/// Parse Steam app IDs from common URL / deep-link forms.
pub fn steam_app_id_from_url(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Some(id) = extract_after(trimmed, "gamehub://launch/steam/") {
        return sanitize_app_id(id);
    }
    if let Some(id) = extract_after(trimmed, "steam://rungameid/") {
        return sanitize_app_id(id);
    }
    if let Some(id) = extract_after(trimmed, "steam://run/") {
        return sanitize_app_id(id);
    }
    if let Some(id) = extract_after(trimmed, "store.steampowered.com/app/") {
        return sanitize_app_id(id.split('/').next().unwrap_or(id));
    }

    None
}

fn extract_after<'a>(value: &'a str, prefix: &str) -> Option<&'a str> {
    let lower = value.to_ascii_lowercase();
    let prefix_lower = prefix.to_ascii_lowercase();
    let idx = lower.find(&prefix_lower)?;
    Some(&value[idx + prefix.len()..])
}

fn sanitize_app_id(raw: &str) -> Option<String> {
    let id: String = raw
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect();
    if id.is_empty() {
        None
    } else {
        Some(id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::LaunchConfiguration;

    #[test]
    fn parses_steam_launch_config() {
        let config = LaunchConfiguration::Steam {
            app_id: "1091500".into(),
        };
        assert_eq!(
            steam_app_id_from_launch(&config).as_deref(),
            Some("1091500")
        );
    }

    #[test]
    fn parses_gamehub_deep_link() {
        assert_eq!(
            steam_app_id_from_url("gamehub://launch/steam/3764200").as_deref(),
            Some("3764200")
        );
    }

    #[test]
    fn parses_steam_run_urls() {
        assert_eq!(
            steam_app_id_from_url("steam://rungameid/2050650").as_deref(),
            Some("2050650")
        );
        assert_eq!(
            steam_app_id_from_url("steam://run/1091500").as_deref(),
            Some("1091500")
        );
    }

    #[test]
    fn rejects_invalid_input() {
        assert_eq!(steam_app_id_from_url(""), None);
        assert_eq!(steam_app_id_from_url("gamehub://launch/epic/foo"), None);
        assert_eq!(steam_app_id_from_url("not-a-url"), None);
    }
}
