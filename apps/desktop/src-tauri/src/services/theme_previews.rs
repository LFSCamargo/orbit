use orbit_images::{Renderer, Slot, MAX_BYTES};
use serde::Serialize;
use std::{
    collections::hash_map::DefaultHasher,
    fs::{self, File},
    hash::{Hash, Hasher},
    io::Read,
    path::{Component, Path, PathBuf},
    sync::{Mutex, OnceLock},
};

pub const THEMES: [&str; 8] = [
    "devil-may-cry-5",
    "god-of-war",
    "cyberpunk-2077",
    "zelda-ocarina-of-time",
    "gta-v",
    "gta-vi",
    "zelda-breath-of-the-wild",
    "super-mario",
];

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemePreview {
    pub theme_id: String,
    pub logo: Option<String>,
    pub hero: Option<String>,
}

pub fn prepare(root: &Path, cache: &Path, mut emit: impl FnMut(ThemePreview) -> bool) {
    for id in THEMES {
        let logo = prepare_slot(root, cache, id, "logo")
            .map(|value| value.0.to_string_lossy().into_owned());
        let hero = prepare_slot(root, cache, id, "hero")
            .map(|value| value.0.to_string_lossy().into_owned());
        if !emit(ThemePreview {
            theme_id: id.into(),
            logo,
            hero,
        }) {
            break;
        }
    }
}

fn source_path(root: &Path, id: &str, slot: &str) -> Option<PathBuf> {
    if !THEMES.contains(&id) || !matches!(slot, "logo" | "hero") {
        return None;
    }
    let root = root.canonicalize().ok()?;
    for extension in ["webp", "png", "jpg"] {
        let candidate = root.join(id).join(format!("{slot}.{extension}"));
        if candidate
            .components()
            .any(|part| part == Component::ParentDir)
        {
            return None;
        }
        if let Ok(path) = candidate.canonicalize() {
            if path.starts_with(&root) && path.is_file() {
                return Some(path);
            }
        }
    }
    None
}

