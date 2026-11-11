use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use crate::models::{ThemeBranding, ThemeColors, ThemeDefinition};

/// Themes written from the in-app studio; keeps them apart from built-in ids.
pub const STUDIO_PREFIX: &str = "custom-";
const MAX_ID_LEN: usize = 48;
const MAX_NAME_LEN: usize = 60;
const MAX_DESCRIPTION_LEN: usize = 200;
const MAX_LOGO_TEXT_LEN: usize = 40;
const MAX_TAGLINE_LEN: usize = 80;
const MAX_IMAGE_BYTES: usize = 8 * 1024 * 1024;
const MAX_THEME_FILE_BYTES: u64 = 20 * 1024 * 1024;
const MAX_THEME_COUNT: usize = 128;
const MAX_CATALOG_BYTES: u64 = 64 * 1024 * 1024;
const RASTER_PREFIXES: [&str; 4] = [
    "data:image/png;base64,",
    "data:image/jpeg;base64,",
    "data:image/webp;base64,",
    "data:image/gif;base64,",
];
const LOGO_STYLES: [&str; 7] = [
    "clean", "serif", "gothic", "glitch", "heavy", "neon", "rounded",
];
const KINDS: [&str; 3] = ["color", "game", "custom"];

pub fn is_valid_theme_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= MAX_ID_LEN
        && !id.starts_with('-')
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

fn is_rgb_triplet(value: &str) -> bool {
    let parts: Vec<&str> = value.split_whitespace().collect();
    parts.len() == 3 && parts.iter().all(|part| part.parse::<u8>().is_ok())
}

fn colors_valid(colors: &ThemeColors) -> bool {
    [
        &colors.canvas,
        &colors.surface,
        &colors.panel,
        &colors.foreground,
        &colors.muted,
        &colors.accent,
        &colors.focus,
        &colors.border,
    ]
    .iter()
    .all(|value| is_rgb_triplet(value))
}

fn clip(value: Option<String>, max: usize) -> Option<String> {
    let value = value?.trim().to_string();
    if value.is_empty() {
        return None;
    }
    Some(value.chars().take(max).collect())
}

fn bundled_reference(value: &str, slot: &str) -> bool {
    let Some((id, kind)) = value
        .strip_prefix("orbit-bundled:")
        .and_then(|value| value.split_once(':'))
    else {
        return false;
    };
    kind == slot
        && !id.is_empty()
        && id.len() <= 48
        && id
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
}

/// Accept inline raster images and opaque bundled references. Neither grants filesystem access.
fn raster_image(value: Option<String>, slot: &str) -> Option<String> {
    value.filter(|v| {
        bundled_reference(v, slot)
            || (v.len() <= MAX_IMAGE_BYTES && RASTER_PREFIXES.iter().any(|p| v.starts_with(p)))
    })
}

fn sanitize_branding(branding: ThemeBranding) -> Option<ThemeBranding> {
    let clean = ThemeBranding {
        logo_text: clip(branding.logo_text, MAX_LOGO_TEXT_LEN),
        logo_style: branding
            .logo_style
            .filter(|style| LOGO_STYLES.contains(&style.as_str())),
        logo_image: raster_image(branding.logo_image, "logo"),
        wallpaper: raster_image(branding.wallpaper, "hero"),
        tagline: clip(branding.tagline, MAX_TAGLINE_LEN),
        artwork_query: clip(branding.artwork_query, MAX_NAME_LEN),
    };
    let empty = clean.logo_text.is_none()
        && clean.logo_image.is_none()
        && clean.wallpaper.is_none()
        && clean.tagline.is_none()
        && clean.artwork_query.is_none();
    (!empty).then_some(clean)
}

/// Theme JSON is user-editable and untrusted; drop anything the shell should not render.
pub fn sanitize_theme(theme: ThemeDefinition) -> Option<ThemeDefinition> {
    if !is_valid_theme_id(&theme.id) || !colors_valid(&theme.colors) {
        return None;
    }
    let name = clip(Some(theme.name), MAX_NAME_LEN)?;
    Some(ThemeDefinition {
        name,
        description: clip(theme.description, MAX_DESCRIPTION_LEN),
        author: clip(theme.author, MAX_NAME_LEN),
        kind: theme.kind.filter(|kind| KINDS.contains(&kind.as_str())),
        branding: theme.branding.and_then(sanitize_branding),
        ..theme
    })
}

