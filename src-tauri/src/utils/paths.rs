use std::path::PathBuf;

pub fn app_data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Orbit")
}

pub fn database_path() -> PathBuf {
    app_data_dir().join("orbit.sqlite3")
}

pub fn artwork_cache_dir() -> PathBuf {
    app_data_dir().join("artwork-cache")
}

pub fn themes_dir() -> PathBuf {
    app_data_dir().join("themes")
}
