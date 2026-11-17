//! Provision Valve's Windows Steam client into a game container. The client is
//! not redistributable, so Orbit downloads it on demand (like Wine and GPTK)
//! from Valve's own CDN, verifies each package against the signed manifest,
//! caches it once under `runtimes/steam-client/<version>/Steam`, and links it
//! into each container beside the agent. Only the pure manifest parsing lives
//! in tests; the download and unzip are covered by an ignored live test.
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::runtimes::containers::steam::steam_root;
use crate::utils::steam_vdf::{self, Value};

const MANIFEST_URL: &str = "https://client-update.steamstatic.com/steam_client_win64";
const CDN_BASE: &str = "https://client-update.steamstatic.com/";
/// The packages that hold a runnable client: core binaries plus the bootstrap
/// `steam.exe` and its small UI DLLs. CEF / `steamwebhelper` (UI only) are left
/// out — a silent login and Steamworks do not need them.
const PACKAGES: &[&str] = &[
    "bins_win64",
    "bins_codecs_win64",
    "bins_misc_win64",
    "bins_webhelpers_win64",
    "bins_cef_win64",
    "steam_win64",
    "strings_en_all",
    "strings_all",
    "public_all",
    "resources_all",
];
/// Each package's compressed download is bounded well above its real size.
const PACKAGE_LIMIT: u64 = 256 * 1024 * 1024;
const MANIFEST_LIMIT: u64 = 1024 * 1024;

#[derive(Debug, PartialEq, Eq)]
struct Package {
    file: String,
    sha2: String,
}

/// Ensure Valve's client is cached locally and return its `…/Steam` directory.
pub fn ensure_shared(runtimes_root: &Path) -> Result<PathBuf, String> {
    let manifest = fetch_manifest()?;
    let version = manifest_version(&manifest).ok_or("Steam client manifest has no version")?;
    let shared = runtimes_root
        .join("steam-client")
        .join(&version)
        .join("Steam");
    let marker = shared.join(".orbit-complete");
    // steamui.dll imports the codec libraries. An older cache can have
    // SteamUI.dll and still fail to load it.
    if marker.is_file()
        && shared
            .join("public/steambootstrapper_english.txt")
            .is_file()
        && shared.join("libavcodec-62.dll").is_file()
        && shared
            .join("bin/cef/cef.win64/steamwebhelper.exe")
            .is_file()
    {
        return Ok(shared);
    }
    std::fs::create_dir_all(&shared).map_err(|err| err.to_string())?;
    let scratch = shared
        .parent()
        .ok_or("Steam client cache path is invalid")?
        .join(".download");
    std::fs::create_dir_all(&scratch).map_err(|err| err.to_string())?;
    for name in PACKAGES {
        let package = manifest_package(&manifest, name)
            .ok_or(format!("Steam client manifest has no {name}"))?;
        let zip_path = scratch.join(format!("{name}.zip"));
        download_verified(
            &format!("{CDN_BASE}{}", package.file),
            &package.sha2,
            &zip_path,
        )?;
        extract_zip(&zip_path, &shared)?;
        let _ = std::fs::remove_file(&zip_path);
    }
    let _ = std::fs::remove_dir_all(&scratch);
    std::fs::write(&marker, version.as_bytes()).map_err(|err| err.to_string())?;
    Ok(shared)
}

/// Link Valve's cached client into the container's Steam folder. Existing files
/// (for example the agent installed as `steam.exe`) are never overwritten.
pub fn provision_container(runtimes_root: &Path, prefix: &Path) -> Result<(), String> {
    let shared = ensure_shared(runtimes_root)?;
    let dest = steam_root(prefix);
    std::fs::create_dir_all(&dest).map_err(|err| err.to_string())?;
    link_tree(&shared, &dest)
}

/// Whether Valve's `steamclient64.dll` is present in the container. The agent
/// and the silent client both need it.
pub fn has_client_dll(prefix: &Path) -> bool {
    steam_root(prefix).join("steamclient64.dll").is_file()
}

fn link_tree(source: &Path, dest: &Path) -> Result<(), String> {
    link_tree_at(source, dest, 0)
}

