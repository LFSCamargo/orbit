//! Global compatibility defaults and optional per-game overrides.
use super::WineProfile;
use crate::database::GameRepository;
use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::Path};

pub const GLOBAL_SETTINGS_KEY: &str = "windows-compatibility-settings-v1";

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GraphicsBackend {
    #[default]
    Auto,
    Wine,
    Dxvk,
    Dxmt,
    D3dmetal,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Synchronization {
    #[default]
    Default,
    Esync,
    Msync,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Resolution {
    #[default]
    Auto,
    Custom,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CompatibilitySettings {
    #[serde(default)]
    pub graphics: GraphicsBackend,
    #[serde(default)]
    pub synchronization: Synchronization,
    #[serde(default)]
    pub retina_mode: bool,
    #[serde(default)]
    pub metal_hud: bool,
    #[serde(default)]
    pub avx: bool,
    #[serde(default)]
    pub upscaling: bool,
    #[serde(default)]
    pub upscale_ratio: u32,
    #[serde(default)]
    pub frame_generation: bool,
    #[serde(default)]
    pub frame_generation_vsync: bool,
    #[serde(default)]
    pub frame_rate_limit: Option<u32>,
    #[serde(default)]
    pub dxmt_nvidia_extensions: bool,
    #[serde(default)]
    pub resolution: Resolution,
    #[serde(default = "default_width")]
    pub resolution_width: u32,
    #[serde(default = "default_height")]
    pub resolution_height: u32,
}

const fn default_width() -> u32 {
    1920
}
const fn default_height() -> u32 {
    1080
}

impl Default for CompatibilitySettings {
    fn default() -> Self {
        Self {
            graphics: GraphicsBackend::Auto,
            synchronization: Synchronization::Default,
            retina_mode: false,
            metal_hud: false,
            avx: false,
            upscaling: false,
            upscale_ratio: 0,
            frame_generation: false,
            frame_generation_vsync: false,
            frame_rate_limit: None,
            dxmt_nvidia_extensions: false,
            resolution: Resolution::Auto,
            resolution_width: default_width(),
            resolution_height: default_height(),
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CompatibilityOverrides {
    pub graphics: Option<GraphicsBackend>,
    pub synchronization: Option<Synchronization>,
    pub retina_mode: Option<bool>,
    pub metal_hud: Option<bool>,
    pub avx: Option<bool>,
    pub upscaling: Option<bool>,
    pub upscale_ratio: Option<u32>,
    pub frame_generation: Option<bool>,
    pub frame_generation_vsync: Option<bool>,
    pub frame_rate_limit: Option<Option<u32>>,
    pub dxmt_nvidia_extensions: Option<bool>,
    pub resolution: Option<Resolution>,
    pub resolution_width: Option<u32>,
    pub resolution_height: Option<u32>,
}

impl CompatibilitySettings {
    pub fn validate(&self) -> Result<()> {
        if self.upscale_ratio > 4 {
            bail!("Upscale ratio must be between 0 and 4");
        }
        if self.frame_rate_limit.is_some_and(|value| value > 1000) {
            bail!("Frame rate limit must be between 1 and 1000");
        }
        if !(640..=7680).contains(&self.resolution_width)
            || !(480..=4320).contains(&self.resolution_height)
        {
            bail!("Custom resolution is outside the supported range");
        }
        Ok(())
    }

    /// Reject options whose backend is not installed instead of presenting a
    /// cosmetic switch that cannot affect the game. `selections` maps a
    /// component id to its installed payload path, so a key being present is
    /// exactly the proof that some version of it is installed.
    pub fn validate_launchable(
        &self,
        selections: &std::collections::BTreeMap<String, String>,
    ) -> Result<()> {
        let has_dxvk = selections.contains_key("dxvk");
        let has_dxmt = selections.contains_key("dxmt");
        let has_gptk = selections.contains_key("gptk");
        let has_moltenvk = selections.contains_key("moltenvk");
        match self.graphics {
            GraphicsBackend::Dxvk if !has_dxvk => {
                bail!("DXVK is not installed. Install it from Compatibility components first");
            }
            GraphicsBackend::Dxmt if !has_dxmt => {
                bail!("DXMT is not installed. Install it from Compatibility components first");
            }
            GraphicsBackend::D3dmetal if !has_gptk => {
                bail!("D3DMetal requires the Apple Game Porting Toolkit. Install or import it from Compatibility components first");
            }
            _ => {}
        }
        // MoltenVK is required by DXVK on macOS.
        if self.graphics == GraphicsBackend::Dxvk && !has_moltenvk {
            bail!("DXVK on macOS also requires MoltenVK. Install MoltenVK from Compatibility components first");
        }
        if self.upscaling {
            match self.graphics {
                GraphicsBackend::Dxmt if !has_dxmt => {
                    bail!("MetalFX upscaling requires DXMT");
                }
                GraphicsBackend::D3dmetal if !has_gptk => {
                    bail!("MetalFX upscaling requires D3DMetal");
                }
                GraphicsBackend::Dxmt | GraphicsBackend::D3dmetal => {}
                _ => bail!("MetalFX upscaling requires the DXMT or D3DMetal graphics engine"),
            }
        }
        if self.dxmt_nvidia_extensions && self.graphics != GraphicsBackend::Dxmt {
            bail!("DXMT NVIDIA extensions require the DXMT graphics engine");
        }
        if self.dxmt_nvidia_extensions && !has_dxmt {
            bail!("DXMT NVIDIA extensions require DXMT");
        }
        if self.frame_rate_limit.is_some()
            && !matches!(self.graphics, GraphicsBackend::Dxvk | GraphicsBackend::Dxmt)
        {
            bail!("Frame rate limiting requires the DXVK or DXMT graphics engine");
        }
        if self.frame_rate_limit.is_some() && self.graphics == GraphicsBackend::Dxvk && !has_dxvk {
            bail!("Frame rate limiting requires DXVK");
        }
        if self.frame_rate_limit.is_some() && self.graphics == GraphicsBackend::Dxmt && !has_dxmt {
            bail!("Frame rate limiting requires DXMT");
        }
        if self.frame_generation || self.frame_generation_vsync {
            bail!("Frame generation requires a GPTK 4 package with the Metal 4 backend. It cannot work with the installed version");
        }
        Ok(())
    }

    pub fn merged(&self, overrides: &CompatibilityOverrides) -> Self {
        Self {
            graphics: overrides.graphics.unwrap_or(self.graphics),
            synchronization: overrides.synchronization.unwrap_or(self.synchronization),
            retina_mode: overrides.retina_mode.unwrap_or(self.retina_mode),
            metal_hud: overrides.metal_hud.unwrap_or(self.metal_hud),
            avx: overrides.avx.unwrap_or(self.avx),
            upscaling: overrides.upscaling.unwrap_or(self.upscaling),
            upscale_ratio: overrides.upscale_ratio.unwrap_or(self.upscale_ratio),
            frame_generation: overrides.frame_generation.unwrap_or(self.frame_generation),
            frame_generation_vsync: overrides
                .frame_generation_vsync
                .unwrap_or(self.frame_generation_vsync),
            frame_rate_limit: overrides.frame_rate_limit.unwrap_or(self.frame_rate_limit),
            dxmt_nvidia_extensions: overrides
                .dxmt_nvidia_extensions
                .unwrap_or(self.dxmt_nvidia_extensions),
            resolution: overrides.resolution.unwrap_or(self.resolution),
            resolution_width: overrides.resolution_width.unwrap_or(self.resolution_width),
            resolution_height: overrides
                .resolution_height
                .unwrap_or(self.resolution_height),
        }
    }

    /// Automatic prefers GPTK, then DXMT, then DXVK. An explicit Wine choice stays Wine.
    pub fn launch_graphics(
        &self,
        selections: &std::collections::BTreeMap<String, String>,
    ) -> GraphicsBackend {
        let has_dxvk = selections.contains_key("dxvk");
        let has_dxmt = selections.contains_key("dxmt");
        let has_gptk = selections.contains_key("gptk");
        let has_moltenvk = selections.contains_key("moltenvk");
        match self.graphics {
            GraphicsBackend::Wine => GraphicsBackend::Wine,
            GraphicsBackend::Dxvk if has_dxvk && has_moltenvk => GraphicsBackend::Dxvk,
            GraphicsBackend::Dxmt if has_dxmt => GraphicsBackend::Dxmt,
            GraphicsBackend::D3dmetal if has_gptk => GraphicsBackend::D3dmetal,
            GraphicsBackend::Dxvk | GraphicsBackend::Dxmt | GraphicsBackend::D3dmetal => {
                self.graphics
            }
            GraphicsBackend::Auto => {
                if has_gptk {
                    GraphicsBackend::D3dmetal
                } else if has_dxmt {
                    GraphicsBackend::Dxmt
                } else if has_dxvk && has_moltenvk {
                    GraphicsBackend::Dxvk
                } else {
                    GraphicsBackend::Auto
                }
            }
        }
    }

    /// Apply resolved settings without overwriting explicit advanced per-game
    /// environment values. Values are literal and never pass through a shell.
    pub fn apply_environment(&self, environment: &mut BTreeMap<String, String>) {
        let mut set = |key: &str, value: String| {
            environment.entry(key.into()).or_insert(value);
        };
        let flag = |value: bool| if value { "1" } else { "0" }.to_string();
        set(
            "WINEESYNC",
            flag(self.synchronization == Synchronization::Esync),
        );
        set(
            "WINEMSYNC",
            flag(self.synchronization == Synchronization::Msync),
        );
        set("MTL_HUD_ENABLED", flag(self.metal_hud));
        set("ROSETTA_ADVERTISE_AVX", flag(self.avx));
        match self.graphics {
            GraphicsBackend::Dxmt => {
                set("DXMT_METALFX_SPATIAL_SWAPCHAIN", flag(self.upscaling));
                set("DXMT_ENABLE_NVEXT", flag(self.dxmt_nvidia_extensions));
                if let Some(limit) = self.frame_rate_limit {
                    set(
                        "DXMT_CONFIG",
                        format!("d3d11.preferredMaxFrameRate={limit}"),
                    );
                }
            }
            GraphicsBackend::D3dmetal => {
                set("D3DM_ENABLE_METALFX", flag(self.upscaling));
            }
            GraphicsBackend::Dxvk => {
                if let Some(limit) = self.frame_rate_limit {
                    set("DXVK_FRAME_RATE", limit.to_string());
                }
            }
            GraphicsBackend::Auto | GraphicsBackend::Wine => {}
        }
    }

    /// Drop flags that cannot apply to the resolved engine so Play is not
    /// blocked by a leftover DXMT NVIDIA / MetalFX / frame-rate setting.
    pub fn sanitize_for_engine(&mut self) {
        if self.graphics != GraphicsBackend::Dxmt {
            self.dxmt_nvidia_extensions = false;
        }
        if !matches!(
            self.graphics,
            GraphicsBackend::Dxmt | GraphicsBackend::D3dmetal
        ) {
            self.upscaling = false;
        }
        if !matches!(self.graphics, GraphicsBackend::Dxvk | GraphicsBackend::Dxmt) {
            self.frame_rate_limit = None;
        }
        self.frame_generation = false;
        self.frame_generation_vsync = false;
    }

    /// Registry writes required after prefix creation. Stock Wine documents
    /// RetinaMode under HKCU\Software\Wine\Mac Driver. `REG ADD` needs `/d` for
    /// the value data; omitting it is invalid syntax.
    pub fn registry_adds(&self) -> Vec<[String; 7]> {
        let mut operations = vec![reg_sz(
            r"HKCU\Software\Wine\Mac Driver",
            "RetinaMode",
            if self.retina_mode { "y" } else { "n" },
        )];
        if self.resolution == Resolution::Custom {
            operations.push(reg_sz(r"HKCU\Software\Wine\Explorer", "Desktop", "Orbit"));
            operations.push(reg_sz(
                r"HKCU\Software\Wine\Explorer\Desktops",
                "Orbit",
                &format!("{}x{}", self.resolution_width, self.resolution_height),
            ));
        }
        operations
    }
}

fn reg_sz(key: &str, name: &str, data: &str) -> [String; 7] {
    [
        key.into(),
        "/v".into(),
        name.into(),
        "/t".into(),
        "REG_SZ".into(),
        "/d".into(),
        data.into(),
    ]
}

pub fn load_global(repo: &GameRepository) -> Result<CompatibilitySettings> {
    let value = repo.get_setting(GLOBAL_SETTINGS_KEY)?;
    match value {
        Some(value) => Ok(serde_json::from_value(value)?),
        None => Ok(CompatibilitySettings::default()),
    }
}

pub fn save_global(repo: &GameRepository, settings: &CompatibilitySettings) -> Result<()> {
    save_global_in(&super::root(), repo, settings)
}

/// Testable core: which components count as installed depends on the component
/// root, so the validation input is explicit rather than the live app folder.
pub fn save_global_in(
    root: &Path,
    repo: &GameRepository,
    settings: &CompatibilitySettings,
) -> Result<()> {
    settings.validate()?;
    let actives = super::selections::load(repo)?;
    let selections = super::selections::resolve(root, &actives);
    let mut settings = settings.clone();
    settings.graphics = settings.launch_graphics(&selections);
    settings.sanitize_for_engine();
    settings.validate_launchable(&selections)?;
    repo.set_setting(GLOBAL_SETTINGS_KEY, &serde_json::to_value(settings)?)?;
    Ok(())
}

pub fn resolve_profile(repo: &GameRepository, profile: &WineProfile) -> Result<WineProfile> {
    resolve_profile_in(&super::root(), repo, profile)
}

/// Testable core: the components root is explicit so a launch resolution can be
/// verified without touching the real application data directory.
pub fn resolve_profile_in(
    root: &Path,
    repo: &GameRepository,
    profile: &WineProfile,
) -> Result<WineProfile> {
    let mut settings = load_global(repo)?.merged(&profile.compatibility);
    settings.validate()?;
    let actives = super::selections::load(repo)?;
    let selections = super::selections::resolve(root, &actives);
    settings.graphics = settings.launch_graphics(&selections);
    settings.sanitize_for_engine();
    settings.validate_launchable(&selections)?;
    let mut resolved = profile.clone();
    resolved.effective = settings.clone();
    resolved.selections = selections;
    settings.apply_environment(&mut resolved.environment);
    Ok(resolved)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn per_game_values_override_globals_without_mutating_defaults() {
        let global = CompatibilitySettings::default();
        let resolved = global.merged(&CompatibilityOverrides {
            synchronization: Some(Synchronization::Msync),
            metal_hud: Some(true),
            ..Default::default()
        });
        assert_eq!(resolved.synchronization, Synchronization::Msync);
        assert!(resolved.metal_hud);
        assert_eq!(global.synchronization, Synchronization::Default);
    }

    #[test]
    fn sync_modes_are_exclusive_and_advanced_environment_wins() {
        let settings = CompatibilitySettings {
            synchronization: Synchronization::Esync,
            ..Default::default()
        };
        let mut environment = BTreeMap::from([("WINEMSYNC".into(), "custom".into())]);
        settings.apply_environment(&mut environment);
        assert_eq!(environment.get("WINEESYNC").unwrap(), "1");
        assert_eq!(environment.get("WINEMSYNC").unwrap(), "custom");
    }

    #[test]
    fn global_defaults_persist_and_game_overrides_resolve_at_launch() {
        let root = std::env::temp_dir().join(format!("orbit-settings-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let repo = GameRepository::open(&root.join("library.sqlite")).unwrap();
        let global = CompatibilitySettings {
            synchronization: Synchronization::Msync,
            metal_hud: true,
            ..Default::default()
        };
        save_global(&repo, &global).unwrap();
        let profile = WineProfile {
            compatibility: CompatibilityOverrides {
                metal_hud: Some(false),
                ..Default::default()
            },
            ..Default::default()
        };
        let resolved = resolve_profile(&repo, &profile).unwrap();
        assert_eq!(resolved.effective.synchronization, Synchronization::Msync);
        assert!(!resolved.effective.metal_hud);
        assert_eq!(resolved.environment.get("WINEESYNC").unwrap(), "0");
        assert_eq!(resolved.environment.get("WINEMSYNC").unwrap(), "1");
        assert!(profile.effective == CompatibilitySettings::default());
        let serialized = serde_json::to_string(&resolved).unwrap();
        assert!(!serialized.contains("effective"));
        drop(repo);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn automatic_graphics_applies_dxmt_options_when_dxmt_is_installed() {
        let mut settings = CompatibilitySettings {
            graphics: GraphicsBackend::Auto,
            upscaling: true,
            dxmt_nvidia_extensions: true,
            frame_rate_limit: Some(60),
            ..Default::default()
        };
        let selections = BTreeMap::from([("dxmt".into(), "/components/dxmt".into())]);
        settings.graphics = settings.launch_graphics(&selections);
        assert_eq!(settings.graphics, GraphicsBackend::Dxmt);
        let mut environment = BTreeMap::new();
        settings.apply_environment(&mut environment);
        assert_eq!(
            environment.get("DXMT_METALFX_SPATIAL_SWAPCHAIN").unwrap(),
            "1"
        );
        assert_eq!(environment.get("DXMT_ENABLE_NVEXT").unwrap(), "1");
        assert_eq!(
            environment.get("DXMT_CONFIG").unwrap(),
            "d3d11.preferredMaxFrameRate=60"
        );

        let wine = CompatibilitySettings {
            graphics: GraphicsBackend::Wine,
            upscaling: true,
            ..Default::default()
        };
        assert_eq!(wine.launch_graphics(&selections), GraphicsBackend::Wine);
    }

    #[test]
    fn automatic_graphics_prefers_gptk_then_dxmt_then_dxvk() {
        let auto = CompatibilitySettings {
            graphics: GraphicsBackend::Auto,
            ..Default::default()
        };
        let all = BTreeMap::from([
            ("gptk".into(), "/gptk".into()),
            ("dxmt".into(), "/dxmt".into()),
            ("dxvk".into(), "/dxvk".into()),
            ("moltenvk".into(), "/moltenvk".into()),
        ]);
        assert_eq!(auto.launch_graphics(&all), GraphicsBackend::D3dmetal);
        let dxmt = BTreeMap::from([("dxmt".into(), "/dxmt".into())]);
        assert_eq!(auto.launch_graphics(&dxmt), GraphicsBackend::Dxmt);
        let dxvk = BTreeMap::from([
            ("dxvk".into(), "/dxvk".into()),
            ("moltenvk".into(), "/moltenvk".into()),
        ]);
        assert_eq!(auto.launch_graphics(&dxvk), GraphicsBackend::Dxvk);
        let explicit = CompatibilitySettings {
            graphics: GraphicsBackend::Dxmt,
            ..Default::default()
        };
        assert_eq!(explicit.launch_graphics(&all), GraphicsBackend::Dxmt);
    }

    #[test]
    fn launch_drops_dxmt_only_options_when_the_engine_is_not_dxmt() {
        let mut settings = CompatibilitySettings {
            graphics: GraphicsBackend::Auto,
            dxmt_nvidia_extensions: true,
            upscaling: true,
            frame_rate_limit: Some(60),
            frame_generation: true,
            frame_generation_vsync: true,
            ..Default::default()
        };
        let selections = BTreeMap::new();
        settings.graphics = settings.launch_graphics(&selections);
        settings.sanitize_for_engine();
        assert_eq!(settings.graphics, GraphicsBackend::Auto);
        assert!(!settings.dxmt_nvidia_extensions);
        assert!(!settings.upscaling);
        assert!(settings.frame_rate_limit.is_none());
        assert!(!settings.frame_generation);
        assert!(!settings.frame_generation_vsync);
        settings.validate_launchable(&selections).unwrap();

        let mut wine = CompatibilitySettings {
            graphics: GraphicsBackend::Wine,
            dxmt_nvidia_extensions: true,
            ..Default::default()
        };
        wine.graphics = wine.launch_graphics(&selections);
        wine.sanitize_for_engine();
        assert!(!wine.dxmt_nvidia_extensions);
        wine.validate_launchable(&selections).unwrap();
    }

    #[test]
    fn resolve_profile_ignores_stale_dxmt_nvidia_when_dxmt_is_missing() {
        let root =
            std::env::temp_dir().join(format!("orbit-settings-nvidia-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let repo = GameRepository::open(&root.join("library.sqlite")).unwrap();
        let stale = CompatibilitySettings {
            graphics: GraphicsBackend::Auto,
            dxmt_nvidia_extensions: true,
            ..Default::default()
        };
        repo.set_setting(GLOBAL_SETTINGS_KEY, &serde_json::to_value(&stale).unwrap())
            .unwrap();
        let resolved = resolve_profile_in(&root, &repo, &WineProfile::default()).unwrap();
        assert_eq!(resolved.effective.graphics, GraphicsBackend::Auto);
        assert!(!resolved.effective.dxmt_nvidia_extensions);
        drop(repo);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn retina_and_custom_resolution_emit_literal_registry_values() {
        let settings = CompatibilitySettings {
            retina_mode: true,
            resolution: Resolution::Custom,
            resolution_width: 2560,
            resolution_height: 1440,
            ..Default::default()
        };
        let operations = settings.registry_adds();
        assert_eq!(operations[0][5], "/d");
        assert_eq!(operations[0][6], "y");
        assert_eq!(operations[2][5], "/d");
        assert_eq!(operations[2][6], "2560x1440");
    }
}
