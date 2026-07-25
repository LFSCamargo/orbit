use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use crate::utils::filenames::{parse_switch_filename, switch_rom_stem, ParsedSwitchFilename};
use crate::utils::paths::is_macos_metadata_file;
use crate::utils::size::path_size_bytes;

/// Default filesystem walk depth for Switch ROM folders.
pub const DEFAULT_MAX_DEPTH: usize = 8;

/// Hard cap on visited directory entries (files + dirs) per walk.
pub const DEFAULT_ENTRY_CAP: usize = 50_000;

/// A Switch ROM discovered on disk with parsed filename metadata.
#[derive(Debug, Clone)]
pub struct ParsedRom {
    pub path: PathBuf,
    pub file_name: String,
    pub original_stem: String,
    pub parsed: ParsedSwitchFilename,
    pub size_bytes: Option<i64>,
}

/// Walk `root` for `.nsp` / `.xci` files and parse each filename.
///
/// Complexity: O(n) over directory entries, bounded by `max_depth` and `DEFAULT_ENTRY_CAP`.
pub fn walk_switch_roms(root: &Path, max_depth: Option<usize>) -> Vec<ParsedRom> {
    if !root.exists() {
        return Vec::new();
    }

    let depth = max_depth.unwrap_or(DEFAULT_MAX_DEPTH);
    let mut roms = Vec::new();
    let mut visited = 0usize;

    for entry in WalkDir::new(root)
        .max_depth(depth)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        visited += 1;
        if visited > DEFAULT_ENTRY_CAP {
            break;
        }

        let path = entry.path();
        if let Some(rom) = parse_switch_rom(path) {
            roms.push(rom);
        }
    }

    roms
}

/// Parse a single path as a Switch ROM if it is an `.nsp` / `.xci` file.
pub fn parse_switch_rom(path: &Path) -> Option<ParsedRom> {
    if !path.is_file() || is_macos_metadata_file(path) {
        return None;
    }

    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if ext != "nsp" && ext != "xci" {
        return None;
    }

    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_string();
    let original_stem = switch_rom_stem(path).unwrap_or_default();
    let parsed = parse_switch_filename(&file_name);
    let size_bytes = path_size_bytes(path);

    Some(ParsedRom {
        path: path.to_path_buf(),
        file_name,
        original_stem,
        parsed,
        size_bytes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;

    #[test]
    fn walks_nsp_and_parses_title_id() {
        let dir = std::env::temp_dir().join(format!("orbit-switch-scan-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let rom_path = dir.join("Hogwarts Legacy [0100F7E00C70E000][v0].nsp");
        fs::File::create(&rom_path)
            .unwrap()
            .write_all(b"rom")
            .unwrap();
        // Non-ROM should be ignored
        fs::write(dir.join("readme.txt"), b"hi").unwrap();

        let roms = walk_switch_roms(&dir, Some(2));
        assert_eq!(roms.len(), 1);
        assert_eq!(roms[0].parsed.title, "Hogwarts Legacy");
        assert_eq!(
            roms[0].parsed.title_id.as_deref(),
            Some("0100F7E00C70E000")
        );

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn parse_switch_rom_rejects_non_rom() {
        let dir = std::env::temp_dir().join(format!("orbit-switch-parse-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("game.exe");
        fs::write(&path, b"x").unwrap();
        assert!(parse_switch_rom(&path).is_none());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn respects_max_depth() {
        let root = std::env::temp_dir().join(format!("orbit-switch-depth-{}", uuid::Uuid::new_v4()));
        let nested = root.join("a").join("b");
        fs::create_dir_all(&nested).unwrap();
        fs::write(nested.join("Deep [0100F7E00C70E000][v0].nsp"), b"rom").unwrap();

        let shallow = walk_switch_roms(&root, Some(1));
        assert!(shallow.is_empty());

        let deep = walk_switch_roms(&root, Some(4));
        assert_eq!(deep.len(), 1);

        let _ = fs::remove_dir_all(root);
    }
}
