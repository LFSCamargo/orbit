//! Game-specific patches applied before a Windows game launches.
//!
//! Each entry fixes one title that does not run on a stock container, so
//! people who just downloaded it never meet the problem:
//!
//! - God of War Ragnarök (2322010) refuses to start without AVX2 and F16C
//!   ("F16C instructions" error). Rosetta exposes both when
//!   `ROSETTA_ADVERTISE_AVX=1`, so the game always gets it, even with the
//!   global AVX switch off. Community "no_avx2_f16c" executables are built for
//!   one game version: on a newer install they start, then halt in the
//!   settings menu with "Unrecoverable Lua error". When such a build (PE
//!   section `.avx2fix`) replaced `GoWR.exe` and the original is kept next
//!   to it as `GoWR.exe.orbit-original`, the original comes back and the
//!   bypass is kept as `GoWR.exe.cpu-bypass`.
//!
//! Patches are bounded reads and renames inside the game's own folder.
//! Symlinks are never followed; failures are logged and never block a launch.
use std::collections::BTreeMap;
use std::fs;
use std::io::Read;
use std::path::Path;

struct GamePatch {
    app_id: &'static str,
    /// Environment the game needs; replaces the person's value.
    environment: &'static [(&'static str, &'static str)],
    /// The main executable a CPU-bypass build may have replaced.
    cpu_bypass_executable: Option<&'static str>,
}

const PATCHES: [GamePatch; 1] = [GamePatch {
    app_id: "2322010",
    environment: &[("ROSETTA_ADVERTISE_AVX", "1")],
    cpu_bypass_executable: Some("GoWR.exe"),
}];

const ORIGINAL_SUFFIX: &str = ".orbit-original";
const BYPASS_SUFFIX: &str = ".cpu-bypass";
/// Section the community CPU-bypass executables add to the game.
const BYPASS_SECTION: &[u8; 8] = b".avx2fix";
/// PE headers and the section table fit well inside this.
const HEADER_LIMIT: usize = 64 * 1024;

fn patch(app_id: &str) -> Option<&'static GamePatch> {
    PATCHES.iter().find(|patch| patch.app_id == app_id)
}

/// Sets the environment a known game needs. O(1).
pub fn apply_environment(app_id: &str, environment: &mut BTreeMap<String, String>) {
    let Some(patch) = patch(app_id) else { return };
    if app_id == "2322010" {
        environment
            .entry("D3DM_MAX_FPS".into())
            .or_insert_with(|| "60".into());
    }
    for (key, value) in patch.environment {
        environment.insert((*key).into(), (*value).into());
    }
}

/// Applies a known game's file patches in its install folder.
pub fn apply_files(app_id: &str, install_dir: &Path) {
    let Some(executable) = patch(app_id).and_then(|patch| patch.cpu_bypass_executable) else {
        return;
    };
    if let Err(error) = restore_original(install_dir, executable) {
        eprintln!("[orbit] could not restore {executable} for {app_id}: {error}");
    }
}

/// Whether a PE image's section table has the CPU-bypass section. Reads at
/// most `HEADER_LIMIT` bytes.
pub fn has_bypass_section(header: &[u8]) -> bool {
    let read_u32 = |at: usize| {
        header
            .get(at..at + 4)
            .map(|b| u32::from_le_bytes(b.try_into().unwrap()))
    };
    let read_u16 = |at: usize| {
        header
            .get(at..at + 2)
            .map(|b| u16::from_le_bytes(b.try_into().unwrap()))
    };
    let Some(pe) = read_u32(0x3c).map(|v| v as usize) else {
        return false;
    };
    if header.get(pe..pe + 4) != Some(b"PE\0\0".as_slice()) {
        return false;
    }
    let (Some(sections), Some(optional)) = (read_u16(pe + 6), read_u16(pe + 20)) else {
        return false;
    };
    let table = pe + 24 + optional as usize;
    (0..sections as usize).any(|index| {
        let at = table + index * 40;
        header.get(at..at + 8) == Some(BYPASS_SECTION.as_slice())
    })
}

fn regular_file(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok_and(|meta| meta.file_type().is_file())
}

fn read_header(path: &Path) -> std::io::Result<Vec<u8>> {
    let mut header = Vec::with_capacity(HEADER_LIMIT);
    fs::File::open(path)?
        .take(HEADER_LIMIT as u64)
        .read_to_end(&mut header)?;
    Ok(header)
}

