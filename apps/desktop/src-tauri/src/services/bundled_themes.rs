use std::path::{Path, PathBuf};

use tauri::Manager;

/// Sub-directory inside the Tauri resource bundle that holds built-in theme artwork.
const BUNDLE_DIR: &str = "assets/bundled-themes";

/// Resolve a bundled artwork file for a built-in game theme.
/// Returns the absolute path when the file exists in the app resources.
pub fn resolve_bundle_path<R: Runtime>(
    app: &tauri::AppHandle<R>,
    theme_id: &str,
    slot: &str,
) -> Result<Option<PathBuf>, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|err| format!("Could not locate app resources: {err}"))?;
    Ok(find_artwork(&resource_dir.join(BUNDLE_DIR), theme_id, slot))
}

fn find_artwork(root: &Path, theme_id: &str, slot: &str) -> Option<PathBuf> {
    if !matches!(slot, "logo" | "hero") || sanitize_segment(theme_id) != theme_id {
        return None;
    }
    ["webp", "png", "jpg", "svg"].iter().find_map(|extension| {
        let candidate = root.join(theme_id).join(format!("{slot}.{extension}"));
        candidate.is_file().then_some(candidate)
    })
}

/// Best available bundled artwork reference for a slot.
/// Tries the requested slot first, then falls back to the other slot for game themes.
pub fn bundled_theme_artwork<R: Runtime>(
    app: &tauri::AppHandle<R>,
    theme_id: &str,
    slot: &str,
) -> Result<Option<String>, String> {
    let slots: Vec<&str> = match slot {
        "logo" => vec!["logo", "hero"],
        "hero" => vec!["hero", "logo"],
        _ => vec![slot],
    };
    for s in slots {
        if let Some(path) = resolve_bundle_path(app, theme_id, s)? {
            return Ok(Some(path_to_string(&path)));
        }
    }
    Ok(None)
}

fn sanitize_segment(value: &str) -> String {
    value
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

use tauri::Runtime;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_game_artwork_is_raster_and_slots_cannot_traverse() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join(BUNDLE_DIR);
        for theme in [
            "devil-may-cry-5",
            "god-of-war",
            "cyberpunk-2077",
            "zelda-ocarina-of-time",
            "gta-v",
            "gta-vi",
            "zelda-breath-of-the-wild",
            "super-mario",
        ] {
            for slot in ["logo", "hero"] {
                let path = find_artwork(&root, theme, slot).expect("bundled artwork");
                assert_ne!(path.extension().unwrap(), "svg");
            }
        }
        assert!(find_artwork(&root, "../god-of-war", "logo").is_none());
        assert!(find_artwork(&root, "god-of-war", "../logo").is_none());
    }

    #[test]
    fn display_assets_have_bounded_decode_sizes_and_preserve_logo_transparency() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join(BUNDLE_DIR);
        let mut bytes = 0;
        for id in crate::services::theme_previews::THEMES {
            let logo = find_artwork(&root, id, "logo").unwrap();
            let hero = find_artwork(&root, id, "hero").unwrap();
            assert_eq!(logo.extension().unwrap(), "webp");
            assert_eq!(hero.extension().unwrap(), "webp");
            let (width, height) = image::image_dimensions(&logo).unwrap();
            assert!(width <= 1024 && height <= 512);
            let (width, height) = image::image_dimensions(&hero).unwrap();
            assert!((1920..=3840).contains(&width) && height <= 2160);
            bytes +=
                std::fs::metadata(logo).unwrap().len() + std::fs::metadata(hero).unwrap().len();
        }
        assert!(bytes < 6 * 1024 * 1024);
        let logo = image::open(root.join("devil-may-cry-5/logo.webp"))
            .unwrap()
            .to_rgba8();
        assert!(logo.pixels().any(|pixel| pixel[3] < 255));
    }

    #[test]
    fn sanitize_replaces_non_ascii_chars() {
        assert_eq!(
            sanitize_segment("zelda-ocarina-of-time"),
            "zelda-ocarina-of-time"
        );
        assert_eq!(sanitize_segment("gta-vi"), "gta-vi");
        assert_eq!(sanitize_segment("Devil May Cry 5"), "Devil_May_Cry_5");
    }
}
