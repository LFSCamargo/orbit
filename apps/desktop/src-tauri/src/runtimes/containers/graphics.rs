//! Copy graphics PE files into the container system32. Unix bridges stay on
//! WINEDLLPATH so Apple's GPTK layout is not flattened.
use anyhow::{Context, Result};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

use crate::runtimes::settings::GraphicsBackend;

#[derive(Default)]
pub struct GraphicsLinks {
    pub overrides: String,
    pub dll_path: Option<String>,
    pub env: BTreeMap<String, String>,
}

pub fn apply(
    prefix: &Path,
    backend: GraphicsBackend,
    selections: &BTreeMap<String, String>,
) -> Result<GraphicsLinks> {
    match backend {
        GraphicsBackend::Dxvk => {
            link_dlls(
                prefix,
                &selected(selections, "dxvk")?,
                &["d3d11.dll", "d3d10core.dll", "dxgi.dll"],
                &[("x64", "x32"), ("x86_64-windows", "i386-windows")],
            )?;
            Ok(GraphicsLinks {
                overrides: "d3d11=n;dxgi=n;d3d10core=n".into(),
                ..Default::default()
            })
        }
        GraphicsBackend::Dxmt => {
            let source = selected(selections, "dxmt")?;
            if source.join("x86_64-windows/d3d11.dll").is_file() {
                link_named(
                    prefix,
                    &source.join("x86_64-windows/winemetal.dll"),
                    "winemetal.dll",
                )?;
                return Ok(GraphicsLinks {
                    overrides: "d3d11=b;dxgi=b;d3d10core=b;winemetal=b".into(),
                    dll_path: Some(source.to_string_lossy().into_owned()),
                    env: ahead_of_wine_builtins(&source),
                });
            }
            link_dlls(
                prefix,
                &source,
                &["d3d11.dll", "dxgi.dll"],
                &[("x64", "x32")],
            )?;
            Ok(GraphicsLinks {
                overrides: "d3d11=n;dxgi=n".into(),
                ..Default::default()
            })
        }
        GraphicsBackend::D3dmetal => {
            let payload = selected(selections, "gptk")?;
            let libraries = [
                payload.join("redist/lib/wine"),
                payload.join("lib/wine"),
                payload.join("wine"),
            ]
            .into_iter()
            .find(|path| path.join("x86_64-windows/d3d11.dll").is_file())
            .context("The Game Porting Toolkit has no D3DMetal libraries. Reimport the evaluation environment")?;
            for name in ["d3d11", "dxgi", "d3d12", "d3d12core", "d3d10"] {
                let source = libraries.join(format!("x86_64-windows/{name}.dll"));
                if source.is_file() {
                    link_named(prefix, &source, &format!("{name}.dll"))?;
                }
            }
            let mut env = crate::runtimes::wine::gptk_bridge_env(&payload, &libraries);
            env.extend(ahead_of_wine_builtins(&libraries));
            Ok(GraphicsLinks {
                overrides: "d3d11=b;d3d10=b;d3d12=b;d3d12core=b;dxgi=b".into(),
                dll_path: Some(libraries.to_string_lossy().into_owned()),
                env,
            })
        }
        GraphicsBackend::Auto | GraphicsBackend::Wine => Ok(GraphicsLinks::default()),
    }
}

/// Builtin translation DLLs must be found before Wine's own `dxgi`/`d3d1x`, or
/// the game silently runs on wined3d. WINEDLLPATH is searched after Wine's
/// builtins; Orbit Wine searches this variable first (scripts/wine/patches).
fn ahead_of_wine_builtins(libraries: &Path) -> BTreeMap<String, String> {
    BTreeMap::from([(
        "WINEDLLPATH_PREPEND".into(),
        libraries.to_string_lossy().into_owned(),
    )])
}

fn selected(selections: &BTreeMap<String, String>, id: &str) -> Result<PathBuf> {
    selections.get(id).map(PathBuf::from).with_context(|| {
        format!(
            "The {id} component is not installed. Install it from Compatibility components first"
        )
    })
}

