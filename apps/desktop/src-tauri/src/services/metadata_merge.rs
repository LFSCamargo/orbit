use crate::models::GameArtwork;
use crate::services::artwork::is_usable_artwork_reference;

/// Importer / placeholder descriptions that enrichment may replace.
pub fn is_placeholder_description(value: Option<&str>) -> bool {
    let Some(text) = value.map(str::trim).filter(|s| !s.is_empty()) else {
        return true;
    };

    let lower = text.to_ascii_lowercase();
    lower.starts_with("imported from")
        // Placeholder copy written by retired importers; still in old rows.
        || lower.starts_with("gamehub shortcut")
        || lower.starts_with("manually added")
}

/// Steam store copy first, then TheGamesDB. Importer stubs are never kept.
pub fn pick_description(
    existing: Option<&str>,
    store: Option<String>,
    tgdb: Option<String>,
    replace: bool,
) -> Option<String> {
    let store = store.filter(|text| !is_placeholder_description(Some(text)));
    let tgdb = tgdb.filter(|text| !is_placeholder_description(Some(text)));
    if let Some(text) = store {
        if replace || is_placeholder_description(existing) {
            return Some(text);
        }
    }
    if is_placeholder_description(existing) {
        return tgdb;
    }
    existing.map(str::to_string)
}

/// Fill empty artwork slots only — never wipe existing cover/hero/logo/icon.
pub fn merge_artwork(existing: &GameArtwork, incoming: &GameArtwork) -> GameArtwork {
    let mut merged = GameArtwork {
        cover: first_non_empty(existing.cover.as_deref(), incoming.cover.as_deref()),
        hero: first_non_empty(existing.hero.as_deref(), incoming.hero.as_deref()),
        logo: first_non_empty(existing.logo.as_deref(), incoming.logo.as_deref()),
        icon: first_non_empty(existing.icon.as_deref(), incoming.icon.as_deref()),
    };
    fill_icon_from_cover(&mut merged);
    merged
}

/// Square tiles prefer `icon`; when none exists, reuse portrait cover art.
pub fn fill_icon_from_cover(artwork: &mut GameArtwork) {
    if artwork
        .icon
        .as_deref()
        .is_some_and(is_usable_artwork_reference)
    {
        return;
    }

    if let Some(cover) = artwork
        .cover
        .as_deref()
        .filter(|value| is_usable_artwork_reference(value))
    {
        artwork.icon = Some(cover.to_string());
    }
}

fn first_non_empty(primary: Option<&str>, fallback: Option<&str>) -> Option<String> {
    if primary
        .is_some_and(|value| value.contains("/artwork-cache/") && value.ends_with("/fallback.png"))
    {
        return usable_artwork(fallback).or_else(|| usable_artwork(primary));
    }
    usable_artwork(primary).or_else(|| usable_artwork(fallback))
}

fn usable_artwork(value: Option<&str>) -> Option<String> {
    let value = value?.trim();
    if is_usable_artwork_reference(value) {
        Some(value.to_string())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_placeholder_descriptions() {
        assert!(is_placeholder_description(None));
        assert!(is_placeholder_description(Some("")));
        assert!(is_placeholder_description(Some(
            "Imported from Steam library (AppID 1091500)."
        )));
        assert!(is_placeholder_description(Some(
            "GameHub shortcut (gamehub://launch/steam/1)."
        )));
        assert!(is_placeholder_description(Some("Imported from GameHub.")));
        assert!(is_placeholder_description(Some(
            "Imported from Gamehub — /Users/me/GameHub/steamapps/common/GodOfWar/gow.exe"
        )));
        assert!(is_placeholder_description(Some(
            "Imported from a GameHub Steam install (AppID 447040). Play uses Orbit’s compatibility layer."
        )));
        assert!(!is_placeholder_description(Some(
            "An open-world RPG in Night City."
        )));
    }

    #[test]
    fn refresh_prefers_steam_store_copy_over_legacy_import_stubs() {
        let stub = "Imported from a GameHub Steam install (AppID 447040). Play uses Orbit’s compatibility layer.";
        assert_eq!(
            pick_description(
                Some(stub),
                Some("DedSec takes over San Francisco.".into()),
                Some("TheGamesDB overview.".into()),
                true,
            )
            .as_deref(),
            Some("DedSec takes over San Francisco.")
        );
        assert_eq!(
            pick_description(Some(stub), None, Some("TheGamesDB overview.".into()), true)
                .as_deref(),
            Some("TheGamesDB overview.")
        );
        assert_eq!(pick_description(Some(stub), None, None, true), None);
        assert_eq!(
            pick_description(
                Some("Keep my edit."),
                Some("DedSec takes over San Francisco.".into()),
                None,
                false,
            )
            .as_deref(),
            Some("Keep my edit.")
        );
    }

    #[test]
    fn merges_artwork_fill_empty_only() {
        let existing = GameArtwork {
            cover: Some("https://example.com/existing-cover.jpg".into()),
            hero: None,
            logo: Some("".into()),
            icon: None,
        };
        let incoming = GameArtwork {
            cover: Some("https://example.com/new-cover.jpg".into()),
            hero: Some("https://example.com/new-hero.jpg".into()),
            logo: Some("https://example.com/new-logo.jpg".into()),
            icon: Some("https://example.com/new-icon.jpg".into()),
        };
        let merged = merge_artwork(&existing, &incoming);
        assert_eq!(
            merged.cover.as_deref(),
            Some("https://example.com/existing-cover.jpg")
        );
        assert_eq!(
            merged.hero.as_deref(),
            Some("https://example.com/new-hero.jpg")
        );
        assert_eq!(
            merged.logo.as_deref(),
            Some("https://example.com/new-logo.jpg")
        );
        assert_eq!(
            merged.icon.as_deref(),
            Some("https://example.com/new-icon.jpg")
        );
    }

    #[test]
    fn ignores_directory_icon_in_favor_of_incoming_file() {
        let dir = std::env::temp_dir().join(format!("orbit-merge-dir-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let dir_path = dir.to_string_lossy().into_owned();

        let existing = GameArtwork {
            cover: None,
            hero: None,
            logo: None,
            icon: Some(dir_path),
        };
        let incoming = GameArtwork {
            cover: Some("https://example.com/new-cover.jpg".into()),
            hero: None,
            logo: None,
            icon: Some("https://example.com/new-icon.jpg".into()),
        };
        let merged = merge_artwork(&existing, &incoming);
        assert_eq!(
            merged.cover.as_deref(),
            Some("https://example.com/new-cover.jpg")
        );
        assert_eq!(
            merged.icon.as_deref(),
            Some("https://example.com/new-icon.jpg")
        );

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn fills_icon_from_cover_when_square_missing() {
        let existing = GameArtwork {
            cover: Some("https://example.com/cover.jpg".into()),
            hero: None,
            logo: None,
            icon: None,
        };
        let incoming = GameArtwork {
            cover: Some("https://example.com/new-cover.jpg".into()),
            hero: None,
            logo: None,
            icon: None,
        };
        let merged = merge_artwork(&existing, &incoming);
        assert_eq!(
            merged.cover.as_deref(),
            Some("https://example.com/cover.jpg")
        );
        assert_eq!(
            merged.icon.as_deref(),
            Some("https://example.com/cover.jpg")
        );
    }
}