fn link_tree_at(source: &Path, dest: &Path, depth: u8) -> Result<(), String> {
    if depth > 8 {
        return Err("Steam client folder is too deep".into());
    }
    let entries = std::fs::read_dir(source).map_err(|err| err.to_string())?;
    for entry in entries.take(4096).flatten() {
        let name = entry.file_name();
        // Cache bookkeeping (the completion marker, partial downloads) stays out
        // of the container.
        if name.to_str().is_some_and(|text| text.starts_with('.')) {
            continue;
        }
        let from = entry.path();
        let to = dest.join(&name);
        let kind = entry.file_type().map_err(|err| err.to_string())?;
        if kind.is_symlink() {
            continue;
        }
        if kind.is_dir() {
            std::fs::create_dir_all(&to).map_err(|err| err.to_string())?;
            link_tree_at(&from, &to, depth + 1)?;
        } else if !to.exists() {
            symlink_file(&from, &to)?;
        }
    }
    Ok(())
}

#[cfg(unix)]
fn symlink_file(from: &Path, to: &Path) -> Result<(), String> {
    std::os::unix::fs::symlink(from, to).map_err(|err| err.to_string())
}

#[cfg(not(unix))]
fn symlink_file(from: &Path, to: &Path) -> Result<(), String> {
    std::fs::copy(from, to)
        .map(|_| ())
        .map_err(|err| err.to_string())
}

fn fetch_manifest() -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent("Orbit")
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|err| err.to_string())?;
    let mut response = client
        .get(MANIFEST_URL)
        .send()
        .map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Steam client manifest request failed (HTTP {})",
            response.status()
        ));
    }
    let mut body = String::new();
    response
        .by_ref()
        .take(MANIFEST_LIMIT)
        .read_to_string(&mut body)
        .map_err(|err| err.to_string())?;
    Ok(body)
}

fn download_verified(url: &str, sha2: &str, dest: &Path) -> Result<(), String> {
    use sha2::{Digest, Sha256};
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let client = reqwest::blocking::Client::builder()
        .user_agent("Orbit")
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|err| err.to_string())?;
    let mut response = client.get(url).send().map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Steam client download failed (HTTP {})",
            response.status()
        ));
    }
    let partial = dest.with_extension("partial");
    let mut file = std::fs::File::create(&partial).map_err(|err| err.to_string())?;
    let mut hasher = Sha256::new();
    let mut total = 0u64;
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = response.read(&mut buffer).map_err(|err| {
            let _ = std::fs::remove_file(&partial);
            err.to_string()
        })?;
        if read == 0 {
            break;
        }
        total += read as u64;
        if total > PACKAGE_LIMIT {
            let _ = std::fs::remove_file(&partial);
            return Err("Steam client package is larger than expected".into());
        }
        hasher.update(&buffer[..read]);
        if let Err(err) = file.write_all(&buffer[..read]) {
            let _ = std::fs::remove_file(&partial);
            return Err(err.to_string());
        }
    }
    if let Err(err) = file.sync_all() {
        let _ = std::fs::remove_file(&partial);
        return Err(err.to_string());
    }
    drop(file);
    let digest = hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    if !digest.eq_ignore_ascii_case(sha2) {
        let _ = std::fs::remove_file(&partial);
        return Err("Steam client package did not match its checksum".into());
    }
    std::fs::rename(&partial, dest).map_err(|err| err.to_string())
}

fn extract_zip(zip_path: &Path, dest: &Path) -> Result<(), String> {
    let file = std::fs::File::open(zip_path).map_err(|err| err.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|err| err.to_string())?;
    if archive.len() > 4_096 {
        return Err("Steam client package has too many files".into());
    }
    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(|err| err.to_string())?;
        let Some(path) = file.enclosed_name().map(|path| path.to_path_buf()) else {
            return Err("Steam client package has an unsafe path".into());
        };
        let out = dest.join(&path);
        if !out.starts_with(dest) {
            return Err("Steam client package escapes its folder".into());
        }
        if file.is_dir() {
            std::fs::create_dir_all(&out).map_err(|err| err.to_string())?;
            continue;
        }
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }
        let mut sink = std::fs::File::create(&out).map_err(|err| err.to_string())?;
        std::io::copy(&mut file, &mut sink).map_err(|err| err.to_string())?;
    }
    Ok(())
}

