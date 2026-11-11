// Generate the browser's compact assets with the same native renderer as the desktop app.
use orbit_images::{Renderer, Slot};
use std::{error::Error, fs, path::PathBuf};

fn main() -> Result<(), Box<dyn Error>> {
    let root = PathBuf::from(
        std::env::args()
            .nth(1)
            .ok_or("Supply the bundled artwork directory")?,
    );
    let mut renderer = Renderer::new();
    let mut count = 0;
    let mut total = 0;
    for entry in fs::read_dir(root)?.take(32) {
        let dir = entry?.path();
        if !dir.is_dir() {
            continue;
        }
        for (slot, source, target) in [
            (Slot::Logo, "logo.png", "preview-logo.png"),
            (Slot::Hero, "hero.png", "preview-hero.jpg"),
        ] {
            let name = source.trim_end_matches(".png");
            let input = ["webp", "png", "jpg"]
                .iter()
                .map(|extension| dir.join(format!("{name}.{extension}")))
                .find(|path| path.is_file())
                .ok_or("Missing source artwork")?;
            let (bytes, backend) = renderer
                .prepare(&fs::read(input)?, slot)
                .ok_or("Could not prepare image")?;
            total += bytes.len();
            fs::write(dir.join(target), bytes)?;
            // This example stages legacy preview intermediates. The optimizer encodes
            // the final WebP variants used by the app.
            count += 1;
            println!("Prepared {target} with {backend}");
        }
    }
    println!("{count} previews, {total} bytes");
    Ok(())
}
