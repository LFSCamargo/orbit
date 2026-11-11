// Stage display-size lossless intermediates and GPU previews before WebP encoding.
use orbit_images::{display_image, Renderer, Slot};
use std::{
    error::Error,
    fs,
    path::{Path, PathBuf},
};

fn source(dir: &Path, slot: &str) -> Result<Vec<u8>, Box<dyn Error>> {
    for extension in ["png", "jpg", "webp"] {
        let file = dir.join(format!("{slot}.{extension}"));
        if file.is_file() {
            return Ok(fs::read(file)?);
        }
    }
    Err(format!("Missing {slot} artwork").into())
}

fn main() -> Result<(), Box<dyn Error>> {
    let args: Vec<_> = std::env::args().collect();
    let root = PathBuf::from(args.get(1).ok_or("Supply the artwork directory")?);
    let output = PathBuf::from(args.get(2).ok_or("Supply the staging directory")?);
    let mut renderer = Renderer::new();
    for entry in fs::read_dir(root)?.take(32) {
        let dir = entry?.path();
        if !dir.is_dir() {
            continue;
        }
        let target = output.join(dir.file_name().ok_or("Invalid artwork directory")?);
        fs::create_dir_all(&target)?;
        for (slot, name) in [(Slot::Logo, "logo"), (Slot::Hero, "hero")] {
            let bytes = source(&dir, name)?;
            display_image(&bytes, slot)
                .ok_or("Invalid artwork")?
                .save(target.join(format!("{name}.png")))?;
            let (preview, _) = renderer.prepare(&bytes, slot).ok_or("Invalid preview")?;
            let extension = if name == "logo" { "png" } else { "jpg" };
            fs::write(target.join(format!("preview-{name}.{extension}")), preview)?;
        }
    }
    Ok(())
}
