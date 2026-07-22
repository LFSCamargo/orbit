use regex::Regex;
use std::path::Path;

/// Minimum ROM size when content type is ambiguous (filters language packs, tiny DLC).
pub const SWITCH_BASE_MIN_BYTES: i64 = 100 * 1024 * 1024;

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

    let stem = strip_trailing_size_suffix(stem);
    let bracket_re = Regex::new(r"\[([^\]]+)\]").unwrap();
    let mut title_id = None;
    let mut version = None;

    for capture in bracket_re.captures_iter(&stem) {
        let inner = capture.get(1).map(|m| m.as_str()).unwrap_or("");
        if title_id.is_none() && is_title_id(inner) {
            title_id = Some(inner.to_ascii_uppercase());
        } else if version.is_none() && looks_like_version(inner) {
            version = Some(inner.to_string());
        }
    }

    let mut cleaned = bracket_re.replace_all(&stem, "").to_string();
    cleaned = cleaned.replace('_', " ").replace("  ", " ").trim().to_string();
    cleaned = strip_trailing_size_suffix(&cleaned);

    let content_type = classify_switch_content_from_name(&stem, version.as_deref());

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

/// True when this ROM should be imported as the playable base application.
pub fn is_switch_base_application(
    parsed: &ParsedSwitchFilename,
    original_stem: &str,
    size_bytes: Option<i64>,
) -> bool {
    if has_switch_dlc_keywords(original_stem) {
        return false;
    }

    if matches!(parsed.content_type.as_str(), "update" | "dlc") {
        return false;
    }

    if is_switch_update_version(parsed.version.as_deref()) {
        return false;
    }

    let Some(title_id) = parsed.title_id.as_deref() else {
        return false;
    };

    if is_switch_patch_title_id(title_id) {
        return false;
    }

    if !is_switch_application_title_id(title_id) {
        return false;
    }

    match parsed.content_type.as_str() {
        "base" | "unknown" => size_bytes.unwrap_or(0) >= SWITCH_BASE_MIN_BYTES,
        _ => false,
    }
}

pub fn is_switch_application_title_id(title_id: &str) -> bool {
    title_id.len() == 16
        && title_id.chars().all(|c| c.is_ascii_hexdigit())
        && title_id.ends_with("000")
}

pub fn is_switch_patch_title_id(title_id: &str) -> bool {
    title_id.len() == 16
        && title_id.chars().all(|c| c.is_ascii_hexdigit())
        && title_id.ends_with("800")
}

pub fn has_switch_dlc_keywords(stem: &str) -> bool {
    let lower = stem.to_ascii_lowercase();
    [
        "dlc",
        "language pack",
        "bonus content",
        "expansion pack",
        "season pass",
        "content pack",
        "add-on",
        "addon",
        "extra content",
    ]
    .iter()
    .any(|keyword| lower.contains(keyword))
}

/// Map a patch/update title ID (`…800`) to its application ID (`…000`).
pub fn switch_application_id_from_title_id(title_id: &str) -> Option<String> {
    if title_id.len() != 16 || !title_id.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    Some(format!("{}000", &title_id[..13]))
}

pub fn normalize_switch_group_title(title: &str) -> String {
    let lower = title.to_ascii_lowercase();
    for separator in [
        " dlc",
        " language pack",
        " bonus content",
        " expansion pack",
        " season pass",
        " content pack",
    ] {
        if let Some(index) = lower.find(separator) {
            return title[..index].trim().to_string();
        }
    }
    title.trim().to_string()
}

fn classify_switch_content_from_name(stem: &str, version: Option<&str>) -> String {
    if has_switch_dlc_keywords(stem) {
        return "dlc".into();
    }

    let lower = stem.to_ascii_lowercase();
    if lower.contains("[update]") || lower.contains("(update)") || lower.contains(" update ") {
        return "update".into();
    }

    if is_switch_update_version(version) {
        return "update".into();
    }

    if let Some(title_id) = extract_title_id(stem) {
        if is_switch_patch_title_id(&title_id) {
            return "update".into();
        }
    }

    if lower.contains("[base]")
        || version.is_some_and(|v| v.eq_ignore_ascii_case("v0"))
        || version.is_none()
    {
        return "base".into();
    }

    "unknown".into()
}

fn extract_title_id(stem: &str) -> Option<String> {
    let bracket_re = Regex::new(r"\[([^\]]+)\]").unwrap();
    for capture in bracket_re.captures_iter(stem) {
        let inner = capture.get(1).map(|m| m.as_str()).unwrap_or("");
        if is_title_id(inner) {
            return Some(inner.to_ascii_uppercase());
        }
    }
    None
}

fn is_switch_update_version(version: Option<&str>) -> bool {
    let Some(version) = version else {
        return false;
    };
    let v = version.trim_start_matches(['v', 'V']);
    v.parse::<u32>().ok().is_some_and(|num| num > 0)
}

