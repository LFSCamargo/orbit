use crate::{
    models::ThemeDefinition, services::artwork::decode_data_url, utils::paths::artwork_cache_dir,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use orbit_images::{optimize_theme, Slot, MAX_BYTES};
use std::{
    fs::File,
    io::Read,
    path::{Component, Path},
};

fn optimize_reference(
    value: Option<String>,
    slot: Slot,
    cache: &Path,
) -> Result<Option<String>, String> {
    let Some(value) = value else {
        return Ok(None);
    };
    if value.starts_with("orbit-bundled:") || value.starts_with("data:image/gif;base64,") {
        return Ok(Some(value));
    }
    let bytes = if value.starts_with("data:image/") {
        if value.len() > 8 * 1024 * 1024 {
            return Err("Theme image exceeds the supported size".into());
        }
        decode_data_url(&value).map(|data| data.0)
    } else {
        read_cache_image(Path::new(&value), cache)
    };
    let Some(bytes) = bytes else {
        return Ok(Some(value));
    };
    let image = optimize_theme(&bytes, slot).ok_or("Theme image is invalid or too large")?;
    let inline = format!(
        "data:{};base64,{}",
        image.mime,
        STANDARD.encode(image.bytes)
    );
    if inline.len() > 8 * 1024 * 1024 {
        return Err("Optimized theme image exceeds the supported size".into());
    }
    Ok(Some(inline))
}

fn read_cache_image(path: &Path, cache: &Path) -> Option<Vec<u8>> {
    if !path.is_absolute() || path.components().any(|part| part == Component::ParentDir) {
        return None;
    }
    let path = path.canonicalize().ok()?;
    if !path.starts_with(cache.canonicalize().ok()?) {
        return None;
    }
    let file = File::open(path).ok()?;
    let metadata = file.metadata().ok()?;
    if !metadata.is_file() || metadata.len() > MAX_BYTES as u64 {
        return None;
    }
    let mut bytes = Vec::new();
    file.take(MAX_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    (bytes.len() <= MAX_BYTES).then_some(bytes)
}

pub fn optimize_custom(mut theme: ThemeDefinition) -> Result<ThemeDefinition, String> {
    if !theme
        .id
        .starts_with(crate::services::theme_files::STUDIO_PREFIX)
        || !crate::services::theme_files::is_valid_theme_id(&theme.id)
    {
        return Err("Theme id must look like custom-my-theme".into());
    }
    if let Some(branding) = theme.branding.as_mut() {
        let cache = artwork_cache_dir();
        branding.logo_image = optimize_reference(branding.logo_image.take(), Slot::Logo, &cache)?;
        branding.wallpaper = optimize_reference(branding.wallpaper.take(), Slot::Hero, &cache)?;
    }
    Ok(theme)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn cache_artwork_is_embedded_and_external_paths_are_not_read() {
        let root = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&root).unwrap();
        let file = root.join("logo.png");
        image::RgbaImage::from_pixel(100, 50, image::Rgba([200, 50, 20, 128]))
            .save(&file)
            .unwrap();
        let encoded =
            optimize_reference(Some(file.to_string_lossy().into_owned()), Slot::Logo, &root)
                .unwrap()
                .unwrap();
        assert!(encoded.starts_with("data:image/png;base64,"));
        assert!(read_cache_image(&file, &root.join("other-cache")).is_none());
        let reference = "orbit-bundled:god-of-war:hero";
        assert_eq!(
            optimize_reference(Some(reference.into()), Slot::Hero, &root)
                .unwrap()
                .as_deref(),
            Some(reference)
        );
        fs::remove_dir_all(root).unwrap();
    }
}