pub fn list_themes(dir: &Path) -> Result<Vec<ThemeDefinition>, String> {
    fs::create_dir_all(dir).map_err(|err| err.to_string())?;
    let dir = dir.canonicalize().map_err(|err| err.to_string())?;
    let mut themes = Vec::new();
    let mut total_bytes = 0;
    // Bounded directory scan and byte budget; no image decoding or IPC in this pass.
    for entry in fs::read_dir(&dir)
        .map_err(|err| err.to_string())?
        .take(512)
        .flatten()
    {
        if themes.len() >= MAX_THEME_COUNT {
            break;
        }
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Ok(meta) = fs::symlink_metadata(&path) else {
            continue;
        };
        if !meta.is_file() || meta.len() > MAX_THEME_FILE_BYTES {
            continue;
        }
        if total_bytes + meta.len() > MAX_CATALOG_BYTES {
            break;
        }
        let Ok(path) = path.canonicalize() else {
            continue;
        };
        if !path.starts_with(&dir) {
            continue;
        }
        let Ok(file) = fs::File::open(&path) else {
            continue;
        };
        let mut content = String::new();
        if file
            .take(MAX_THEME_FILE_BYTES + 1)
            .read_to_string(&mut content)
            .is_err()
            || content.len() as u64 > MAX_THEME_FILE_BYTES
        {
            continue;
        }
        total_bytes += content.len() as u64;
        if let Some(theme) = serde_json::from_str::<ThemeDefinition>(&content)
            .ok()
            .and_then(sanitize_theme)
        {
            themes.push(theme);
        }
    }
    themes.sort_by_key(|theme| theme.name.to_lowercase());
    Ok(themes)
}

fn studio_path(dir: &Path, id: &str) -> Result<PathBuf, String> {
    if !id.starts_with(STUDIO_PREFIX) || !is_valid_theme_id(id) {
        return Err("Theme id must look like custom-my-theme".into());
    }
    Ok(dir.join(format!("{id}.json")))
}

pub fn save_theme(dir: &Path, theme: ThemeDefinition) -> Result<ThemeDefinition, String> {
    let path = studio_path(dir, &theme.id)?;
    let theme = sanitize_theme(theme).ok_or("Theme has an invalid name or colors")?;
    fs::create_dir_all(dir).map_err(|err| err.to_string())?;
    let json = serde_json::to_string_pretty(&theme).map_err(|err| err.to_string())?;
    fs::write(path, json).map_err(|err| err.to_string())?;
    Ok(theme)
}

