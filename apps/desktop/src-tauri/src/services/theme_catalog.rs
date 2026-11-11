use crate::{
    models::ThemeDefinition,
    services::{artwork::decode_data_url, theme_files, theme_previews::ThemePreview},
};
use orbit_images::{optimize_theme, Renderer, Slot};
use serde::Serialize;
use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
};

#[derive(Serialize)]
pub struct CatalogTheme {
    #[serde(flatten)]
    pub theme: ThemeDefinition,
    pub preview: ThemePreview,
}

/// Parsing, decoding, cache writes, and serialization of image-free metadata stay off the UI thread.
pub async fn load_catalog(dir: PathBuf, cache: PathBuf) -> Result<Vec<CatalogTheme>, String> {
    tauri::async_runtime::spawn_blocking(move || catalog(&dir, &cache))
        .await
        .map_err(|_| "Theme catalog loading stopped".to_string())?
}

fn catalog(dir: &Path, cache: &Path) -> Result<Vec<CatalogTheme>, String> {
    let themes = theme_files::list_themes(dir)?;
    fs::create_dir_all(cache).map_err(|err| err.to_string())?;
    if fs::symlink_metadata(cache)
        .map_err(|err| err.to_string())?
        .file_type()
        .is_symlink()
    {
        return Err("Theme artwork cache must not be a symlink".into());
    }
    let cache = cache.canonicalize().map_err(|err| err.to_string())?;
    let mut renderer = None;
    Ok(themes
        .into_iter()
        .map(|mut theme| {
            let mut preview = ThemePreview {
                theme_id: theme.id.clone(),
                logo: None,
                hero: None,
            };
            if let Some(branding) = theme.branding.as_mut() {
                let (full, small) = materialize(
                    branding.logo_image.take(),
                    Slot::Logo,
                    &cache,
                    &mut renderer,
                );
                branding.logo_image = full;
                preview.logo = small;
                let (full, small) =
                    materialize(branding.wallpaper.take(), Slot::Hero, &cache, &mut renderer);
                branding.wallpaper = full;
                preview.hero = small;
            }
            CatalogTheme { theme, preview }
        })
        .collect())
}

fn cached_file(cache: &Path, name: &str) -> Option<String> {
    let path = cache.join(name);
    let meta = fs::symlink_metadata(&path).ok()?;
    if !meta.is_file() || meta.len() == 0 || meta.len() > orbit_images::MAX_BYTES as u64 {
        return None;
    }
    let path = path.canonicalize().ok()?;
    path.starts_with(cache)
        .then(|| path.to_string_lossy().into_owned())
}

fn write_image(cache: &Path, name: &str, bytes: &[u8]) -> Option<String> {
    let target = cache.join(name);
    if fs::symlink_metadata(&target).is_ok_and(|meta| meta.file_type().is_symlink()) {
        return None;
    }
    let temp = cache.join(format!("{}.tmp", uuid::Uuid::new_v4()));
    fs::write(&temp, bytes).ok()?;
    if fs::rename(&temp, &target).is_err() {
        let _ = fs::remove_file(temp);
        return None;
    }
    cached_file(cache, name)
}

