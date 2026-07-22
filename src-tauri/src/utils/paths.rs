use std::path::{Path, PathBuf};

use crate::utils::filenames::{
    is_switch_application_title_id, is_switch_base_application, normalize_switch_group_title,
    parse_switch_filename, switch_application_id_from_title_id, switch_rom_stem,
};
use crate::utils::macos_apps::is_switch_rom;
use crate::utils::size::path_size_bytes;

pub fn is_macos_metadata_file(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| {
            name.starts_with("._") || name == ".DS_Store" || name == "Thumbs.db"
        })
}

/// macOS creates `._*` AppleDouble sidecars on exFAT/FAT drives. Importers may
/// pick them up by mistake; resolve to the sibling ROM when launching.
pub fn resolve_launch_file_path(path: &Path) -> PathBuf {
    if !is_macos_metadata_file(path) {
        return canonical_import_path(path);
    }

    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return canonical_import_path(path);
    };
    let Some(real_name) = name.strip_prefix("._") else {
        return canonical_import_path(path);
    };

    let candidate = path.with_file_name(real_name);
    if candidate.is_file() {
        canonical_import_path(&candidate)
    } else {
        canonical_import_path(path)
    }
}

/// Switch emulators apply updates/DLC from the same folder — always launch the base application ROM.
pub fn resolve_switch_base_launch_path(path: &Path) -> Result<PathBuf, String> {
    let resolved = resolve_launch_file_path(path);
    if !is_switch_rom(&resolved) {
        return Ok(resolved);
    }

    let Some(file_name) = resolved.file_name().and_then(|value| value.to_str()) else {
        return Ok(resolved);
    };

    let original_stem = switch_rom_stem(&resolved).unwrap_or_default();
    let parsed = parse_switch_filename(file_name);
    let size_bytes = path_size_bytes(&resolved);

    if is_switch_base_application(&parsed, &original_stem, size_bytes) {
        return Ok(resolved);
    }

    let application_id = parsed.title_id.as_deref().and_then(|title_id| {
        if is_switch_application_title_id(title_id) {
            Some(title_id.to_string())
        } else {
            switch_application_id_from_title_id(title_id)
        }
    });
    let title_hint = normalize_switch_group_title(&parsed.title);

    let Some(parent) = resolved.parent() else {
        return Err(base_rom_missing_message(&resolved));
    };

    if let Some(base_path) = find_switch_base_rom_in_dir(parent, application_id.as_deref(), &title_hint)
    {
        return Ok(base_path);
    }

    Err(base_rom_missing_message(&resolved))
}

fn find_switch_base_rom_in_dir(
    folder: &Path,
    application_id: Option<&str>,
    title_hint: &str,
) -> Option<PathBuf> {
    let title_hint_lower = title_hint.to_ascii_lowercase();
    let mut best: Option<(i64, PathBuf)> = None;

    let entries = std::fs::read_dir(folder).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() || is_macos_metadata_file(&path) || !is_switch_rom(&path) {
            continue;
        }

        let file_name = path.file_name().and_then(|value| value.to_str())?;
        let original_stem = switch_rom_stem(&path).unwrap_or_default();
        let parsed = parse_switch_filename(file_name);
        let size_bytes = path_size_bytes(&path);

        if !is_switch_base_application(&parsed, &original_stem, size_bytes) {
            continue;
        }

        let matches_id = application_id.is_some_and(|app_id| {
            parsed
                .title_id
                .as_deref()
                .is_some_and(|title_id| title_id.eq_ignore_ascii_case(app_id))
        });
        let parsed_title = normalize_switch_group_title(&parsed.title);
        let matches_title = !title_hint_lower.is_empty()
            && parsed_title.to_ascii_lowercase() == title_hint_lower;

        if application_id.is_some() && !matches_id && !matches_title {
            continue;
        }

        let score = size_bytes.unwrap_or(0);
        if best.as_ref().is_none_or(|(best_size, _)| score >= *best_size) {
            best = Some((score, canonical_import_path(&path)));
        }
    }

    best.map(|(_, path)| path)
}

fn base_rom_missing_message(path: &Path) -> String {
    format!(
        "Base game ROM not found near {}. Orbit launches the base title only — your emulator will detect updates and DLC in the same folder.",
        path.display()
    )
}

/// Store absolute, normalized paths so external-drive imports stay launchable.
pub fn canonical_import_path(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| {
        if path.is_absolute() {
            path.to_path_buf()
        } else {
            std::env::current_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
                .join(path)
        }
    })
}

pub fn app_data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Orbit")
}

pub fn database_path() -> PathBuf {
    app_data_dir().join("orbit.sqlite3")
}

pub fn artwork_cache_dir() -> PathBuf {
    app_data_dir().join("artwork-cache")
}

pub fn themes_dir() -> PathBuf {
    app_data_dir().join("themes")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;

    #[test]
    fn detects_apple_double_sidecars() {
        assert!(is_macos_metadata_file(Path::new(
            "/Games/._Zelda [0100].nsp"
        )));
        assert!(!is_macos_metadata_file(Path::new(
            "/Games/Zelda [0100].nsp"
        )));
    }

    #[test]
    fn resolves_sidecar_to_sibling_rom() {
        let dir = std::env::temp_dir().join(format!("orbit-path-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();

        let rom = dir.join("Game [0100F7E00C70E000][v0].nsp");
        let sidecar = dir.join("._Game [0100F7E00C70E000][v0].nsp");
        fs::File::create(&rom)
            .unwrap()
            .write_all(b"rom")
            .unwrap();
        fs::File::create(&sidecar)
            .unwrap()
            .write_all(b"meta")
            .unwrap();

        assert_eq!(
            resolve_launch_file_path(&sidecar),
            canonical_import_path(&rom)
        );

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn resolves_update_path_to_base_rom_in_same_folder() {
        let dir = std::env::temp_dir().join(format!("orbit-base-launch-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();

        let base = dir.join("Hogwarts Legacy [0100F7E00C70E000][v0].nsp");
        let update = dir.join("Hogwarts Legacy [0100F7E00C70E800][v327680].nsp");
        for (path, bytes) in [(&base, 200_000_000u64), (&update, 50_000_000u64)] {
            let file = fs::File::create(path).unwrap();
            file.set_len(bytes).unwrap();
        }

        let resolved =
            resolve_switch_base_launch_path(&update).expect("base rom should be found");
        assert_eq!(resolved, canonical_import_path(&base));

        let _ = fs::remove_dir_all(dir);
    }
}
