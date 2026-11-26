fn main() {
    println!("cargo:rerun-if-changed=tauri.conf.json");

    let icons = std::path::Path::new("icons");
    if icons.is_dir() {
        for entry in std::fs::read_dir(icons).into_iter().flatten().flatten() {
            println!("cargo:rerun-if-changed={}", entry.path().display());
        }
    }

    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        build_hidden_client();
    }

    tauri_build::build()
}

/// The library Orbit loads into the Windows Steam client's Wine processes
/// (see `native/hidden_client.m`). Wine runs as x86_64 under Rosetta; arm64 is
/// included so the library loads into either kind of Wine.
fn build_hidden_client() {
    let source = "native/hidden_client.m";
    println!("cargo:rerun-if-changed={source}");
    let out = std::path::PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR"))
        .join("OrbitHiddenClient.dylib");
    let status = std::process::Command::new("xcrun")
        .args([
            "clang",
            "-arch",
            "x86_64",
            "-arch",
            "arm64",
            "-dynamiclib",
            "-fobjc-arc",
            "-O2",
            "-Wall",
            "-Werror",
            "-mmacosx-version-min=12.0",
            "-framework",
            "AppKit",
            "-framework",
            "Foundation",
            "-install_name",
            "@rpath/OrbitHiddenClient.dylib",
            "-o",
        ])
        .arg(&out)
        .arg(source)
        .status()
        .expect("xcrun clang is needed to build Orbit's hidden Steam client library");
    assert!(
        status.success(),
        "Orbit's hidden Steam client library did not compile"
    );
    let signed = std::process::Command::new("/usr/bin/codesign")
        .args(["--force", "--sign", "-"])
        .arg(&out)
        .status()
        .expect("codesign is needed to sign Orbit's hidden Steam client library");
    assert!(
        signed.success(),
        "Orbit's hidden Steam client library could not be signed"
    );
}
