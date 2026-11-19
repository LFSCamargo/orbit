//! Paths for Orbit-owned Wine containers. Identifiers stay alphanumeric.
use anyhow::{bail, Result};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::runtimes::detection::WineInstallation;

pub fn validate_id(id: &str) -> Result<()> {
    if id.is_empty()
        || id.len() > 100
        || !id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
    {
        bail!("Invalid container identifier");
    }
    Ok(())
}

pub fn wine_key(runtime: &WineInstallation) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"orbit-container-wine-v1");
    hasher.update(runtime.path.as_bytes());
    hasher.update(runtime.version.as_bytes());
    format!("{:x}", hasher.finalize())[..16].to_string()
}

pub fn directory(root: &Path, kind: &str, id: &str) -> Result<PathBuf> {
    validate_id(kind)?;
    validate_id(id)?;
    fs::create_dir_all(root)?;
    let root = root.canonicalize()?;
    let path = root.join(kind).join(id);
    if path
        .symlink_metadata()
        .is_ok_and(|meta| meta.file_type().is_symlink())
    {
        bail!("Managed container directory cannot be a symlink");
    }
    fs::create_dir_all(&path)?;
    Ok(path)
}

pub fn prefix_ready(prefix: &Path) -> bool {
    prefix.is_dir() && prefix.join("system.reg").is_file()
}

pub fn under_root(root: &Path, path: &Path) -> Result<bool> {
    let root = root.canonicalize()?;
    let path = path.canonicalize()?;
    Ok(path.starts_with(root))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_traversal_and_keys_wine_installs() {
        let root = std::env::temp_dir().join(format!("orbit-layout-{}", uuid::Uuid::new_v4()));
        assert!(validate_id("../outside").is_err());
        assert!(directory(&root, "games", "ok-id").is_ok());
        assert!(directory(&root, "games", "../x").is_err());
        let runtime = WineInstallation {
            path: "/wine/bin/wine".into(),
            server_path: "/wine/bin/wineserver".into(),
            version: "wine-10.0".into(),
        };
        assert_eq!(wine_key(&runtime).len(), 16);
        let _ = fs::remove_dir_all(root);
    }
}