pub fn delete_theme(dir: &Path, id: &str) -> Result<(), String> {
    let path = studio_path(dir, id)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &str = "data:image/png;base64,iVBORw0KGgo=";

    fn theme(id: &str) -> ThemeDefinition {
        let rgb = || "10 20 30".to_string();
        ThemeDefinition {
            id: id.into(),
            name: "Test".into(),
            description: None,
            author: None,
            kind: Some("custom".into()),
            fonts: None,
            colors: ThemeColors {
                canvas: rgb(),
                surface: rgb(),
                panel: rgb(),
                foreground: rgb(),
                muted: rgb(),
                accent: rgb(),
                focus: rgb(),
                border: rgb(),
            },
            radius: None,
            card_radius: None,
            blur: None,
            motion: None,
            branding: None,
        }
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("orbit-themes-{name}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn validates_theme_ids() {
        assert!(is_valid_theme_id("custom-devil-may-cry"));
        assert!(!is_valid_theme_id("../etc"));
        assert!(!is_valid_theme_id("Custom"));
        assert!(!is_valid_theme_id(""));
        assert!(!is_valid_theme_id("-leading"));
        assert!(!is_valid_theme_id(&"a".repeat(MAX_ID_LEN + 1)));
    }

    #[test]
    fn rejects_invalid_colors() {
        let mut bad = theme("custom-a");
        bad.colors.accent = "red".into();
        assert!(sanitize_theme(bad).is_none());
        let mut out_of_range = theme("custom-a");
        out_of_range.colors.canvas = "256 0 0".into();
        assert!(sanitize_theme(out_of_range).is_none());
    }

    #[test]
    fn strips_untrusted_branding_images_and_styles() {
        let mut input = theme("custom-a");
        input.branding = Some(ThemeBranding {
            logo_text: Some("  DANTE  ".into()),
            logo_style: Some("<script>".into()),
            logo_image: Some("https://example.com/logo.png".into()),
            wallpaper: Some("data:image/svg+xml;base64,PHN2Zz4=".into()),
            tagline: Some("x".repeat(200)),
            artwork_query: None,
        });
        let branding = sanitize_theme(input).unwrap().branding.unwrap();
        assert_eq!(branding.logo_text.as_deref(), Some("DANTE"));
        assert_eq!(branding.logo_style, None);
        assert_eq!(branding.logo_image, None);
        assert_eq!(branding.wallpaper, None);
        assert_eq!(branding.tagline.unwrap().len(), MAX_TAGLINE_LEN);
    }

    #[test]
    fn bundled_references_cannot_point_to_paths_or_the_wrong_slot() {
        let allowed = "orbit-bundled:god-of-war:logo";
        assert_eq!(
            raster_image(Some(allowed.into()), "logo").as_deref(),
            Some(allowed)
        );
        assert!(raster_image(Some(allowed.into()), "hero").is_none());
        assert!(raster_image(Some("orbit-bundled:../god-of-war:logo".into()), "logo").is_none());
    }

    #[test]
    fn keeps_inline_raster_images() {
        let mut input = theme("custom-a");
        input.branding = Some(ThemeBranding {
            logo_image: Some(PNG.into()),
            logo_style: Some("gothic".into()),
            ..Default::default()
        });
        let branding = sanitize_theme(input).unwrap().branding.unwrap();
        assert_eq!(branding.logo_image.as_deref(), Some(PNG));
        assert_eq!(branding.logo_style.as_deref(), Some("gothic"));
    }

    #[test]
    fn save_requires_studio_prefix_and_round_trips() {
        let dir = temp_dir("save");
        assert!(save_theme(&dir, theme("liquid-glass")).is_err());
        assert!(save_theme(&dir, theme("custom-../../x")).is_err());
        save_theme(&dir, theme("custom-mine")).unwrap();
        let listed = list_themes(&dir).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, "custom-mine");
        delete_theme(&dir, "custom-mine").unwrap();
        delete_theme(&dir, "custom-mine").unwrap();
        assert!(list_themes(&dir).unwrap().is_empty());
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn list_skips_invalid_files_and_accepts_legacy_layout_field() {
        let dir = temp_dir("list");
        fs::write(dir.join("broken.json"), "{not json").unwrap();
        fs::write(dir.join("notes.txt"), "ignored").unwrap();
        let legacy = r#"{"id":"neon","name":"Neon","layout":"ps5","colors":{"canvas":"0 0 0","surface":"0 0 0","panel":"0 0 0","foreground":"255 255 255","muted":"1 1 1","accent":"2 2 2","focus":"3 3 3","border":"4 4 4"}}"#;
        fs::write(dir.join("neon.json"), legacy).unwrap();
        let listed = list_themes(&dir).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, "neon");
        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn catalog_is_bounded_even_when_the_theme_folder_contains_many_files() {
        let dir = temp_dir("bounded");
        for index in 0..MAX_THEME_COUNT + 5 {
            save_theme(&dir, theme(&format!("custom-{index}"))).unwrap();
        }
        assert_eq!(list_themes(&dir).unwrap().len(), MAX_THEME_COUNT);
        fs::remove_dir_all(dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn listing_does_not_follow_theme_symlinks_outside_the_folder() {
        let root = temp_dir("symlink");
        let dir = root.join("themes");
        fs::create_dir_all(&dir).unwrap();
        save_theme(&root, theme("custom-outside")).unwrap();
        std::os::unix::fs::symlink(root.join("custom-outside.json"), dir.join("link.json"))
            .unwrap();
        assert!(list_themes(&dir).unwrap().is_empty());
        fs::remove_dir_all(root).unwrap();
    }
}