fn strip_trailing_size_suffix(stem: &str) -> String {
    let re = Regex::new(
        r"(?i)\s*[\[(]\s*[\d.]+\s*(?:GB|MB|KB|GiB|MiB|KiB|bytes?)\s*[\])]\s*$",
    )
    .unwrap();
    re.replace(stem, "").trim().to_string()
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

pub fn switch_rom_stem(path: &Path) -> Option<String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .and_then(|name| name.rsplit_once('.').map(|(stem, _)| stem.to_string()))
}

/// Pull a human-readable DLC label from bracket segments in a Switch ROM filename.
pub fn extract_switch_dlc_name(stem: &str) -> Option<String> {
    let bracket_re = Regex::new(r"\[([^\]]+)\]").unwrap();
    let mut descriptive = Vec::new();

    for capture in bracket_re.captures_iter(stem) {
        let inner = capture.get(1).map(|m| m.as_str().trim()).unwrap_or("");
        if inner.is_empty() || is_title_id(inner) || looks_like_version(inner) {
            continue;
        }
        descriptive.push(inner.to_string());
    }

    for raw in &descriptive {
        if has_switch_dlc_keywords(raw) {
            return Some(format_switch_dlc_label(raw));
        }
    }

    if has_switch_dlc_keywords(stem) {
        return descriptive
            .first()
            .map(|raw| format_switch_dlc_label(raw));
    }

    None
}

fn format_switch_dlc_label(raw: &str) -> String {
    let mut label = raw.trim().to_string();
    let lower = label.to_ascii_lowercase();
    if let Some(_rest) = lower.strip_prefix("dlc ") {
        label = label[4..].trim().to_string();
    } else if lower.starts_with("dlc-") {
        label = label[4..].trim().to_string();
    } else if lower.ends_with(" dlc") {
        label = label[..label.len().saturating_sub(4)].trim().to_string();
    }
    label
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
        assert_eq!(parsed.content_type, "base");
        assert!(is_switch_base_application(
            &parsed,
            "Hogwarts Legacy [0100F7E00C70E000][v0]",
            Some(7_000_000_000),
        ));
    }

    #[test]
    fn ignores_non_hex_brackets_as_title_id() {
        let parsed = parse_switch_filename("Cool Game [GOTY][0100F7E00C70E000].xci");
        assert_eq!(parsed.title_id.as_deref(), Some("0100F7E00C70E000"));
        assert!(parsed.title.contains("Cool Game"));
        assert!(!parsed.title.contains("0100"));
    }

    #[test]
    fn classifies_updates_by_version_and_title_id() {
        let parsed = parse_switch_filename("Game [0100F7E00C70E000][v65536].nsp");
        assert_eq!(parsed.content_type, "update");
        assert!(!is_switch_base_application(&parsed, "Game [0100F7E00C70E000][v65536]", None));

        let patch = parse_switch_filename("Game [0100F7E00C70E800][v327680].nsp");
        assert_eq!(patch.content_type, "update");
        assert!(!is_switch_base_application(
            &patch,
            "Game [0100F7E00C70E800][v327680]",
            None,
        ));
    }

    #[test]
    fn classifies_dlc_and_language_packs() {
        let dlc = parse_switch_filename(
            "Hogwarts Legacy [DLC Astronomers Hat] [0100F7E00C70F002][v65536].nsp",
        );
        assert_eq!(dlc.content_type, "dlc");
        assert!(!is_switch_base_application(
            &dlc,
            "Hogwarts Legacy [DLC Astronomers Hat] [0100F7E00C70F002][v65536]",
            Some(121_034),
        ));

        let language = parse_switch_filename(
            "Hogwarts Legacy [Italian Language Pack DLC][0100F7E00C70E000][v0].nsp",
        );
        assert_eq!(language.content_type, "dlc");
        assert!(!is_switch_base_application(
            &language,
            "Hogwarts Legacy [Italian Language Pack DLC][0100F7E00C70E000][v0]",
            Some(121_034),
        ));
    }

    #[test]
    fn parses_size_suffix_filenames() {
        let parsed = parse_switch_filename(
            "Resident Evil 5 [010018100CD46000][v0] (18.63 GB).nsp",
        );
        assert_eq!(parsed.title, "Resident Evil 5");
        assert_eq!(parsed.title_id.as_deref(), Some("010018100CD46000"));
        assert!(is_switch_base_application(
            &parsed,
            "Resident Evil 5 [010018100CD46000][v0] (18.63 GB)",
            Some(18_000_000_000),
        ));
    }

    #[test]
    fn skips_small_unknown_even_with_application_id() {
        let parsed = parse_switch_filename("Mystery [0100F7E00C70E000][v0].nsp");
        assert!(!is_switch_base_application(
            &parsed,
            "Mystery [0100F7E00C70E000][v0]",
            Some(1_000_000),
        ));
    }

    #[test]
    fn extracts_dlc_names_from_brackets() {
        assert_eq!(
            extract_switch_dlc_name(
                "Hogwarts Legacy [DLC Astronomers Hat] [0100F7E00C70F002][v65536]",
            )
            .as_deref(),
            Some("Astronomers Hat")
        );
        assert_eq!(
            extract_switch_dlc_name("Hogwarts Legacy [Italian Language Pack DLC][0100F7E00C70E000][v0]")
                .as_deref(),
            Some("Italian Language Pack")
        );
    }
}