fn link_dlls(
    prefix: &Path,
    source_dir: &Path,
    dlls: &[&str],
    layouts: &[(&str, &str)],
) -> Result<()> {
    let system32 = prefix.join("drive_c/windows/system32");
    let syswow64 = prefix.join("drive_c/windows/syswow64");
    let mut linked = 0usize;
    for dll in dlls {
        for (wide, narrow) in layouts {
            for (architecture, destination) in [(wide, &system32), (narrow, &syswow64)] {
                let source = source_dir.join(format!("{architecture}/{dll}"));
                if source.is_file() {
                    place(destination, &source, dll)?;
                    linked += 1;
                }
            }
        }
    }
    if linked == 0 {
        anyhow::bail!(
            "The component at {} has no DLLs to install. Reinstall it or choose another version",
            source_dir.display()
        );
    }
    Ok(())
}

fn link_named(prefix: &Path, source: &Path, name: &str) -> Result<()> {
    if !source.is_file() {
        return Ok(());
    }
    place(&prefix.join("drive_c/windows/system32"), source, name)
}

/// A copy, never a symlink: Wine rewrites system32 when it updates a prefix,
/// and a link would let it overwrite the shared component (it replaced GPTK's
/// DLLs with Wine stubs). APFS clones the copy, so it costs no space.
fn place(destination: &Path, source: &Path, name: &str) -> Result<()> {
    fs::create_dir_all(destination)?;
    let target = destination.join(name);
    if target.symlink_metadata().is_ok() {
        fs::remove_file(&target)?;
    }
    fs::copy(source, &target)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn links_d3dmetal_pe_files_and_keeps_the_unix_bridge_path() {
        let root = std::env::temp_dir().join(format!("orbit-gfx-{}", uuid::Uuid::new_v4()));
        let payload = root.join("gptk");
        let libraries = payload.join("redist/lib/wine");
        fs::create_dir_all(libraries.join("x86_64-windows")).unwrap();
        fs::create_dir_all(libraries.join("x86_64-unix")).unwrap();
        for name in ["d3d11", "dxgi", "d3d12"] {
            fs::write(libraries.join(format!("x86_64-windows/{name}.dll")), b"PE").unwrap();
            fs::write(libraries.join(format!("x86_64-unix/{name}.so")), b"so").unwrap();
        }
        // Regression: containers never exported Apple's redist/lib/external
        // bridge, so CrossOver-class Wine ran D3DMetal without it.
        let shared = payload.join("redist/lib/external/libd3dshared.dylib");
        fs::create_dir_all(shared.parent().unwrap()).unwrap();
        fs::write(&shared, b"dylib").unwrap();
        let framework = payload.join("redist/lib/external/D3DMetal.framework/D3DMetal");
        fs::create_dir_all(framework.parent().unwrap()).unwrap();
        fs::write(&framework, b"metal").unwrap();
        let prefix = root.join("prefix");
        let links = apply(
            &prefix,
            GraphicsBackend::D3dmetal,
            &BTreeMap::from([("gptk".into(), payload.to_string_lossy().into_owned())]),
        )
        .unwrap();
        let installed = prefix.join("drive_c/windows/system32/d3d11.dll");
        assert!(installed.is_file());
        assert!(!installed
            .symlink_metadata()
            .unwrap()
            .file_type()
            .is_symlink());
        // Regression: Wine's prefix update wrote its stubs through a symlink
        // into the GPTK component.
        fs::write(&installed, b"wine stub").unwrap();
        assert_eq!(
            fs::read(libraries.join("x86_64-windows/d3d11.dll")).unwrap(),
            b"PE"
        );
        assert_eq!(
            links.dll_path.as_deref(),
            Some(libraries.to_string_lossy().as_ref())
        );
        assert_eq!(
            links
                .env
                .get("CX_APPLEGPTK_LIBD3DSHARED_PATH")
                .map(String::as_str),
            shared.to_str()
        );
        assert_eq!(
            links.env.get("D3DMETAL_FRAMEWORK_PATH").map(String::as_str),
            framework.to_str()
        );
        // Regression: Wine's own builtins won, so RE2 ran on wined3d.
        assert_eq!(
            links.env.get("WINEDLLPATH_PREPEND").map(String::as_str),
            libraries.to_str()
        );
        let _ = fs::remove_dir_all(root);
    }
}
