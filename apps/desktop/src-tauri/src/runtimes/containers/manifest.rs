//! Per-game container marker. Never written by the frontend.
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContainerManifest {
    pub game_id: String,
    pub wine_key: String,
    pub wine_version: String,
    pub steam_seeded: bool,
}

impl ContainerManifest {
    pub fn read(dir: &Path) -> Result<Option<Self>> {
        let path = dir.join("container.json");
        if !path.is_file() {
            return Ok(None);
        }
        let bytes = fs::read(&path).context("Container marker could not be read")?;
        if bytes.len() > 16 * 1024 {
            anyhow::bail!("Container marker exceeded the supported size");
        }
        Ok(Some(
            serde_json::from_slice(&bytes).context("Container marker could not be read")?,
        ))
    }

    pub fn write(&self, dir: &Path) -> Result<()> {
        fs::create_dir_all(dir)?;
        let path = dir.join("container.json");
        if path
            .symlink_metadata()
            .is_ok_and(|meta| meta.file_type().is_symlink())
        {
            anyhow::bail!("Container marker cannot be a symlink");
        }
        fs::write(path, serde_json::to_vec(self)?)
            .context("Container marker could not be saved")?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_a_container_marker() {
        let root = std::env::temp_dir().join(format!("orbit-manifest-{}", uuid::Uuid::new_v4()));
        let manifest = ContainerManifest {
            game_id: "game-1".into(),
            wine_key: "abc".into(),
            wine_version: "wine-10.0".into(),
            steam_seeded: true,
        };
        manifest.write(&root).unwrap();
        assert_eq!(ContainerManifest::read(&root).unwrap().unwrap(), manifest);
        let _ = fs::remove_dir_all(root);
    }
}
