//! Prepare lighting from a bounded image decode before a backdrop transition.
use image::{GenericImageView, ImageReader};
use std::io::Cursor;

pub const MAX_IMAGE_BYTES: usize = 25 * 1024 * 1024;
const GRID: u32 = 16;

pub fn sample_lighting(bytes: &[u8]) -> Option<[u8; 3]> {
    if bytes.len() > MAX_IMAGE_BYTES {
        return None;
    }
    let mut reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .ok()?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(96 * 1024 * 1024);
    reader.limits(limits);
    let image = reader.decode().ok()?;
    let (width, height) = image.dimensions();
    let band = (height / 4).max(1);
    let mut rgb = [0u32; 3];

    for row in 0..GRID {
        for col in 0..GRID {
            let pixel = image.get_pixel(
                (2 * col + 1) * width / (2 * GRID),
                (2 * row + 1) * band / (2 * GRID),
            );
            for channel in 0..3 {
                rgb[channel] += u32::from(pixel[channel]) * u32::from(pixel[3]);
            }
        }
    }

    Some(rgb.map(|sum| (sum / (255 * GRID * GRID)) as u8))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, ImageFormat, Rgba, RgbaImage};

    #[test]
    fn lighting_reads_the_top_band_and_respects_transparency() {
        let mut art = RgbaImage::from_pixel(32, 32, Rgba([255, 255, 255, 255]));
        for x in 0..32 {
            for y in 0..8 {
                art.put_pixel(x, y, Rgba([160, 80, 40, 128]));
            }
        }
        let mut bytes = Cursor::new(Vec::new());
        DynamicImage::ImageRgba8(art)
            .write_to(&mut bytes, ImageFormat::Png)
            .unwrap();
        assert_eq!(sample_lighting(bytes.get_ref()), Some([80, 40, 20]));
        assert_eq!(sample_lighting(b"invalid image"), None);
    }
}