fn materialize(
    value: Option<String>,
    slot: Slot,
    cache: &Path,
    renderer: &mut Option<Renderer>,
) -> (Option<String>, Option<String>) {
    let Some(value) = value else {
        return (None, None);
    };
    if value.starts_with("orbit-bundled:") {
        return (Some(value.clone()), Some(value));
    }
    // Fixed slots and bounded bytes: O(image bytes + pixels) on a cold cache, no decode on a warm cache.
    let mut hash = DefaultHasher::new();
    value.hash(&mut hash);
    let (name, extension) = if matches!(slot, Slot::Logo) {
        ("logo", "png")
    } else {
        ("hero", "jpg")
    };
    let key = format!("v1-{:x}-{name}", hash.finish());
    let preview_name = format!("{key}-preview.{extension}");
    let full = ["png", "jpg", "webp", "gif"]
        .into_iter()
        .find_map(|ext| cached_file(cache, &format!("{key}.{ext}")));
    let preview = cached_file(cache, &preview_name);
    if full.is_some() && (preview.is_some() || value.starts_with("data:image/gif;base64,")) {
        return (full, preview);
    }
    let Some((bytes, mime)) = decode_data_url(&value) else {
        return (None, None);
    };
    // Preserve legacy animated originals without making the thumbnail grid decode their frames.
    if mime == "image/gif" {
        if bytes.len() < 13 || (!bytes.starts_with(b"GIF89a") && !bytes.starts_with(b"GIF87a")) {
            return (None, None);
        }
        let width = u16::from_le_bytes([bytes[6], bytes[7]]) as u32;
        let height = u16::from_le_bytes([bytes[8], bytes[9]]) as u32;
        if width == 0
            || height == 0
            || width > 16384
            || height > 16384
            || width * height > 24 * 1024 * 1024
        {
            return (None, None);
        }
        return (write_image(cache, &format!("{key}.gif"), &bytes), None);
    }
    let Some(image) = optimize_theme(&bytes, slot) else {
        return (None, None);
    };
    let full_extension = match image.mime {
        "image/png" => "png",
        "image/webp" => "webp",
        _ => "jpg",
    };
    let full = write_image(cache, &format!("{key}.{full_extension}"), &image.bytes);
    let preview = renderer
        .get_or_insert_with(Renderer::new)
        .prepare(&image.bytes, slot)
        .and_then(|(bytes, _)| write_image(cache, &preview_name, &bytes));
    (full, preview)
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use std::{fs, io::Cursor};

    #[tokio::test]
    async fn catalog_keeps_image_blobs_out_of_ipc_and_reuses_cached_previews() {
        let root = std::env::temp_dir().join(format!("orbit-catalog-{}", uuid::Uuid::new_v4()));
        let dir = root.join("themes");
        let cache = root.join("cache");
        fs::create_dir_all(&dir).unwrap();
        let mut bytes = Cursor::new(Vec::new());
        image::RgbaImage::from_fn(1200, 600, |x, y| {
            image::Rgba([(x % 255) as u8, (y % 255) as u8, ((x * y) % 255) as u8, 128])
        })
        .write_to(&mut bytes, image::ImageFormat::Png)
        .unwrap();
        let data = format!(
            "data:image/png;base64,{}",
            STANDARD.encode(bytes.into_inner())
        );
        let json = serde_json::json!({
            "id":"custom-large", "name":"Large", "kind":"custom",
            "colors": {"canvas":"0 0 0","surface":"0 0 0","panel":"0 0 0",
                "foreground":"255 255 255","muted":"1 1 1","accent":"2 2 2",
                "focus":"3 3 3","border":"4 4 4"},
            "branding":{"logoImage":data,"wallpaper":data}
        })
        .to_string();
        assert!(
            json.len() > 4096,
            "Fixture must reproduce an artwork-heavy IPC payload"
        );
        let file = dir.join("custom-large.json");
        fs::write(&file, &json).unwrap();
        let first = load_catalog(dir.clone(), cache.clone()).await.unwrap();
        assert_eq!(first.len(), 1);
        assert!(serde_json::to_vec(&first).unwrap().len() < 4096);
        let branding = first[0].theme.branding.as_ref().unwrap();
        assert!(!branding.logo_image.as_ref().unwrap().starts_with("data:"));
        let logo = image::open(branding.logo_image.as_ref().unwrap())
            .unwrap()
            .to_rgba8();
        assert!(logo.width() <= 1024 && logo.height() <= 512);
        assert!(logo.pixels().any(|pixel| pixel[3] < 255));
        let hero = first[0].preview.hero.as_ref().unwrap();
        assert_eq!(image::image_dimensions(hero).unwrap(), (640, 320));
        let modified = fs::metadata(hero).unwrap().modified().unwrap();
        let second = load_catalog(dir, cache).await.unwrap();
        assert_eq!(second[0].preview.hero.as_ref(), Some(hero));
        assert_eq!(fs::metadata(hero).unwrap().modified().unwrap(), modified);
        assert_eq!(
            fs::read_to_string(file).unwrap(),
            json,
            "Portable originals must stay intact"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn invalid_inline_artwork_is_dropped_instead_of_forwarded_to_the_webview() {
        let root = std::env::temp_dir().join(format!("orbit-catalog-bad-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let json = r#"{"id":"custom-bad","name":"Bad","colors":{"canvas":"0 0 0","surface":"0 0 0","panel":"0 0 0","foreground":"255 255 255","muted":"1 1 1","accent":"2 2 2","focus":"3 3 3","border":"4 4 4"},"branding":{"logoImage":"data:image/png;base64,aW52YWxpZA==","wallpaper":"orbit-bundled:god-of-war:hero"}}"#;
        fs::write(root.join("custom-bad.json"), json).unwrap();
        let catalog = load_catalog(root.clone(), root.join("cache"))
            .await
            .unwrap();
        let branding = catalog[0].theme.branding.as_ref().unwrap();
        assert!(branding.logo_image.is_none());
        assert_eq!(
            branding.wallpaper.as_deref(),
            Some("orbit-bundled:god-of-war:hero")
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn legacy_gifs_keep_their_animation_but_do_not_load_into_thumbnail_grids() {
        let cache = std::env::temp_dir().join(format!("orbit-gif-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&cache).unwrap();
        let cache = cache.canonicalize().unwrap();
        let data = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        let (full, preview) = materialize(Some(data.into()), Slot::Logo, &cache, &mut None);
        assert!(preview.is_none());
        assert_eq!(
            fs::read(full.unwrap()).unwrap(),
            decode_data_url(data).unwrap().0
        );
        fs::remove_dir_all(cache).unwrap();
    }
}