/// Puts the kept original back when a CPU-bypass build replaced it. Returns
/// whether it did. The bypass is renamed, never deleted.
fn restore_original(install_dir: &Path, executable: &str) -> std::io::Result<bool> {
    let current = install_dir.join(executable);
    let original = install_dir.join(format!("{executable}{ORIGINAL_SUFFIX}"));
    let bypass = install_dir.join(format!("{executable}{BYPASS_SUFFIX}"));
    if !regular_file(&current) || !regular_file(&original) || bypass.exists() {
        return Ok(false);
    }
    if !has_bypass_section(&read_header(&current)?) || has_bypass_section(&read_header(&original)?)
    {
        return Ok(false);
    }
    fs::rename(&current, &bypass)?;
    if let Err(error) = fs::copy(&original, &current) {
        let _ = fs::rename(&bypass, &current);
        return Err(error);
    }
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A minimal PE header with the given section names.
    fn pe(sections: &[&[u8; 8]]) -> Vec<u8> {
        let mut image = vec![0u8; 0x400];
        image[0x3c..0x40].copy_from_slice(&0x80u32.to_le_bytes());
        image[0x80..0x84].copy_from_slice(b"PE\0\0");
        image[0x86..0x88].copy_from_slice(&(sections.len() as u16).to_le_bytes());
        image[0x94..0x96].copy_from_slice(&0xf0u16.to_le_bytes());
        let table = 0x80 + 24 + 0xf0;
        for (index, name) in sections.iter().enumerate() {
            image[table + index * 40..table + index * 40 + 8].copy_from_slice(*name);
        }
        image
    }

    fn game_dir() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("orbit-game-patches-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn god_of_war_ragnarok_always_gets_avx_from_rosetta() {
        // Regression: without AVX2/F16C the game stopped at launch, which led
        // to an outdated CPU-bypass executable that crashed in settings.
        let mut environment =
            BTreeMap::from([("ROSETTA_ADVERTISE_AVX".to_string(), "0".to_string())]);
        apply_environment("2322010", &mut environment);
        assert_eq!(environment["ROSETTA_ADVERTISE_AVX"], "1");
        assert_eq!(environment["D3DM_MAX_FPS"], "60");
        environment.insert("D3DM_MAX_FPS".into(), "40".into());
        apply_environment("2322010", &mut environment);
        assert_eq!(environment["D3DM_MAX_FPS"], "40");
        let mut other = BTreeMap::new();
        apply_environment("883710", &mut other);
        assert!(other.is_empty());
    }

    #[test]
    fn finds_the_cpu_bypass_section() {
        assert!(has_bypass_section(&pe(&[b".text\0\0\0", b".avx2fix"])));
        assert!(!has_bypass_section(&pe(&[b".text\0\0\0", b".rdata\0\0"])));
        assert!(!has_bypass_section(b"not a PE"));
        assert!(!has_bypass_section(&[]));
    }

    #[test]
    fn an_outdated_bypass_gives_way_to_the_kept_original() {
        // Regression: GoWR_1.9_no_avx2_f16c (March 2025) over the June 2025
        // game halted in the settings menu with "Unrecoverable Lua error".
        let dir = game_dir();
        let original = pe(&[b".text\0\0\0"]);
        let bypass = pe(&[b".text\0\0\0", b".avx2fix"]);
        fs::write(dir.join("GoWR.exe"), &bypass).unwrap();
        fs::write(dir.join("GoWR.exe.orbit-original"), &original).unwrap();
        apply_files("2322010", &dir);
        assert_eq!(fs::read(dir.join("GoWR.exe")).unwrap(), original);
        assert_eq!(fs::read(dir.join("GoWR.exe.cpu-bypass")).unwrap(), bypass);
        assert!(
            dir.join("GoWR.exe.orbit-original").is_file(),
            "the backup stays"
        );
        // A second launch changes nothing.
        apply_files("2322010", &dir);
        assert_eq!(fs::read(dir.join("GoWR.exe")).unwrap(), original);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn a_bypass_without_a_kept_original_is_left_alone() {
        let dir = game_dir();
        let bypass = pe(&[b".avx2fix"]);
        fs::write(dir.join("GoWR.exe"), &bypass).unwrap();
        apply_files("2322010", &dir);
        assert_eq!(fs::read(dir.join("GoWR.exe")).unwrap(), bypass);
        assert!(!dir.join("GoWR.exe.cpu-bypass").exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_executables_are_never_touched() {
        let dir = game_dir();
        let outside = dir.join("outside.exe");
        fs::write(&outside, pe(&[b".avx2fix"])).unwrap();
        std::os::unix::fs::symlink(&outside, dir.join("GoWR.exe")).unwrap();
        fs::write(dir.join("GoWR.exe.orbit-original"), pe(&[b".text\0\0\0"])).unwrap();
        apply_files("2322010", &dir);
        assert!(fs::symlink_metadata(dir.join("GoWR.exe"))
            .unwrap()
            .file_type()
            .is_symlink());
        let _ = fs::remove_dir_all(dir);
    }
}