fn manifest_version(manifest: &str) -> Option<String> {
    root_fields(manifest)?
        .iter()
        .find_map(|(key, value)| match value {
            Value::Text(text) if key == "version" => Some(text.clone()),
            _ => None,
        })
}

fn manifest_package(manifest: &str, name: &str) -> Option<Package> {
    let fields = root_fields(manifest)?;
    let (_, Value::Object(entry)) = fields.iter().find(|(key, _)| key == name)? else {
        return None;
    };
    let field = |want: &str| {
        entry.iter().find_map(|(key, value)| match value {
            Value::Text(text) if key == want => Some(text.clone()),
            _ => None,
        })
    };
    Some(Package {
        file: field("file")?,
        sha2: field("sha2")?,
    })
}

fn root_fields(manifest: &str) -> Option<Vec<(String, Value)>> {
    let parsed = steam_vdf::parse(manifest).ok()?;
    let (_, Value::Object(fields)) = parsed.into_iter().next()? else {
        return None;
    };
    Some(fields)
}

#[cfg(test)]
mod tests {
    use super::*;

    const MANIFEST: &str = r#"
"win64"
{
	"version"		"1794536281"
	"bins_win64"
	{
		"file"		"bins_win64.zip.119a215939f1426cff28bdf03a5c55fcd865720c"
		"size"		"64658652"
		"sha2"		"abc123"
	}
	"steam_win64"
	{
		"file"		"steam_win64.zip.deadbeef"
		"size"		"2696423"
		"sha2"		"def456"
	}
}
"#;

    #[test]
    fn reads_version_and_package_entries() {
        assert_eq!(manifest_version(MANIFEST).as_deref(), Some("1794536281"));
        let bins = manifest_package(MANIFEST, "bins_win64").unwrap();
        assert_eq!(
            bins.file,
            "bins_win64.zip.119a215939f1426cff28bdf03a5c55fcd865720c"
        );
        assert_eq!(bins.sha2, "abc123");
        assert_eq!(
            manifest_package(MANIFEST, "steam_win64").unwrap().sha2,
            "def456"
        );
        assert!(manifest_package(MANIFEST, "bins_cef_win64").is_none());
    }

    #[cfg(unix)]
    #[test]
    fn links_the_cached_client_without_overwriting_the_agent() {
        let root = std::env::temp_dir().join(format!("orbit-provision-{}", uuid::Uuid::new_v4()));
        let shared = root.join("shared/Steam");
        std::fs::create_dir_all(shared.join("bin")).unwrap();
        std::fs::write(shared.join("steamclient64.dll"), b"MZDLL").unwrap();
        std::fs::write(shared.join("steam.exe"), b"MZVALVE").unwrap();
        std::fs::write(shared.join("bin/SteamService.exe"), b"MZSVC").unwrap();
        std::fs::write(shared.join(".orbit-complete"), b"1").unwrap();
        let prefix = root.join("prefix");
        let dest = steam_root(&prefix);
        std::fs::create_dir_all(&dest).unwrap();
        // The agent is already installed as steam.exe and must survive.
        std::fs::write(dest.join("steam.exe"), b"MZAGENT").unwrap();
        link_tree(&shared, &dest).unwrap();
        assert!(has_client_dll(&prefix));
        assert_eq!(std::fs::read(dest.join("steam.exe")).unwrap(), b"MZAGENT");
        assert!(dest.join("bin/SteamService.exe").is_file());
        assert!(!dest.join(".orbit-complete").exists());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    #[ignore = "downloads Valve's client from the live CDN"]
    fn live_download_provisions_steamclient() {
        let root =
            std::env::temp_dir().join(format!("orbit-provision-live-{}", uuid::Uuid::new_v4()));
        let shared = ensure_shared(&root).unwrap();
        assert!(shared.join("steamclient64.dll").is_file());
        assert!(shared.join("steam.exe").is_file());
        // A second call is served from the cache.
        assert_eq!(ensure_shared(&root).unwrap(), shared);
        let _ = std::fs::remove_dir_all(root);
    }
}
