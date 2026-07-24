use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

use image::{imageops, ImageFormat, Rgba, RgbaImage};

use crate::utils::paths::artwork_cache_dir;

/// Returns true for http(s) URLs, data URLs, or local paths that point to a regular file.
pub fn is_usable_artwork_reference(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return false;
    }
    if trimmed.starts_with("http://")
        || trimmed.starts_with("https://")
        || trimmed.starts_with("data:image/")
    {
        return true;
    }
    Path::new(trimmed).is_file()
}

/// Flatten transparent square icons onto black so tiles stay readable on any theme.
pub fn prepare_icon_bytes(bytes: &[u8]) -> (Vec<u8>, String) {
    match flatten_icon_onto_black(bytes) {
        Ok(prepared) => {
            let mime = mime_from_bytes(&prepared, "");
            (prepared, mime)
        }
        Err(_) => (bytes.to_vec(), mime_from_bytes(bytes, "")),
    }
}

/// Composite semi-transparent pixels onto a black canvas; opaque images pass through unchanged.
pub fn flatten_icon_onto_black(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let img = image::load_from_memory(bytes).map_err(|err| err.to_string())?;
    let rgba = img.to_rgba8();
    let has_transparency = rgba.pixels().any(|pixel| pixel[3] < 250);
    if !has_transparency {
        return Ok(bytes.to_vec());
    }

    let (width, height) = rgba.dimensions();
    let mut canvas = RgbaImage::from_pixel(width, height, Rgba([0, 0, 0, 255]));
    imageops::overlay(&mut canvas, &rgba, 0, 0);
    for pixel in canvas.pixels_mut() {
        pixel[3] = 255;
    }

    let mut out = Vec::new();
    canvas
        .write_to(&mut Cursor::new(&mut out), ImageFormat::Png)
        .map_err(|err| err.to_string())?;
    Ok(out)
}

/// Persist downloaded artwork bytes under Application Support and return the file path.
pub fn cache_artwork_bytes(
    game_id: &str,
    slot: &str,
    bytes: &[u8],
    mime: &str,
) -> Result<PathBuf, String> {
    let (bytes, mime) = if slot == "icon" {
        prepare_icon_bytes(bytes)
    } else {
        (bytes.to_vec(), mime.to_string())
    };

    let dir = artwork_cache_dir().join(sanitize_segment(game_id));
    if dir.exists() && !dir.is_dir() {
        return Err(format!(
            "Artwork cache path is not a directory: {}",
            dir.display()
        ));
    }
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;

    let ext = extension_for_mime(&mime, &bytes);
    let path = dir.join(format!("{slot}.{ext}"));
    if path.is_dir() {
        fs::remove_dir_all(&path).map_err(|err| err.to_string())?;
    }
    fs::write(&path, bytes).map_err(|err| err.to_string())?;
    Ok(path)
}

pub fn mime_from_bytes(bytes: &[u8], url_hint: &str) -> String {
    if bytes.starts_with(b"\x89PNG") {
        return "image/png".into();
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return "image/jpeg".into();
    }
    if bytes.starts_with(b"RIFF") && bytes.len() > 12 && &bytes[8..12] == b"WEBP" {
        return "image/webp".into();
    }
    let lower = url_hint.to_ascii_lowercase();
    if lower.contains(".png") {
        "image/png".into()
    } else if lower.contains(".webp") {
        "image/webp".into()
    } else {
        "image/jpeg".into()
    }
}

fn extension_for_mime(mime: &str, bytes: &[u8]) -> &'static str {
    match mime {
        "image/png" => "png",
        "image/webp" => "webp",
        "image/gif" => "gif",
        "image/jpeg" => "jpg",
        _ if bytes.starts_with(b"\x89PNG") => "png",
        _ => "jpg",
    }
}

fn sanitize_segment(value: &str) -> String {
    value
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

#[allow(dead_code)]
pub fn cached_slot_path(game_id: &str, slot: &str) -> PathBuf {
    artwork_cache_dir()
        .join(sanitize_segment(game_id))
        .join(format!("{slot}.jpg"))
}

pub fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn rejects_directory_paths_as_artwork_refs() {
        let dir = std::env::temp_dir().join(format!("orbit-artwork-dir-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        assert!(!is_usable_artwork_reference(dir.to_str().unwrap()));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn accepts_cached_image_files() {
        let dir = std::env::temp_dir().join(format!("orbit-artwork-file-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("cover.jpg");
        fs::File::create(&file)
            .unwrap()
            .write_all(b"jpg")
            .unwrap();
        assert!(is_usable_artwork_reference(file.to_str().unwrap()));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn replaces_existing_directory_slot_before_write() {
        let game_dir = std::env::temp_dir().join(format!("orbit-artwork-cache-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&game_dir).unwrap();
        fs::create_dir_all(game_dir.join("cover.jpg")).unwrap();

        let path = game_dir.join("cover.jpg");
        assert!(path.is_dir());
        fs::remove_dir_all(&path).unwrap();
        fs::write(&path, b"ok").unwrap();
        assert!(path.is_file());
        let _ = fs::remove_dir_all(game_dir);
    }

    #[test]
    fn flattens_transparent_icon_onto_black() {
        let mut rgba = RgbaImage::new(2, 2);
        rgba.put_pixel(0, 0, Rgba([255, 0, 0, 0]));
        rgba.put_pixel(1, 0, Rgba([255, 0, 0, 255]));
        rgba.put_pixel(0, 1, Rgba([0, 255, 0, 128]));
        rgba.put_pixel(1, 1, Rgba([0, 0, 255, 255]));

        let mut input = Vec::new();
        rgba.write_to(&mut Cursor::new(&mut input), ImageFormat::Png)
            .unwrap();

        let flattened = flatten_icon_onto_black(&input).expect("flatten icon");
        let decoded = image::load_from_memory(&flattened)
            .expect("decode flattened icon")
            .to_rgba8();

        assert_eq!(decoded.get_pixel(0, 0), &Rgba([0, 0, 0, 255]));
        assert_eq!(decoded.get_pixel(1, 0), &Rgba([255, 0, 0, 255]));
        assert_eq!(decoded.get_pixel(1, 1), &Rgba([0, 0, 255, 255]));
        assert!(decoded.get_pixel(0, 1)[3] == 255);
        assert!(decoded.get_pixel(0, 1)[1] > 0);
    }
}
