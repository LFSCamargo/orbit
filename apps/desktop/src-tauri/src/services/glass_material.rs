use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::{ImageFormat, Rgba, RgbaImage};
use serde::Serialize;
use std::{io::Cursor, sync::OnceLock};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlassMaterial {
    pub grain: String,
    pub toolbar_blur: u8,
    pub panel_blur: u8,
}

/// Render once per process. Every panel shares the small repeating tile.
pub fn material() -> Result<GlassMaterial, String> {
    static MATERIAL: OnceLock<Result<GlassMaterial, String>> = OnceLock::new();
    MATERIAL.get_or_init(render).clone()
}

fn render() -> Result<GlassMaterial, String> {
    let mut seed = 0x4f52_4249u32;
    let image = RgbaImage::from_fn(64, 64, |_, _| {
        seed ^= seed << 13;
        seed ^= seed >> 17;
        seed ^= seed << 5;
        let color = if seed & 1 == 0 { 0 } else { 255 };
        Rgba([color, color, color, (seed % 7) as u8])
    });
    let mut png = Cursor::new(Vec::new());
    image
        .write_to(&mut png, ImageFormat::Png)
        .map_err(|_| "Could not prepare the glass material".to_string())?;
    Ok(GlassMaterial {
        grain: format!(
            "data:image/png;base64,{}",
            STANDARD.encode(png.into_inner())
        ),
        toolbar_blur: 12,
        panel_blur: 8,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;

    #[test]
    fn native_material_is_small_deterministic_and_uses_bounded_blur() {
        let first = render().unwrap();
        let second = render().unwrap();
        assert_eq!(first.grain, second.grain);
        let data = first.grain.strip_prefix("data:image/png;base64,").unwrap();
        let pixels = base64::engine::general_purpose::STANDARD
            .decode(data)
            .unwrap();
        let image = image::load_from_memory(&pixels).unwrap().to_rgba8();
        assert_eq!(image.dimensions(), (64, 64));
        assert!(image.pixels().all(|pixel| pixel[3] <= 6));
        assert!(first.grain.len() < 32_000);
        assert!(first.panel_blur <= 8);
        assert!(first.toolbar_blur <= 12);
    }
}
