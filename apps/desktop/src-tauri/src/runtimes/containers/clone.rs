//! APFS clonefile of a prefix tree, with a bounded copy fallback.
use anyhow::{bail, Context, Result};
use std::{fs, path::Path};

const MAX_ENTRIES: usize = 100_000;
const MAX_DEPTH: usize = 32;

pub fn clone_tree(src: &Path, dst: &Path) -> Result<()> {
    if !src.is_dir() {
        bail!("Container source is not a Wine prefix");
    }
    if dst.exists() {
        bail!("Container destination already exists");
    }
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)?;
    }
    #[cfg(target_os = "macos")]
    if try_clonefile(src, dst) {
        return Ok(());
    }
    copy_tree(src, dst, 0, &mut 0)
}

pub fn replace_tree(src: &Path, dst: &Path) -> Result<()> {
    if dst.exists() {
        fs::remove_dir_all(dst).context("Could not replace the previous container")?;
    }
    clone_tree(src, dst)
}

#[cfg(target_os = "macos")]
fn try_clonefile(src: &Path, dst: &Path) -> bool {
    use std::os::unix::ffi::OsStrExt;
    let Ok(src_c) = std::ffi::CString::new(src.as_os_str().as_bytes()) else {
        return false;
    };
    let Ok(dst_c) = std::ffi::CString::new(dst.as_os_str().as_bytes()) else {
        return false;
    };
    // SAFETY: both paths are NUL-terminated; clonefile does not retain them.
    unsafe { libc::clonefile(src_c.as_ptr(), dst_c.as_ptr(), 0x0001) == 0 }
}

fn copy_tree(src: &Path, dst: &Path, depth: usize, count: &mut usize) -> Result<()> {
    if depth > MAX_DEPTH {
        bail!("Container tree exceeded the supported depth");
    }
    fs::create_dir_all(dst)?;
    for item in fs::read_dir(src)? {
        if *count >= MAX_ENTRIES {
            bail!("Container tree exceeded the supported size");
        }
        *count += 1;
        let item = item?;
        let from = item.path();
        let to = dst.join(item.file_name());
        let meta = item.file_type()?;
        if meta.is_symlink() {
            let target = fs::read_link(&from)?;
            #[cfg(unix)]
            std::os::unix::fs::symlink(target, &to)?;
            #[cfg(not(unix))]
            fs::copy(&from, &to)?;
        } else if meta.is_dir() {
            copy_tree(&from, &to, depth + 1, count)?;
        } else if meta.is_file() {
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

pub fn copy_file(src: &Path, dst: &Path) -> Result<()> {
    if !src.is_file() {
        bail!("Container file is missing");
    }
    if dst
        .symlink_metadata()
        .is_ok_and(|meta| meta.file_type().is_symlink())
    {
        bail!("Container file cannot be a symlink");
    }
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(src, dst)
        .map(|_| ())
        .context("Could not copy into the container")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sandbox() -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("orbit-clone-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn clones_a_prefix_without_touching_the_source() {
        let root = sandbox();
        let src = root.join("src");
        fs::create_dir_all(src.join("drive_c/windows")).unwrap();
        fs::write(src.join("system.reg"), b"reg").unwrap();
        fs::write(src.join("drive_c/windows/system.ini"), b"ini").unwrap();
        let dst = root.join("dst");
        clone_tree(&src, &dst).unwrap();
        assert_eq!(fs::read(dst.join("system.reg")).unwrap(), b"reg");
        fs::write(dst.join("system.reg"), b"changed").unwrap();
        assert_eq!(fs::read(src.join("system.reg")).unwrap(), b"reg");
        assert!(clone_tree(&src, &dst).is_err());
        let _ = fs::remove_dir_all(root);
    }
}
