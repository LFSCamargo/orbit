//! A private Wine layout whose builtin graphics DLLs precede Wine's defaults.
//! WINEDLLPATH is appended after Wine's own DLL directory and cannot replace them.
use anyhow::{bail, Context, Result};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
};

fn directory(path: &Path) -> Result<()> {
    if path
        .symlink_metadata()
        .is_ok_and(|m| m.file_type().is_symlink())
    {
        bail!("Runtime layer directory cannot be a symlink");
    }
    fs::create_dir_all(path)?;
    Ok(())
}
#[cfg(unix)]
fn link(source: &Path, target: &Path) -> Result<()> {
    std::os::unix::fs::symlink(source.canonicalize()?, target)?;
    Ok(())
}
#[cfg(not(unix))]
fn link(source: &Path, target: &Path) -> Result<()> {
    fs::copy(source, target)?;
    Ok(())
}

/// O(F), capped directory listings; no recursive traversal or changes to the original runtime.
pub fn prepare(wine: &Path, graphics: &Path, root: &Path) -> Result<PathBuf> {
    let wine = wine.canonicalize()?;
    let base = wine
        .parent()
        .and_then(Path::parent)
        .context("Invalid Wine distribution layout")?;
    let graphics = graphics.canonicalize()?;
    let mut hasher = Sha256::new();
    hasher.update(b"orbit-graphics-layer-v1");
    for path in [
        base,
        graphics.as_path(),
        &graphics.join("x86_64-windows/d3d11.dll"),
    ] {
        hasher.update(path.as_os_str().as_encoded_bytes());
        let metadata = fs::metadata(path)?;
        hasher.update(metadata.len().to_le_bytes());
        hasher.update(
            metadata
                .modified()?
                .duration_since(std::time::UNIX_EPOCH)?
                .as_nanos()
                .to_le_bytes(),
        );
    }
    let key = format!("{:x}", hasher.finalize());
    directory(root)?;
    let destination = root.join(key);
    if destination
        .symlink_metadata()
        .is_ok_and(|m| m.file_type().is_symlink())
    {
        bail!("Runtime layer cannot be a symlink");
    }
    let output = destination
        .join("wine/bin")
        .join(wine.file_name().context("Missing Wine filename")?);
    if destination.join("ready").is_file() && output.is_file() {
        return Ok(output);
    }
    if destination.exists() {
        fs::remove_dir_all(&destination)?;
    }
    let runtime = destination.join("wine");
    directory(&runtime)?;
    for rel in [
        "bin",
        "lib",
        "share",
        "lib/wine",
        "lib/wine/x86_64-unix",
        "lib/wine/x86_64-windows",
        "lib/wine/i386-windows",
    ] {
        let source = base.join(rel);
        if !source.is_dir() {
            continue;
        }
        let target = runtime.join(rel);
        directory(&target)?;
        for (index, item) in fs::read_dir(source)?.enumerate() {
            if index >= 4096 {
                bail!("Wine distribution contains too many files");
            }
            let item = item?;
            let path = item.path();
            let name = item.file_name();
            if (rel == "lib" && name == "wine")
                || (rel == "lib/wine"
                    && ["x86_64-unix", "x86_64-windows", "i386-windows"]
                        .iter()
                        .any(|arch| name == *arch))
            {
                continue;
            }
            let to = target.join(&name);
            // Unix libraries link ntdll/win32u via @rpath. Symlinking them would
            // load a second copy from the base distribution and corrupt state.
            if (rel == "bin"
                && matches!(
                    name.to_str(),
                    Some("wine" | "wine64" | "wine-preloader" | "wine64-preloader" | "wineserver")
                ))
                || (rel == "lib/wine/x86_64-unix" && path.is_file())
            {
                fs::copy(path, to)?;
            } else {
                link(&path, &to)?;
            }
        }
    }
    for arch in ["x86_64-windows", "x86_64-unix"] {
        let source = graphics.join(arch);
        if !source.is_dir() {
            continue;
        }
        let target = runtime.join("lib/wine").join(arch);
        directory(&target)?;
        for (index, item) in fs::read_dir(source)?.enumerate() {
            if index >= 64 {
                bail!("Graphics payload contains too many libraries");
            }
            let item = item?;
            if !item.path().is_file() {
                continue;
            }
            let target = target.join(item.file_name());
            if target.symlink_metadata().is_ok() {
                fs::remove_file(&target)?;
            }
            link(&item.path(), &target)?;
        }
    }
    // FOSS WineCX engines use @loader_path/../../ for their shared dependencies.
    if let Some(parent) = base.parent() {
        for item in fs::read_dir(parent)?.take(128) {
            let item = item?;
            if item
                .path()
                .extension()
                .is_some_and(|extension| extension == "dylib")
                && item.path().is_file()
            {
                link(&item.path(), &destination.join(item.file_name()))?;
            }
        }
    }
    fs::write(destination.join("ready"), b"1")?;
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn selected_builtins_replace_defaults_without_mutating_the_distribution() {
        let root = std::env::temp_dir().join(format!("orbit-layer-{}", uuid::Uuid::new_v4()));
        let base = root.join("base");
        let graphics = root.join("graphics");
        for dir in [
            base.join("bin"),
            base.join("lib/wine/x86_64-unix"),
            base.join("lib/wine/x86_64-windows"),
            graphics.join("x86_64-windows"),
        ] {
            fs::create_dir_all(dir).unwrap();
        }
        fs::write(base.join("bin/wine"), b"loader").unwrap();
        fs::write(base.join("bin/wineserver"), b"server").unwrap();
        fs::write(base.join("lib/wine/x86_64-unix/ntdll.so"), b"unix").unwrap();
        fs::write(base.join("lib/wine/x86_64-windows/d3d11.dll"), b"default").unwrap();
        fs::write(graphics.join("x86_64-windows/d3d11.dll"), b"selected").unwrap();
        let layer = prepare(&base.join("bin/wine"), &graphics, &root.join("layers")).unwrap();
        let layered = layer.parent().unwrap().parent().unwrap();
        assert_eq!(
            fs::read(layered.join("lib/wine/x86_64-windows/d3d11.dll")).unwrap(),
            b"selected"
        );
        assert_eq!(
            fs::read(base.join("lib/wine/x86_64-windows/d3d11.dll")).unwrap(),
            b"default"
        );
        assert!(!layered
            .join("lib/wine/x86_64-unix/ntdll.so")
            .symlink_metadata()
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(
            prepare(&base.join("bin/wine"), &graphics, &root.join("layers")).unwrap(),
            layer
        );
        fs::remove_dir_all(root).unwrap();
    }
}
