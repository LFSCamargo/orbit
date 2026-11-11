use std::fs::File;
use std::io::Read;
use std::path::{Component, Path};

use orbit_motion::{sample_lighting, MAX_IMAGE_BYTES};

use crate::services::artwork::decode_data_url;
use crate::utils::paths::artwork_cache_dir;

pub fn sample(reference: &str) -> Option<[u8; 3]> {
    if reference.starts_with("data:image/") && reference.len() <= MAX_IMAGE_BYTES {
        return sample_lighting(&decode_data_url(reference)?.0);
    }

    let path = scoped_image(Path::new(reference), &artwork_cache_dir())?;
    let file = File::open(path).ok()?;
    let metadata = file.metadata().ok()?;
    if !metadata.is_file() || metadata.len() > MAX_IMAGE_BYTES as u64 {
        return None;
    }
    let mut bytes = Vec::new();
    file.take(MAX_IMAGE_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    sample_lighting(&bytes)
}

fn scoped_image(path: &Path, root: &Path) -> Option<std::path::PathBuf> {
    if !path.is_absolute()
        || path.components().any(|part| part == Component::ParentDir)
        || !matches!(path.extension()?.to_str()?, "png" | "jpg" | "jpeg" | "webp")
    {
        return None;
    }
    let path = path.canonicalize().ok()?;
    (path.starts_with(root.canonicalize().ok()?) && path.is_file()).then_some(path)
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::{fs, os::unix::fs::symlink};

    #[test]
    fn limits_sampling_to_canonical_cache_images() {
        let dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        let root = dir.join("cache");
        fs::create_dir_all(&root).unwrap();
        let inside = root.join("hero.png");
        let outside = dir.join("outside.png");
        fs::write(&inside, b"fixture").unwrap();
        fs::write(&outside, b"fixture").unwrap();
        let alias = root.join("alias.png");
        symlink(&outside, &alias).unwrap();
        assert!(scoped_image(&inside, &root).is_some());
        assert!(scoped_image(&alias, &root).is_none());
        assert!(scoped_image(&root.join("../outside.png"), &root).is_none());
        fs::remove_dir_all(dir).unwrap();
    }
}
