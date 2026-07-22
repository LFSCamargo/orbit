fn main() {
    println!("cargo:rerun-if-changed=tauri.conf.json");

    let icons = std::path::Path::new("icons");
    if icons.is_dir() {
        for entry in std::fs::read_dir(icons).into_iter().flatten().flatten() {
            println!("cargo:rerun-if-changed={}", entry.path().display());
        }
    }

    tauri_build::build()
}
