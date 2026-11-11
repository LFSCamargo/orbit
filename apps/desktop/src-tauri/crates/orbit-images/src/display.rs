use crate::{decode, frame_image, resize_cpu, Slot};
use image::RgbaImage;

/// Display assets retain their full scene aspect ratio; only logos trim transparent margins.
pub fn display_image(bytes: &[u8], slot: Slot) -> Option<RgbaImage> {
    let image = decode(bytes)?;
    let image = if matches!(slot, Slot::Logo) {
        frame_image(image, slot)
    } else {
        image
    };
    let (max_width, max_height) = if matches!(slot, Slot::Logo) {
        (1024, 512)
    } else {
        (3840, 2160)
    };
    let scale = (f64::from(max_width) / f64::from(image.width()))
        .min(f64::from(max_height) / f64::from(image.height()))
        .min(1.0);
    if scale >= 1.0 {
        return Some(image);
    }
    let size = (
        (f64::from(image.width()) * scale).round().max(1.0) as u32,
        (f64::from(image.height()) * scale).round().max(1.0) as u32,
    );
    Some(resize_cpu(&image, size))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, ImageFormat, Rgba};
    use std::io::Cursor;

    fn png(image: RgbaImage) -> Vec<u8> {
        let mut bytes = Cursor::new(Vec::new());
        DynamicImage::ImageRgba8(image)
            .write_to(&mut bytes, ImageFormat::Png)
            .unwrap();
        bytes.into_inner()
    }

    #[test]
    fn opaque_backgrounds_are_compressed_once_and_transparent_logos_stay_transparent() {
        let source = png(RgbaImage::from_pixel(1000, 500, Rgba([70, 120, 180, 255])));
        let optimized = optimize_theme(&source, Slot::Hero).unwrap();
        assert_eq!(optimized.mime, "image/jpeg");
        let repeated = optimize_theme(&optimized.bytes, Slot::Hero).unwrap();
        assert_eq!(optimized.bytes, repeated.bytes);
        let source = png(RgbaImage::from_pixel(1200, 600, Rgba([200, 20, 70, 128])));
        let logo = optimize_theme(&source, Slot::Logo).unwrap();
        assert_eq!(logo.mime, "image/png");
        let image = decode(&logo.bytes).unwrap();
        assert!(image.width() <= 1024 && image.height() <= 512);
        assert!(image.pixels().any(|pixel| pixel[3] < 255));
    }

    #[test]
    fn display_logos_reduce_decoded_memory_and_preserve_alpha() {
        let source = RgbaImage::from_fn(2400, 1000, |x, _| {
            Rgba([220, 30, 10, if x < 100 { 0 } else { 128 }])
        });
        let output = display_image(&png(source), Slot::Logo).unwrap();
        assert!(output.width() <= 1024 && output.height() <= 512);
        assert!(output.pixels().any(|pixel| pixel[3] < 255));
    }

    #[test]
    fn wallpapers_keep_their_original_aspect_ratio_without_upscaling() {
        let source = RgbaImage::from_pixel(1200, 400, Rgba([70, 140, 200, 255]));
        let output = display_image(&png(source), Slot::Hero).unwrap();
        assert_eq!(output.dimensions(), (1200, 400));
    }
}

pub struct OptimizedImage {
    pub bytes: Vec<u8>,
    pub mime: &'static str,
}

/// Optimize newly picked custom artwork once, retaining existing compact lossy images.
pub fn optimize_theme(bytes: &[u8], slot: Slot) -> Option<OptimizedImage> {
    use image::{
        codecs::{
            jpeg::JpegEncoder,
            png::{CompressionType, FilterType, PngEncoder},
        },
        DynamicImage, ImageEncoder, ImageFormat, ImageReader,
    };
    use std::io::Cursor;
    let image = display_image(bytes, slot)?;
    let format = image::guess_format(bytes).ok()?;
    let original_size = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .ok()?
        .into_dimensions()
        .ok()?;
    if original_size == image.dimensions()
        && matches!(format, ImageFormat::Jpeg | ImageFormat::WebP)
    {
        return Some(OptimizedImage {
            bytes: bytes.to_vec(),
            mime: if format == ImageFormat::WebP {
                "image/webp"
            } else {
                "image/jpeg"
            },
        });
    }
    let mut output = Vec::new();
    let mime = if matches!(slot, Slot::Logo) || image.pixels().any(|pixel| pixel[3] < 255) {
        PngEncoder::new_with_quality(&mut output, CompressionType::Best, FilterType::Adaptive)
            .write_image(
                image.as_raw(),
                image.width(),
                image.height(),
                image::ExtendedColorType::Rgba8,
            )
            .ok()?;
        "image/png"
    } else {
        JpegEncoder::new_with_quality(&mut output, 88)
            .encode_image(&DynamicImage::ImageRgba8(image))
            .ok()?;
        "image/jpeg"
    };
    Some(OptimizedImage {
        bytes: output,
        mime,
    })
}
