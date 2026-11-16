//! Import graphics components from a locally installed GameHub wine-engine into
//! Orbit's component store. Nothing is copied or redistributed: Orbit writes a
//! manifest whose `path` points at GameHub's own payload directory, read-only.
//! Users without GameHub simply get an empty import result and keep using the
//! online catalog.

use super::components::{self, InstalledComponent};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const MAX_COMPONENTS: usize = 128;

#[derive(Debug, Clone, Deserialize)]
struct ComponentsFile {
    #[serde(default)]
    components: Vec<ComponentEntry>,
}

#[derive(Debug, Clone, Deserialize)]
struct ComponentEntry {
    #[serde(default)]
    manifest: ComponentManifest,
    #[serde(default)]
    status: String,
    #[serde(default)]
    installed_path: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct ComponentManifest {
    #[serde(default)]
    name: String,
    #[serde(default)]
    version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedGamehubComponent {
    pub id: String,
    pub version: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GamehubImportReport {
    pub engine_available: bool,
    pub imported: Vec<ImportedGamehubComponent>,
    pub skipped: Vec<String>,
}

/// Map a GameHub component name to an Orbit component id. Names are the
/// stable identity in GameHub's own registry (`gptk-4.0-2`, `dxmt-v0.80`,
/// `vkd3d-proton-3.0.1`, `MoltenVK-gamesir-1.0`, `opengl-zink`).
fn orbit_component_id(name: &str) -> Option<&'static str> {
    let lower = name.to_ascii_lowercase();
    if lower.starts_with("gptk") {
        Some("gptk")
    } else if lower.starts_with("dxmt") {
        Some("dxmt")
    } else if lower.starts_with("vkd3d-proton") {
        Some("vkd3d-proton")
    } else if lower.contains("moltenvk") {
        Some("moltenvk")
    } else if lower.contains("zink") {
        Some("zink")
    } else {
        None
    }
}

/// Import every usable graphics component from the discovered GameHub engine.
pub fn import(root: &Path) -> Result<GamehubImportReport> {
    let Some(engine) = crate::services::gamehub_engine::GamehubEngine::discover() else {
        return Ok(GamehubImportReport {
            engine_available: false,
            imported: Vec::new(),
            skipped: Vec::new(),
        });
    };
    import_from(root, &engine.root.join("component/components.json"))
}

/// Testable core: the components registry path is explicit.
pub fn import_from(root: &Path, registry: &Path) -> Result<GamehubImportReport> {
    let bytes =
        std::fs::read(registry).with_context(|| format!("Cannot read {}", registry.display()))?;
    if bytes.len() as u64 > 8 * 1024 * 1024 {
        anyhow::bail!("{} is larger than Orbit will read", registry.display());
    }
    let file: ComponentsFile =
        serde_json::from_slice(&bytes).context("Cannot parse the GameHub component registry")?;
    let mut imported = Vec::new();
    let mut skipped = Vec::new();
    for entry in file.components.into_iter().take(MAX_COMPONENTS) {
        if entry.status != "installed" {
            continue;
        }
        let Some(installed) = entry.installed_path.filter(|path| !path.is_empty()) else {
            skipped.push(format!("{}: no installed path", entry.manifest.name));
            continue;
        };
        let payload = PathBuf::from(&installed);
        if !payload.is_dir() {
            skipped.push(format!(
                "{}: payload is missing ({installed})",
                entry.manifest.name
            ));
            continue;
        }
        let Some(id) = orbit_component_id(&entry.manifest.name) else {
            continue;
        };
        // The GameHub component name doubles as the Orbit version string: it is
        // unique per payload and recognisable in the Compatibility picker.
        let version = if entry.manifest.name.is_empty() {
            entry.manifest.version.clone()
        } else {
            entry.manifest.name.clone()
        };
        if version.is_empty() {
            skipped.push(format!("{id}: component has no version"));
            continue;
        }
        match components::register(root, id.to_string(), version.clone(), payload.clone()) {
            Ok(component) => imported.push(ImportedGamehubComponent {
                id: component.id,
                version: component.version,
                path: component.path,
            }),
            Err(error) => skipped.push(format!(
                "{}: {error:#}",
                payload.file_name().unwrap_or_default().to_string_lossy()
            )),
        }
    }
    Ok(GamehubImportReport {
        engine_available: true,
        imported,
        skipped,
    })
}

/// The components GameHub's engine currently lends to Orbit, for status views.
pub fn imported_components(root: &Path) -> Vec<InstalledComponent> {
    components::installed_components(root)
        .into_iter()
        .filter(|component| {
            component.version.starts_with("gptk-")
                || component.version.starts_with("dxmt-")
                || component.version.starts_with("vkd3d-proton-")
                || component.version.contains("MoltenVK")
                || component.version.contains("zink")
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn fixture(root: &Path) -> PathBuf {
        // A miniature GameHub engine: one component per supported family with
        // the exact payload layouts observed on disk.
        let downloads = root.join("engine/downloads");
        let gptk = downloads.join("gptk-4.0-2");
        fs::create_dir_all(gptk.join("wine/x86_64-windows")).unwrap();
        fs::create_dir_all(gptk.join("wine/x86_64-unix")).unwrap();
        fs::create_dir_all(gptk.join("external/D3DMetal.framework")).unwrap();
        for name in ["d3d11", "dxgi", "d3d12"] {
            fs::write(gptk.join(format!("wine/x86_64-windows/{name}.dll")), b"PE").unwrap();
            fs::write(gptk.join(format!("wine/x86_64-unix/{name}.so")), b"bridge").unwrap();
        }
        fs::write(gptk.join("external/libd3dshared.dylib"), b"shared").unwrap();

        let dxmt = downloads.join("dxmt-v0.80");
        fs::create_dir_all(dxmt.join("wine/x86_64-windows")).unwrap();
        fs::create_dir_all(dxmt.join("wine/x86_64-unix")).unwrap();
        fs::write(dxmt.join("wine/x86_64-windows/d3d11.dll"), b"PE").unwrap();
        fs::write(dxmt.join("wine/x86_64-windows/winemetal.dll"), b"PE").unwrap();
        fs::write(dxmt.join("wine/x86_64-unix/winemetal.so"), b"bridge").unwrap();

        let vkd3d = downloads.join("vkd3d-proton-3.0.1");
        fs::create_dir_all(vkd3d.join("wine/x86_64-windows")).unwrap();
        fs::create_dir_all(vkd3d.join("wine/i386-windows")).unwrap();
        for name in ["d3d12.dll", "d3d12core.dll"] {
            fs::write(vkd3d.join(format!("wine/x86_64-windows/{name}")), b"PE").unwrap();
        }
        fs::write(vkd3d.join("wine/i386-windows/d3d12.dll"), b"PE32").unwrap();

        let zink = downloads.join("opengl-zink");
        fs::create_dir_all(zink.join("external/lib")).unwrap();
        fs::write(zink.join("external/lib/libwine_mesa_zink.dylib"), b"zink").unwrap();
        fs::write(zink.join("external/lib/libvulkan.1.dylib"), b"vulkan").unwrap();

        let moltenvk = downloads.join("MoltenVK-gamesir-1.0");
        fs::create_dir_all(moltenvk.join("external")).unwrap();
        fs::write(moltenvk.join("external/libMoltenVK.dylib"), b"mvk").unwrap();

        let registry = root.join("engine/component");
        fs::create_dir_all(&registry).unwrap();
        let components = serde_json::json!({
            "components": [
                {"manifest": {"name": "gptk-4.0-2", "version": "1.0.0"}, "status": "installed",
                 "installed_path": gptk.to_string_lossy()},
                {"manifest": {"name": "dxmt-v0.80", "version": "1.0.6"}, "status": "installed",
                 "installed_path": dxmt.to_string_lossy()},
                {"manifest": {"name": "vkd3d-proton-3.0.1", "version": "1.0.0"}, "status": "installed",
                 "installed_path": vkd3d.to_string_lossy()},
                {"manifest": {"name": "opengl-zink", "version": "1.0.0"}, "status": "installed",
                 "installed_path": zink.to_string_lossy()},
                {"manifest": {"name": "MoltenVK-gamesir-1.0", "version": "1.0.1"}, "status": "installed",
                 "installed_path": moltenvk.to_string_lossy()},
                {"manifest": {"name": "steam_agent", "version": "1"}, "status": "installed",
                 "installed_path": downloads.join("steam_agent").to_string_lossy()},
                {"manifest": {"name": "gptk-3.0-3", "version": "1.0.3"}, "status": "failed",
                 "installed_path": downloads.join("gptk-3.0-3").to_string_lossy()},
                {"manifest": {"name": "dxmt-v0.70", "version": "1.0.0"}, "status": "installed",
                 "installed_path": downloads.join("dxmt-missing").to_string_lossy()}
            ]
        });
        let path = registry.join("components.json");
        fs::write(&path, serde_json::to_vec(&components).unwrap()).unwrap();
        path
    }

    #[test]
    fn imports_every_supported_family_and_skips_the_rest() {
        let root = std::env::temp_dir().join(format!("orbit-gh-import-{}", uuid::Uuid::new_v4()));
        let registry = fixture(&root);
        let store = root.join("runtimes");
        let report = import_from(&store, &registry).unwrap();
        assert!(report.engine_available);
        let ids: Vec<&str> = report.imported.iter().map(|c| c.id.as_str()).collect();
        assert_eq!(
            ids,
            vec!["gptk", "dxmt", "vkd3d-proton", "zink", "moltenvk"],
            "steam_agent is not an Orbit component and failed/missing entries are skipped"
        );
        assert!(report
            .skipped
            .iter()
            .any(|reason| reason.contains("dxmt-missing")));

        let installed = components::installed_components(&store);
        let gptk = installed.iter().find(|c| c.id == "gptk").unwrap();
        assert_eq!(gptk.version, "gptk-4.0-2");
        assert!(Path::new(&gptk.path)
            .join("wine/x86_64-windows/d3d11.dll")
            .is_file());
        let dxmt = installed.iter().find(|c| c.id == "dxmt").unwrap();
        assert!(
            Path::new(&dxmt.path)
                .join("x86_64-windows/d3d11.dll")
                .is_file(),
            "dxmt payload resolves to the directory holding the arch trees"
        );
        let vkd3d = installed.iter().find(|c| c.id == "vkd3d-proton").unwrap();
        assert!(Path::new(&vkd3d.path)
            .join("x86_64-windows/d3d12.dll")
            .is_file());
        let zink = installed.iter().find(|c| c.id == "zink").unwrap();
        assert!(Path::new(&zink.path)
            .join("libwine_mesa_zink.dylib")
            .is_file());

        // Imported components are selectable and resolve like downloaded ones.
        let paths = super::super::selections::resolve(
            &store,
            &super::super::selections::ActiveComponents::new(),
        );
        assert!(paths.contains_key("gptk"));
        assert!(paths.contains_key("dxmt"));
        assert!(paths.contains_key("vkd3d-proton"));
        assert!(paths.contains_key("zink"));
        assert!(paths.contains_key("moltenvk"));

        // Idempotent: a second import replaces manifests without error.
        let again = import_from(&store, &registry).unwrap();
        assert_eq!(again.imported.len(), report.imported.len());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn maps_gamehub_names_to_orbit_ids() {
        assert_eq!(orbit_component_id("gptk-4.0-2"), Some("gptk"));
        assert_eq!(orbit_component_id("dxmt-v0.80-arm64"), Some("dxmt"));
        assert_eq!(
            orbit_component_id("vkd3d-proton-3.0.1"),
            Some("vkd3d-proton")
        );
        assert_eq!(
            orbit_component_id("MoltenVK.1.4.2-USE_METAL_PRIVATE_API"),
            Some("moltenvk")
        );
        assert_eq!(orbit_component_id("opengl-zink"), Some("zink"));
        assert_eq!(orbit_component_id("steam_agent"), None);
        assert_eq!(orbit_component_id("Cross86"), None);
    }
}
