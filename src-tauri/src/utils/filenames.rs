use regex::Regex;

#[derive(Debug, Clone)]
pub struct ParsedSwitchFilename {
    pub title: String,
    pub sort_title: String,
    pub title_id: Option<String>,
    pub version: Option<String>,
    pub extension: String,
    pub content_type: String,
}

/// Parse Switch dump filenames like:
/// `Hogwarts Legacy [0100F7E00C70E000][v0].nsp`
/// Only treat a bracket as Title ID when it contains exactly 16 hex characters.
pub fn parse_switch_filename(file_name: &str) -> ParsedSwitchFilename {
    let (stem, extension) = match file_name.rsplit_once('.') {
        Some((stem, ext)) => (stem, ext.to_ascii_lowercase()),
        None => (file_name, String::new()),
    };

    let bracket_re = Regex::new(r"\[([^\]]+)\]").unwrap();
    let mut title_id = None;
    let mut version = None;
    let mut cleaned = stem.to_string();

    for capture in bracket_re.captures_iter(stem) {
        let inner = capture.get(1).map(|m| m.as_str()).unwrap_or("");
        if title_id.is_none() && is_title_id(inner) {
            title_id = Some(inner.to_ascii_uppercase());
        } else if version.is_none() && looks_like_version(inner) {
            version = Some(inner.to_string());
        }
    }

    cleaned = bracket_re.replace_all(&cleaned, "").to_string();
    cleaned = cleaned.replace('_', " ").replace("  ", " ").trim().to_string();

    let content_type = classify_switch_content_from_name(stem, version.as_deref());

    ParsedSwitchFilename {
        sort_title: cleaned.to_lowercase(),
        title: cleaned,
        title_id,
        version,
        extension,
        content_type,
    }
}

pub fn classify_switch_content(parsed: &ParsedSwitchFilename) -> String {
    parsed.content_type.clone()
}

fn classify_switch_content_from_name(stem: &str, version: Option<&str>) -> String {
    let lower = stem.to_ascii_lowercase();
    if lower.contains("[dlc]") || lower.contains(" dlc ") || lower.contains("(dlc)") {
        return "dlc".into();
    }
    if lower.contains("[update]") || lower.contains("(update)") {
        return "update".into();
    }
    if let Some(version) = version {
        let v = version.trim_start_matches(['v', 'V']);
        if let Ok(num) = v.parse::<u32>() {
            if num > 0 {
                return "update".into();
            }
        }
    }
    if lower.contains("[base]") || version.unwrap_or("v0").eq_ignore_ascii_case("v0") {
        return "base".into();
    }
    "unknown".into()
}

fn is_title_id(value: &str) -> bool {
    value.len() == 16 && value.chars().all(|c| c.is_ascii_hexdigit())
}

fn looks_like_version(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return false;
    }
    let rest = trimmed.trim_start_matches(['v', 'V']);
    !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_hogwarts_style_name() {
        let parsed = parse_switch_filename("Hogwarts Legacy [0100F7E00C70E000][v0].nsp");
        assert_eq!(parsed.title, "Hogwarts Legacy");
        assert_eq!(parsed.title_id.as_deref(), Some("0100F7E00C70E000"));
        assert_eq!(parsed.version.as_deref(), Some("v0"));
        assert_eq!(parsed.extension, "nsp");
        assert_eq!(parsed.content_type, "base");
    }

    #[test]
    fn ignores_non_hex_brackets_as_title_id() {
        let parsed = parse_switch_filename("Cool Game [GOTY][0100F7E00C70E000].xci");
        assert_eq!(parsed.title_id.as_deref(), Some("0100F7E00C70E000"));
        assert!(parsed.title.contains("Cool Game"));
        assert!(!parsed.title.contains("0100"));
    }

    #[test]
    fn classifies_updates() {
        let parsed = parse_switch_filename("Game [0100F7E00C70E000][v65536].nsp");
        assert_eq!(parsed.content_type, "update");
    }
}
