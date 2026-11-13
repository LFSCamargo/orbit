use anyhow::{bail, Context, Result};
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::{Component, Path, PathBuf},
};

pub fn absolute_file(path: &Path) -> Result<PathBuf> {
    if !path.is_absolute() || path.components().any(|c| matches!(c, Component::ParentDir)) {
        bail!("Choose an absolute file path without parent traversal");
    }
    let canonical = path
        .canonicalize()
        .context("Selected file is unavailable")?;
    if !canonical.is_file() {
        bail!("Selected path is not a file");
    }
    Ok(canonical)
}
pub fn windows_executable(path: &Path) -> Result<PathBuf> {
    if !path
        .extension()
        .is_some_and(|s| s.eq_ignore_ascii_case("exe"))
    {
        bail!("Choose a Windows .exe file");
    }
    let path = absolute_file(path)?;
    let mut file = File::open(&path)?;
    let mut dos = [0; 64];
    file.read_exact(&mut dos)
        .context("File is not a Windows executable")?;
    if &dos[..2] != b"MZ" {
        bail!("File is not a Windows executable (missing MZ header)");
    }
    let offset = u32::from_le_bytes(dos[60..64].try_into().unwrap()) as u64;
    if offset < 64 || offset > file.metadata()?.len().saturating_sub(4) {
        bail!("Invalid Windows PE header");
    }
    file.seek(SeekFrom::Start(offset))?;
    let mut pe = [0; 4];
    file.read_exact(&mut pe)?;
    if &pe != b"PE\0\0" {
        bail!("File is not a Windows PE executable");
    }
    Ok(path)
}
