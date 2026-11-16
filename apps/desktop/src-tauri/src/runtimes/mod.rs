//! Execution engines are independent of library providers and UI components.
pub mod catalog;
pub mod components;
pub mod detection;
pub mod gamehub_components;
pub mod gptk_local;
pub mod homebrew;
pub mod layer;
pub mod manager;
pub mod prefix;
pub mod process;
pub mod selections;
pub mod settings;
pub mod validation;
pub mod wine;

use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::Path, sync::atomic::AtomicBool};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WineProfile {
    pub executable: String,
    pub runtime_path: String,
    #[serde(default)]
    pub arguments: Vec<String>,
    #[serde(default)]
    pub environment: BTreeMap<String, String>,
    /// Optional per-game overrides. Missing values inherit the global defaults.
    #[serde(default)]
    pub compatibility: settings::CompatibilityOverrides,
    /// Resolved at launch; never persisted back into the game's launch JSON.
    #[serde(skip)]
    pub effective: settings::CompatibilitySettings,
    /// Resolved at launch from the stored active-version selections: component
    /// id to payload path. Never persisted, so removing a version cannot break
    /// an existing launch configuration.
    #[serde(skip)]
    pub selections: std::collections::BTreeMap<String, String>,
    /// Steam Windows play reuses the signed-in prefix. Never persisted.
    #[serde(skip)]
    pub shared_prefix: Option<String>,
}
impl WineProfile {
    pub fn validate_options(&self) -> Result<()> {
        if self.arguments.len() > 128
            || self
                .arguments
                .iter()
                .any(|a| a.len() > 4096 || a.contains('\0'))
        {
            bail!("Launch arguments exceed the supported size or contain a null byte");
        }
        // Prefix, loader, path and credential overrides cannot escape the owned environment.
        const ALLOWED: &[&str] = &[
            "WINEDEBUG",
            "WINEDLLOVERRIDES",
            "WINEESYNC",
            "WINEMSYNC",
            "WINEFSYNC",
            "DXVK_HUD",
            "DXVK_LOG_LEVEL",
            "DXVK_FRAME_RATE",
            "DXMT_CONFIG",
            "DXMT_ENABLE_NVEXT",
            "DXMT_METALFX_SPATIAL_SWAPCHAIN",
            "D3DM_ENABLE_METALFX",
            "ROSETTA_ADVERTISE_AVX",
            "MTL_HUD_ENABLED",
        ];
        if self
            .environment
            .iter()
            .any(|(k, v)| !ALLOWED.contains(&k.as_str()) || v.len() > 4096 || v.contains('\0'))
        {
            bail!(
                "Unsupported environment variable. Allowed: {}",
                ALLOWED.join(", ")
            );
        }
        Ok(())
    }
}

/// New engines return an owned handle; externally managed native/emulator launches
/// retain their existing session policy until their adapters can own a process.
pub trait RuntimeProcess: Send {
    fn pid(&self) -> u32;
    fn poll(&mut self) -> Result<Option<i32>>;
    fn stop(&mut self) -> Result<()>;
}
pub trait RuntimeAdapter {
    type Configuration;
    fn launch(
        &self,
        config: &Self::Configuration,
        game_id: &str,
        root: &Path,
        cancel: &AtomicBool,
    ) -> Result<Box<dyn RuntimeProcess>>;
}

pub fn root() -> std::path::PathBuf {
    crate::utils::paths::app_data_dir().join("runtimes")
}

#[cfg(test)]
mod tests;
