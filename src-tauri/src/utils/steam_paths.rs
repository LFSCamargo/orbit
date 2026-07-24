use std::path::PathBuf;

/// Candidate Steam install roots on macOS / Linux (first existing wins).
pub fn steam_root_candidates() -> Vec<PathBuf> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };
    vec![
        home.join("Library/Application Support/Steam"),
        PathBuf::from("/Applications/Steam.app/Contents/MacOS"),
        home.join(".steam/steam"),
        home.join(".local/share/Steam"),
    ]
}

/// Return the first existing Steam root from known candidate paths.
pub fn detect_steam_root() -> Option<PathBuf> {
    steam_root_candidates()
        .into_iter()
        .find(|path| path.exists())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn candidates_are_non_empty_when_home_exists() {
        if dirs::home_dir().is_some() {
            assert!(!steam_root_candidates().is_empty());
        }
    }
}
