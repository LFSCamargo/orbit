use std::path::Path;

pub fn is_switch_rom(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "nsp" | "xci"))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_switch_rom_extensions() {
        assert!(is_switch_rom(Path::new("/Games/Zelda.nsp")));
        assert!(is_switch_rom(Path::new("/Games/Mario.XCI")));
        assert!(!is_switch_rom(Path::new("/Games/readme.txt")));
    }
}
