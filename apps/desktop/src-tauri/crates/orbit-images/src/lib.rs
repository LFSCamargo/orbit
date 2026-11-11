mod display;
mod gpu;
pub use display::{display_image, optimize_theme, OptimizedImage};
use image::{
    codecs::jpeg::JpegEncoder, imageops, DynamicImage, ImageFormat, ImageReader, RgbaImage,
};
use std::io::Cursor;

pub const MAX_BYTES: usize = 25 * 1024 * 1024;

#[derive(Clone, Copy)]
pub enum Slot {
    Logo,
    Hero,
}

pub struct Renderer {
    gpu: Option<gpu::Gpu>,
}

impl Default for Renderer {
    fn default() -> Self {
        Self::new()
    }
}

impl Renderer {
    pub fn new() -> Self {
        Self {
            gpu: gpu::Gpu::new(),
        }
    }

    pub fn prepare(&mut self, bytes: &[u8], slot: Slot) -> Option<(Vec<u8>, String)> {
        let framed = frame_image(decode(bytes)?, slot);
        let size = output_size(&framed, slot);
        let (image, backend) = self.resize(&framed, size);
        let mut output = Cursor::new(Vec::new());
        if matches!(slot, Slot::Logo) {
            image.write_to(&mut output, ImageFormat::Png).ok()?;
        } else {
            JpegEncoder::new_with_quality(&mut output, 85)
                .encode_image(&DynamicImage::ImageRgba8(image))
                .ok()?;
        }
        Some((output.into_inner(), backend))
    }

    pub fn resize(&mut self, source: &RgbaImage, size: (u32, u32)) -> (RgbaImage, String) {
        if let Some(gpu) = &self.gpu {
            if let Some(result) = gpu.resize(source, size) {
                return (result, gpu.backend.clone());
            }
        }
        self.gpu = None;
        (resize_cpu(source, size), "cpu".into())
    }
}

pub fn decode(bytes: &[u8]) -> Option<RgbaImage> {
    if bytes.len() > MAX_BYTES {
        return None;
    }
    let mut reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .ok()?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(16384);
    limits.max_image_height = Some(16384);
    limits.max_alloc = Some(96 * 1024 * 1024);
    reader.limits(limits);
    Some(reader.decode().ok()?.to_rgba8())
}

/// Scan each logo once for padding; hero cropping preserves its aspect ratio.
pub fn frame_image(image: RgbaImage, slot: Slot) -> RgbaImage {
    let (width, height) = image.dimensions();
    if matches!(slot, Slot::Hero) {
        let target_height = height.min(width / 2).max(1);
        let target_width = width.min(target_height * 2).max(1);
        return imageops::crop_imm(
            &image,
            (width - target_width) / 2,
            (height - target_height) / 2,
            target_width,
            target_height,
        )
        .to_image();
    }
    let (mut left, mut top, mut right, mut bottom) = (width, height, 0, 0);
    for (x, y, pixel) in image.enumerate_pixels() {
        if pixel[3] > 12 {
            left = left.min(x);
            top = top.min(y);
            right = right.max(x + 1);
            bottom = bottom.max(y + 1);
        }
    }
    if right <= left || bottom <= top {
        return image;
    }
    imageops::crop_imm(&image, left, top, right - left, bottom - top).to_image()
}

pub fn output_size(image: &RgbaImage, slot: Slot) -> (u32, u32) {
    if matches!(slot, Slot::Hero) {
        return (640, 320);
    }
    let ratio = (480.0 / f64::from(image.width()))
        .min(320.0 / f64::from(image.height()))
        .min(1.0);
    (
        (f64::from(image.width()) * ratio).round().max(1.0) as u32,
        (f64::from(image.height()) * ratio).round().max(1.0) as u32,
    )
}

pub fn resize_cpu(source: &RgbaImage, size: (u32, u32)) -> RgbaImage {
    imageops::resize(source, size.0, size.1, imageops::FilterType::Lanczos3)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};

    #[test]
    fn logo_trims_transparent_padding_and_preserves_aspect_ratio() {
        let mut image = RgbaImage::new(100, 80);
        for y in 20..60 {
            for x in 20..80 {
                image.put_pixel(x, y, Rgba([255, 30, 20, 255]));
            }
        }
        let cropped = frame_image(image, Slot::Logo);
        assert_eq!(cropped.dimensions(), (60, 40));
        assert_eq!(output_size(&cropped, Slot::Logo), (60, 40));
    }

    #[test]
    fn hero_crops_to_frame_without_stretching() {
        let image = frame_image(RgbaImage::new(1600, 1200), Slot::Hero);
        assert_eq!(image.dimensions(), (1600, 800));
        assert_eq!(output_size(&image, Slot::Hero), (640, 320));
    }

    #[test]
    fn gpu_and_cpu_preserve_image_orientation_and_handle_unavailable_hardware() {
        let source = RgbaImage::from_fn(64, 32, |_, y| {
            if y < 16 {
                Rgba([255, 0, 0, 255])
            } else {
                Rgba([0, 0, 255, 255])
            }
        });
        for mut renderer in [Renderer::new(), Renderer { gpu: None }] {
            let (image, _) = renderer.resize(&source, (16, 8));
            assert!(image.get_pixel(8, 0)[0] > 240);
            assert!(image.get_pixel(8, 7)[2] > 240);
        }
        assert!(decode(b"unsupported image bytes").is_none());
    }

    #[test]
    fn cpu_and_available_gpu_paths_produce_valid_transparent_images() {
        let source = RgbaImage::from_pixel(64, 32, Rgba([240, 30, 90, 127]));
        let cpu = resize_cpu(&source, (16, 8));
        assert_eq!(cpu.dimensions(), (16, 8));
        let mut renderer = Renderer::new();
        let (result, backend) = renderer.resize(&source, (16, 8));
        assert_eq!(result.dimensions(), (16, 8));
        for pixel in result.pixels() {
            assert!((i16::from(pixel[0]) - 240).abs() <= 1);
            assert!((i16::from(pixel[3]) - 127).abs() <= 1);
        }
        eprintln!("image backend: {backend}");
    }
}
