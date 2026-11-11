use crate::database::GameRepository;
use crate::models::{GameArtwork, UpdateGameRequest};
use crate::services::artwork::{cache_artwork_bytes, is_usable_artwork_reference, path_to_string};
use image::{ImageFormat, Rgba, RgbaImage};
use std::io::Cursor;

pub fn is_real_artwork(value: &str) -> bool {
    is_usable_artwork_reference(value) && !is_generated(value)
}
fn is_generated(value: &str) -> bool {
    value.contains("/artwork-cache/") && value.ends_with("/fallback.png")
}
pub fn needs_artwork(artwork: &GameArtwork) -> bool {
    [&artwork.cover, &artwork.hero, &artwork.icon]
        .iter()
        .any(|value| !value.as_deref().is_some_and(is_real_artwork))
}

/// Always leave a usable image, even offline. Generated art remains eligible for later enrichment.
pub fn complete_artwork(game_id: &str, artwork: &mut GameArtwork) -> Result<(), String> {
    let fallback = [&artwork.cover, &artwork.hero, &artwork.icon]
        .into_iter()
        .filter_map(|v| v.as_deref())
        .find(|v| is_real_artwork(v))
        .map(str::to_string)
        .or_else(|| {
            [&artwork.cover, &artwork.hero, &artwork.icon]
                .into_iter()
                .filter_map(|v| v.as_deref())
                .find(|v| is_usable_artwork_reference(v))
                .map(str::to_string)
        });
    let fallback = match fallback {
        Some(value) => value,
        None => {
            let seed = game_id
                .bytes()
                .fold(0u32, |acc, b| acc.wrapping_mul(31).wrapping_add(b as u32));
            let mut image = RgbaImage::new(256, 256);
            for (x, y, pixel) in image.enumerate_pixels_mut() {
                let dx = x as i32 - 128;
                let dy = y as i32 - 128;
                let orbit = (dx * dx + dy * dy - 6400).abs() < 500;
                let glow = if orbit { 100 } else { 0 };
                *pixel = Rgba([
                    ((seed % 70) as u8 + x as u8 / 4).saturating_add(glow),
                    (35 + y / 5) as u8,
                    ((seed / 71 % 90) as u8 + 55).saturating_add(glow),
                    255,
                ]);
            }
            let mut bytes = vec![];
            image
                .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
                .map_err(|e| e.to_string())?;
            path_to_string(&cache_artwork_bytes(
                game_id,
                "fallback",
                &bytes,
                "image/png",
            )?)
        }
    };
    for value in [&mut artwork.cover, &mut artwork.hero, &mut artwork.icon] {
        if !value.as_deref().is_some_and(is_real_artwork) {
            *value = Some(fallback.clone());
        }
    }
    Ok(())
}

pub fn ensure_import_artwork(repo: &GameRepository, game_id: &str) -> Result<(), String> {
    let game = repo
        .get_game(game_id)
        .map_err(|e| e.to_string())?
        .ok_or("Game not found")?;
    let mut artwork = game.artwork.clone();
    complete_artwork(game_id, &mut artwork)?;
    if artwork.cover != game.artwork.cover
        || artwork.hero != game.artwork.hero
        || artwork.icon != game.artwork.icon
    {
        repo.update_game(
            game_id,
            UpdateGameRequest {
                artwork: Some(artwork),
                ..Default::default()
            },
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reuses_known_art_without_overwriting_custom_slots() {
        let mut art = GameArtwork {
            cover: Some("https://example.com/cover.jpg".into()),
            hero: None,
            icon: Some("https://example.com/custom.png".into()),
            logo: None,
        };
        complete_artwork("test", &mut art).unwrap();
        assert_eq!(art.hero, art.cover);
        assert_eq!(art.icon.as_deref(), Some("https://example.com/custom.png"));
    }
    #[test]
    fn offline_imports_get_a_decodable_image_that_remains_retryable() {
        let id = format!("test-fallback-{}", uuid::Uuid::new_v4());
        let mut art = GameArtwork::default();
        complete_artwork(&id, &mut art).unwrap();
        assert!(needs_artwork(&art));
        let path = art.cover.unwrap();
        assert!(image::open(&path).is_ok());
        assert_eq!(art.hero.as_deref(), Some(path.as_str()));
        assert_eq!(art.icon.as_deref(), Some(path.as_str()));
        std::fs::remove_dir_all(std::path::Path::new(&path).parent().unwrap()).unwrap();
    }
}