pub fn prepare_slot(root: &Path, cache: &Path, id: &str, slot: &str) -> Option<(PathBuf, String)> {
    let source = source_path(root, id, slot)?;
    // Packaged previews are already GPU-prepared and encoded. Avoid native decoding
    // or GPU initialization entirely when the shipped thumbnail is available.
    let bundled = root.join(id).join(format!("preview-{slot}.webp"));
    if let Ok(preview) = bundled.canonicalize() {
        if preview.starts_with(root.canonicalize().ok()?)
            && fs::metadata(&preview)
                .is_ok_and(|meta| meta.is_file() && meta.len() <= 2 * 1024 * 1024)
        {
            return Some((preview, "bundle".into()));
        }
    }
    let metadata = fs::metadata(&source).ok()?;
    if metadata.len() > MAX_BYTES as u64 {
        return None;
    }
    let mut revision = DefaultHasher::new();
    metadata.len().hash(&mut revision);
    metadata.modified().ok()?.hash(&mut revision);
    let extension = if slot == "logo" { "png" } else { "jpg" };
    fs::create_dir_all(cache).ok()?;
    let cache = cache.canonicalize().ok()?;
    let target = cache.join(format!(
        "v1-{id}-{slot}-{:x}.{extension}",
        revision.finish()
    ));
    // Never follow a cache symlink to an arbitrary file.
    if fs::symlink_metadata(&target).is_ok_and(|meta| meta.file_type().is_symlink()) {
        return None;
    }
    if target.is_file() {
        return Some((target, "cache".into()));
    }
    let mut bytes = Vec::new();
    File::open(source)
        .ok()?
        .take(MAX_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    let slot = if slot == "logo" {
        Slot::Logo
    } else {
        Slot::Hero
    };
    static RENDERER: OnceLock<Mutex<Renderer>> = OnceLock::new();
    let mut renderer = RENDERER
        .get_or_init(|| Mutex::new(Renderer::new()))
        .lock()
        .ok()?;
    let (output, backend) = renderer.prepare(&bytes, slot)?;
    drop(renderer);
    let temporary = cache.join(format!("{}.tmp", uuid::Uuid::new_v4()));
    fs::write(&temporary, output).ok()?;
    if fs::rename(&temporary, &target).is_err() {
        let _ = fs::remove_file(&temporary);
        return None;
    }
    Some((target, backend))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn packaged_previews_skip_source_decode_and_cache_generation() {
        let root =
            std::env::temp_dir().join(format!("orbit-packaged-preview-{}", uuid::Uuid::new_v4()));
        let theme = root.join("god-of-war");
        fs::create_dir_all(&theme).unwrap();
        fs::write(
            theme.join("hero.webp"),
            b"source need not be decoded for a packaged preview",
        )
        .unwrap();
        let preview = theme.join("preview-hero.webp");
        image::RgbaImage::from_pixel(640, 320, image::Rgba([70, 150, 200, 255]))
            .save(&preview)
            .unwrap();
        let cache = root.join("cache");
        let (path, backend) = prepare_slot(&root, &cache, "god-of-war", "hero").unwrap();
        assert_eq!(path, preview.canonicalize().unwrap());
        assert_eq!(backend, "bundle");
        assert!(!cache.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn bundled_artwork_has_compact_previews_and_a_fast_cache_path() {
        let sources = Path::new(env!("CARGO_MANIFEST_DIR")).join("assets/bundled-themes");
        let cache =
            std::env::temp_dir().join(format!("orbit-image-benchmark-{}", uuid::Uuid::new_v4()));
        let start = std::time::Instant::now();
        let mut bytes = 0;
        let mut count = 0;
        prepare(&sources, &cache, |preview| {
            for (file, hero) in [(preview.logo, false), (preview.hero, true)] {
                let file = file.unwrap_or_else(|| {
                    panic!(
                        "{} {} failed to prepare",
                        preview.theme_id,
                        if hero { "hero" } else { "logo" }
                    )
                });
                let dimensions = image::image_dimensions(&file).unwrap();
                if hero {
                    assert_eq!(dimensions, (640, 320));
                } else {
                    assert!(dimensions.0 <= 480 && dimensions.1 <= 320);
                }
                bytes += fs::metadata(file).unwrap().len();
                count += 1;
            }
            true
        });
        assert_eq!(count, 16);
        let cold = start.elapsed();
        let warm = std::time::Instant::now();
        prepare(&sources, &cache, |_| true);
        eprintln!(
            "Theme preview benchmark: {bytes} bytes for 16 images; cold {cold:?}; warm {:?}",
            warm.elapsed()
        );
        assert!(bytes < 2 * 1024 * 1024);
        assert!(
            !cache.exists(),
            "Shipped previews require no generated cache"
        );
    }

    #[test]
    fn creates_small_previews_and_reuses_them_without_decoding_the_original() {
        let root = std::env::temp_dir().join(format!("orbit-preview-{}", uuid::Uuid::new_v4()));
        let source = root.join("source/god-of-war");
        let cache = root.join("cache");
        fs::create_dir_all(&source).unwrap();
        image::RgbaImage::from_pixel(800, 600, image::Rgba([70, 150, 200, 255]))
            .save(source.join("hero.png"))
            .unwrap();
        let (first, backend) =
            prepare_slot(&root.join("source"), &cache, "god-of-war", "hero").unwrap();
        assert_eq!(image::image_dimensions(&first).unwrap(), (640, 320));
        let before = fs::metadata(&first).unwrap().modified().unwrap();
        let (second, cached) =
            prepare_slot(&root.join("source"), &cache, "god-of-war", "hero").unwrap();
        assert_eq!(first, second);
        assert_eq!(cached, "cache");
        assert_eq!(before, fs::metadata(&second).unwrap().modified().unwrap());
        assert!(prepare_slot(&root.join("source"), &cache, "../god-of-war", "hero").is_none());
        assert!(prepare_slot(&root.join("source"), &cache, "god-of-war", "../hero").is_none());
        eprintln!(
            "Native preview prepared with {backend}; cached bytes: {}",
            fs::metadata(second).unwrap().len()
        );
        fs::remove_dir_all(root).unwrap();
    }
}
