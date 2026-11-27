//! Orbit Wine distribution: the CrossOver-class build from `scripts/wine/build.sh`,
//! published on the Orbit repo's GitHub releases (tag `orbit-wine-v<version>`,
//! never marked latest so app updates are unaffected).
//!
//! Each release carries `orbit-wine.json` naming the archive, its size, SHA-256
//! and the matching sources (LGPL). The archive's root is `<version>/Orbit
//! Wine.app`; it is streamed to disk (it is large), checked, extracted into
//! `runtimes/components/orbit-wine/<version>/`, probed like Play does, and
//! registered with LaunchServices so macOS Game Mode applies to its games.

use super::components;
use super::manager::SetupProgress;
use super::wine_capabilities::version_key;
use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::time::Duration;

/// The public repository whose releases carry Orbit Wine.
pub const REPOSITORY: &str = "LFSCamargo/orbit";
pub const TAG_PREFIX: &str = "orbit-wine-v";
pub const MANIFEST_ASSET: &str = "orbit-wine.json";
/// GitHub's own limit for one release asset.
const MAX_ARCHIVE_BYTES: u64 = 2_147_483_648;

#[derive(Debug, Clone, Deserialize)]
pub struct GitHubRelease {
    pub tag_name: String,
    /// Release notes (Markdown, untrusted).
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub published_at: Option<String>,
    #[serde(default)]
    pub html_url: Option<String>,
    #[serde(default)]
    pub draft: bool,
    #[serde(default)]
    pub prerelease: bool,
    #[serde(default)]
    pub assets: Vec<GitHubAsset>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GitHubAsset {
    pub name: String,
    pub browser_download_url: String,
}

/// `orbit-wine.json`, published with each release.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrbitWineRelease {
    pub version: String,
    pub url: String,
    pub size: u64,
    pub sha256: String,
    /// Where the matching sources live (CrossOver sources plus Orbit's patches).
    pub sources_url: String,
}

/// An installed Orbit Wine, and whether its base container is ready.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrbitWineStatus {
    pub version: String,
    pub path: String,
    pub container_ready: bool,
}

/// Published Orbit Wine manifest URLs, highest version first: stable, not a
/// draft, tagged `orbit-wine-v…`, with the manifest attached. Versions are
/// compared, not GitHub's creation order, so a rebuild (`26.3.0-2`) wins
/// over an older build uploaded after it. Ties keep GitHub's order.
pub fn manifest_urls(releases: &[GitHubRelease]) -> Vec<String> {
    ranked(releases).into_iter().map(|(_, url)| url).collect()
}

/// Published Orbit Wine releases with their manifest URL, highest version
/// first (see `manifest_urls`). O(r log r).
pub fn ranked(releases: &[GitHubRelease]) -> Vec<(&GitHubRelease, String)> {
    let mut found: Vec<(Vec<u32>, &GitHubRelease, String)> = releases
        .iter()
        .filter(|release| !release.draft && !release.prerelease)
        .filter_map(|release| {
            let version = release.tag_name.strip_prefix(TAG_PREFIX)?;
            let asset = release
                .assets
                .iter()
                .find(|asset| asset.name == MANIFEST_ASSET)?;
            Some((
                version_key(version),
                release,
                asset.browser_download_url.clone(),
            ))
        })
        .collect();
    found.sort_by(|a, b| b.0.cmp(&a.0));
    found
        .into_iter()
        .map(|(_, release, url)| (release, url))
        .collect()
}

/// The highest published Orbit Wine release's manifest URL.
pub fn manifest_url(releases: &[GitHubRelease]) -> Option<String> {
    manifest_urls(releases).into_iter().next()
}

/// Whether `release` is newer than the installed Orbit Wine `installed`.
pub fn is_update(installed: &str, release: &str) -> bool {
    version_key(release) > version_key(installed)
}

/// Only this repository's release downloads, a real SHA-256, a version that is
/// a plain folder name, and an archive Orbit can unpack.
pub fn validate(release: &OrbitWineRelease) -> Result<()> {
    let prefix = format!("https://github.com/{REPOSITORY}/releases/download/");
    if !release.url.starts_with(&prefix) {
        bail!("The Orbit Wine release points outside Orbit's GitHub releases");
    }
    if !(release.url.ends_with(".tar.zst") || release.url.ends_with(".tar.xz")) {
        bail!("The Orbit Wine release is not a .tar.zst or .tar.xz archive");
    }
    if release.sha256.len() != 64 || !release.sha256.bytes().all(|b| b.is_ascii_hexdigit()) {
        bail!("The Orbit Wine release has no valid SHA-256");
    }
    if !super::wine_capabilities::is_version_name(&release.version) {
        bail!("The Orbit Wine release has an invalid version");
    }
    if release.size == 0 || release.size > MAX_ARCHIVE_BYTES {
        bail!("The Orbit Wine release has an invalid size");
    }
    Ok(())
}

/// The version folder an installed Orbit Wine loader lives in.
pub fn version_of(loader: &Path) -> Option<String> {
    let mut parts = loader
        .components()
        .map(|part| part.as_os_str().to_string_lossy());
    let mut previous = String::new();
    for part in parts.by_ref() {
        if previous == "orbit-wine" {
            return Some(part.into_owned());
        }
        previous = part.into_owned();
    }
    None
}

pub(super) fn client(read_timeout: Duration) -> Result<reqwest::blocking::Client> {
    reqwest::blocking::Client::builder()
        .user_agent(concat!("Orbit/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(10))
        // The blocking client applies this to each read, so a stalled
        // connection fails while a slow but moving download does not.
        .timeout(read_timeout)
        .build()
        .context("Orbit could not prepare its download connection. Retry the install")
}

pub(super) fn github_releases(client: &reqwest::blocking::Client) -> Result<Vec<GitHubRelease>> {
    client
        .get(format!(
            "https://api.github.com/repos/{REPOSITORY}/releases?per_page=50"
        ))
        .header("Accept", "application/vnd.github+json")
        .send()
        .and_then(|response| response.error_for_status())
        .context(
            "Orbit could not reach GitHub to find Orbit Wine. Check your connection and retry",
        )?
        .json()
        .context("GitHub answered with releases Orbit could not read")
}

pub(super) fn fetch_manifest(
    client: &reqwest::blocking::Client,
    url: &str,
) -> Result<OrbitWineRelease> {
    let release: OrbitWineRelease = client
        .get(url)
        .send()
        .and_then(|response| response.error_for_status())
        .context("Orbit could not download the Orbit Wine release details")?
        .json()
        .context("The Orbit Wine release details could not be read")?;
    validate(&release)?;
    Ok(release)
}

/// The newest Orbit Wine release, read from the repository's releases.
pub fn latest_release() -> Result<OrbitWineRelease> {
    let client = client(Duration::from_secs(30))?;
    let url = manifest_url(&github_releases(&client)?)
        .context("Orbit Wine has not been published yet. Try again later")?;
    fetch_manifest(&client, &url)
}

/// The highest `limit` published releases, highest first. One request per
/// manifest, so `limit` stays small. A release whose manifest cannot be read
/// or fails validation is skipped.
pub fn published_releases(limit: usize) -> Result<Vec<OrbitWineRelease>> {
    let client = client(Duration::from_secs(30))?;
    let urls = manifest_urls(&github_releases(&client)?);
    let mut releases = Vec::new();
    let mut first_error = None;
    for url in urls.iter().take(limit) {
        match fetch_manifest(&client, url) {
            Ok(release) => releases.push(release),
            Err(error) => {
                first_error.get_or_insert(error);
            }
        }
    }
    match first_error {
        Some(error) if releases.is_empty() => Err(error),
        _ => Ok(releases),
    }
}

/// The published release of one Orbit Wine version.
pub fn release_for(version: &str) -> Result<OrbitWineRelease> {
    published_releases(PUBLISHED_LIMIT)?
        .into_iter()
        .find(|release| release.version == version)
        .with_context(|| format!("Orbit Wine {version} is not published"))
}

/// How many published builds Settings offers.
pub const PUBLISHED_LIMIT: usize = 8;

/// The installed Orbit Wine Play would use, and whether its base container is
/// ready, or `None` when there is none.
pub fn status(root: &Path) -> Option<OrbitWineStatus> {
    let loader = super::wine_capabilities::installed_crossover(root)?;
    let version = version_of(&loader)?;
    let container_ready = super::detection::probe(&loader)
        .map(|runtime| super::containers::base_ready(root, &runtime))
        .unwrap_or(false);
    Some(OrbitWineStatus {
        version,
        path: loader.to_string_lossy().into_owned(),
        container_ready,
    })
}

/// Download, check, unpack, probe and register an Orbit Wine release. Only one
/// component install runs at a time (shared with the component store).
pub fn install<F>(
    root: &Path,
    release: &OrbitWineRelease,
    mut progress: F,
) -> Result<OrbitWineStatus>
where
    F: FnMut(SetupProgress),
{
    if !cfg!(target_os = "macos") {
        bail!("Orbit Wine is only available on macOS");
    }
    validate(release)?;
    let name = format!("Orbit Wine {}", release.version);
    if super::wine_capabilities::crossover_at(root, &release.version).is_some() {
        progress(SetupProgress::Ready {
            component: name,
            message: "Already installed".into(),
        });
        return status(root).context("Orbit Wine is installed but Orbit could not read it");
    }
    let _guard = components::INSTALL_LOCK
        .lock()
        .map_err(|_| anyhow::anyhow!("Component setup is already in progress"))?;
    components::ensure_components_root(root)?;
    let wine_root = root.join(super::wine_capabilities::ORBIT_WINE_DIR);
    fs::create_dir_all(&wine_root)?;
    let token = uuid::Uuid::new_v4();
    let archive = wine_root.join(format!(".download-{token}"));
    let staging = wine_root.join(format!(".installing-{token}"));
    let target = wine_root.join(&release.version);
    let result = (|| -> Result<()> {
        download(release, &archive, &name, &mut progress)?;
        progress(SetupProgress::Extracting {
            component: name.clone(),
        });
        fs::create_dir_all(&staging)?;
        unpack(&archive, &release.url, &staging)?;
        components::finalize_staging(&staging, &target)?;
        progress(SetupProgress::Installing {
            component: name.clone(),
        });
        let loader = target.join("Orbit Wine.app/Contents/MacOS/wine");
        let caps = super::wine_capabilities::inspect(&loader)
            .context("The downloaded Orbit Wine has no working Wine loader")?;
        if !caps.crossover_class() {
            bail!("The downloaded Orbit Wine is missing MSync or the D3DMetal hooks");
        }
        register_bundle(&target.join("Orbit Wine.app"));
        Ok(())
    })();
    let _ = fs::remove_file(&archive);
    let _ = fs::remove_dir_all(&staging);
    if let Err(error) = result {
        let _ = fs::remove_dir_all(&target);
        return Err(error);
    }
    let installed = status(root).context("Orbit Wine installed but Orbit could not find it")?;
    progress(SetupProgress::Ready {
        component: name,
        message: format!("Orbit Wine {} is ready", installed.version),
    });
    Ok(installed)
}

/// Streams the archive to `path`, hashing as it goes. The file is large, so
/// it never sits in memory.
fn download<F>(release: &OrbitWineRelease, path: &Path, name: &str, progress: &mut F) -> Result<()>
where
    F: FnMut(SetupProgress),
{
    let client = client(Duration::from_secs(60))?;
    let mut response = client
        .get(&release.url)
        .send()
        .and_then(|response| response.error_for_status())
        .context(
            "Orbit could not start the Orbit Wine download. Check your connection and retry",
        )?;
    let mut file = fs::File::create(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 256 * 1024];
    let mut downloaded = 0u64;
    let step = (release.size / 200).max(1);
    let mut reported = 0u64;
    progress(SetupProgress::Downloading {
        component: name.to_string(),
        downloaded_bytes: 0,
        total_bytes: release.size,
    });
    loop {
        let count = response.read(&mut buffer).with_context(|| {
            format!(
                "The Orbit Wine download stopped after {} MB. You can retry safely",
                downloaded / 1_000_000
            )
        })?;
        if count == 0 {
            break;
        }
        downloaded += count as u64;
        if downloaded > release.size {
            bail!("The Orbit Wine download is larger than published. Retry later");
        }
        hasher.update(&buffer[..count]);
        file.write_all(&buffer[..count])?;
        if downloaded - reported >= step {
            reported = downloaded;
            progress(SetupProgress::Downloading {
                component: name.to_string(),
                downloaded_bytes: downloaded,
                total_bytes: release.size,
            });
        }
    }
    file.flush()?;
    if downloaded != release.size {
        bail!(
            "The Orbit Wine download ended early ({} of {} MB). Retry the install",
            downloaded / 1_000_000,
            release.size / 1_000_000
        );
    }
    progress(SetupProgress::Verifying {
        component: name.to_string(),
    });
    if format!("{:x}", hasher.finalize()) != release.sha256.to_ascii_lowercase() {
        bail!("The Orbit Wine download failed its security check. Try again");
    }
    Ok(())
}

fn unpack(archive: &Path, url: &str, destination: &Path) -> Result<()> {
    let file = fs::File::open(archive)?;
    if url.ends_with(".tar.zst") {
        let decoder = zstd::stream::read::Decoder::new(file).context("Cannot decode Orbit Wine")?;
        components::extract_archive_entries(&mut tar::Archive::new(decoder), destination)
    } else {
        let decoder = xz2::read::XzDecoder::new(file);
        components::extract_archive_entries(&mut tar::Archive::new(decoder), destination)
    }
}

/// Registers the app bundle with LaunchServices so macOS classifies its games
/// for Game Mode, as `scripts/wine/build.sh` does. Best effort.
fn register_bundle(app: &Path) {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new(
            "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
        )
        .arg("-f")
        .arg(app)
        .status();
    }
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

/// Prepares Orbit Wine's base container (the prefix new game containers are
/// cloned from), so a game's first Play does not wait for it.
pub fn prepare_container<F>(root: &Path, progress: F) -> Result<OrbitWineStatus>
where
    F: FnMut(SetupProgress),
{
    let loader = super::wine_capabilities::installed_crossover(root)
        .context("Install Orbit Wine before preparing its container")?;
    prepare_container_at(root, &loader, progress)
}

/// Prepares the base container of one installed Orbit Wine loader.
pub fn prepare_container_at<F>(
    root: &Path,
    loader: &Path,
    mut progress: F,
) -> Result<OrbitWineStatus>
where
    F: FnMut(SetupProgress),
{
    let runtime = super::detection::probe(loader)?;
    let name = "Orbit Wine container".to_string();
    progress(SetupProgress::Installing {
        component: name.clone(),
    });
    let log = super::process::log_file(&super::containers::root_in(root).join("base-setup.log"))?;
    super::containers::prepare_base(root, &runtime, &AtomicBool::new(false), &log)?;
    progress(SetupProgress::Ready {
        component: name,
        message: "The Orbit Wine container is ready".into(),
    });
    status(root).context("Orbit Wine went missing while its container was prepared")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn release(tag: &str, assets: &[&str]) -> GitHubRelease {
        GitHubRelease {
            tag_name: tag.into(),
            body: None,
            published_at: None,
            html_url: None,
            draft: false,
            prerelease: false,
            assets: assets
                .iter()
                .map(|name| GitHubAsset {
                    name: (*name).into(),
                    browser_download_url: format!(
                        "https://github.com/{REPOSITORY}/releases/download/{tag}/{name}"
                    ),
                })
                .collect(),
        }
    }

    fn good() -> OrbitWineRelease {
        OrbitWineRelease {
            version: "26.3.0".into(),
            url: format!(
                "https://github.com/{REPOSITORY}/releases/download/orbit-wine-v26.3.0/orbit-wine-26.3.0.tar.zst"
            ),
            size: 600_000_000,
            sha256: "a".repeat(64),
            sources_url: format!("https://github.com/{REPOSITORY}/releases/tag/orbit-wine-v26.3.0"),
        }
    }

    #[test]
    fn picks_the_newest_published_orbit_wine_release() {
        let mut draft = release("orbit-wine-v26.4.0", &[MANIFEST_ASSET]);
        draft.draft = true;
        let mut beta = release("orbit-wine-v26.4.0-beta", &[MANIFEST_ASSET]);
        beta.prerelease = true;
        let releases = [
            release("v1.2.0", &["Orbit.dmg"]),
            draft,
            beta,
            release("orbit-wine-v26.3.1", &["notes.txt"]),
            release(
                "orbit-wine-v26.3.0",
                &[MANIFEST_ASSET, "orbit-wine-26.3.0.tar.zst"],
            ),
            release("orbit-wine-v26.2.0", &[MANIFEST_ASSET]),
        ];
        assert_eq!(
            manifest_url(&releases).as_deref(),
            Some(
                format!(
                    "https://github.com/{REPOSITORY}/releases/download/orbit-wine-v26.3.0/{MANIFEST_ASSET}"
                )
                .as_str()
            )
        );
        assert_eq!(manifest_url(&[release("v1.2.0", &["Orbit.dmg"])]), None);
    }

    #[test]
    fn picks_the_highest_orbit_wine_version_whatever_the_listing_order() {
        // Regression: the audio and controller fixes shipped as a rebuild of
        // CrossOver 26.3.0. GitHub lists releases by creation date, so an
        // older build re-uploaded later must not win over the rebuild.
        let releases = [
            release("orbit-wine-v26.3.0", &[MANIFEST_ASSET]),
            release("orbit-wine-v26.3.0-2", &[MANIFEST_ASSET]),
            release("orbit-wine-v26.2.0", &[MANIFEST_ASSET]),
        ];
        assert_eq!(
            manifest_url(&releases).as_deref(),
            Some(
                format!(
                    "https://github.com/{REPOSITORY}/releases/download/orbit-wine-v26.3.0-2/{MANIFEST_ASSET}"
                )
                .as_str()
            )
        );
    }

    #[test]
    fn lists_published_manifests_highest_version_first() {
        let releases = [
            release("orbit-wine-v26.3.0", &[MANIFEST_ASSET]),
            release("orbit-wine-v26.3.0-2", &[MANIFEST_ASSET]),
            release("orbit-wine-v26.2.0", &[MANIFEST_ASSET]),
            release("orbit-wine-v26.4.0", &["notes.txt"]),
        ];
        let tags: Vec<String> = manifest_urls(&releases)
            .into_iter()
            .map(|url| url.split('/').rev().nth(1).unwrap().to_string())
            .collect();
        assert_eq!(
            tags,
            [
                "orbit-wine-v26.3.0-2",
                "orbit-wine-v26.3.0",
                "orbit-wine-v26.2.0"
            ]
        );
    }

    #[test]
    fn a_rebuild_of_the_same_crossover_is_an_update() {
        // Regression: 26.3.0 users never got the patched build, because
        // install() treats an equal version as already installed.
        assert!(is_update("26.3.0", "26.3.0-2"));
        assert!(is_update("26.3.0-2", "26.3.0-3"));
        assert!(is_update("26.3.0-2", "26.4.0"));
        assert!(!is_update("26.3.0-2", "26.3.0-2"));
        assert!(!is_update("26.3.0-2", "26.3.0"));
        assert!(!is_update("26.4.0", "26.3.0-2"));
    }

    #[test]
    fn accepts_only_this_repositorys_checked_archives() {
        assert!(validate(&good()).is_ok());
        let mut other_host = good();
        other_host.url = "https://example.com/orbit-wine-26.3.0.tar.zst".into();
        assert!(validate(&other_host).is_err());
        let mut other_repo = good();
        other_repo.url = other_repo.url.replace(REPOSITORY, "someone/orbit");
        assert!(validate(&other_repo).is_err());
        let mut plain_http = good();
        plain_http.url = plain_http.url.replace("https://", "http://");
        assert!(validate(&plain_http).is_err());
        let mut short_hash = good();
        short_hash.sha256 = "abc".into();
        assert!(validate(&short_hash).is_err());
        let mut traversal = good();
        traversal.version = "../26.3.0".into();
        assert!(validate(&traversal).is_err());
        let mut zip = good();
        zip.url = zip.url.replace(".tar.zst", ".zip");
        assert!(validate(&zip).is_err());
        let mut empty = good();
        empty.size = 0;
        assert!(validate(&empty).is_err());
        let mut huge = good();
        huge.size = MAX_ARCHIVE_BYTES + 1;
        assert!(validate(&huge).is_err());
    }

    #[test]
    fn unpacks_the_published_archive_into_the_version_folder_play_reads() {
        let root = std::env::temp_dir().join(format!("orbit-wine-{}", uuid::Uuid::new_v4()));
        let archive = root.join("orbit-wine-26.3.0.tar.zst");
        fs::create_dir_all(&root).unwrap();
        let mut tar = tar::Builder::new(Vec::new());
        let body = b"#!/bin/sh\n";
        let mut header = tar::Header::new_gnu();
        header.set_size(body.len() as u64);
        header.set_mode(0o755);
        header.set_cksum();
        tar.append_data(
            &mut header,
            "26.3.0/Orbit Wine.app/Contents/MacOS/wine",
            &body[..],
        )
        .unwrap();
        let bytes = zstd::encode_all(&tar.into_inner().unwrap()[..], 0).unwrap();
        fs::write(&archive, bytes).unwrap();
        let staging = root.join("staging");
        fs::create_dir_all(&staging).unwrap();
        unpack(&archive, "https://x/orbit-wine-26.3.0.tar.zst", &staging).unwrap();
        let target = root
            .join(super::super::wine_capabilities::ORBIT_WINE_DIR)
            .join("26.3.0");
        components::finalize_staging(&staging, &target).unwrap();
        let loader = target.join("Orbit Wine.app/Contents/MacOS/wine");
        assert!(loader.is_file());
        assert_eq!(version_of(&loader).as_deref(), Some("26.3.0"));
        fs::remove_dir_all(&root).unwrap();
    }

    /// `ORBIT_WINE_ARCHIVE=<dir>/orbit-wine-<v>.tar.zst cargo test -- --ignored
    /// packaged_orbit_wine`: a `scripts/wine/package.sh` archive unpacks with
    /// Orbit's extractor into a Wine that passes Play's probe.
    #[test]
    #[ignore = "needs a packaged Orbit Wine archive"]
    fn packaged_orbit_wine_unpacks_into_a_working_wine() {
        let archive = PathBuf::from(std::env::var("ORBIT_WINE_ARCHIVE").unwrap());
        let root = std::env::temp_dir().join(format!("orbit-wine-{}", uuid::Uuid::new_v4()));
        let staging = root.join("staging");
        fs::create_dir_all(&staging).unwrap();
        unpack(&archive, &archive.to_string_lossy(), &staging).unwrap();
        let version = fs::read_dir(&staging)
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .file_name();
        let target = root
            .join(super::super::wine_capabilities::ORBIT_WINE_DIR)
            .join(&version);
        components::finalize_staging(&staging, &target).unwrap();
        let found = super::super::wine_capabilities::installed_crossover(&root);
        fs::remove_dir_all(&root).unwrap();
        assert!(found.is_some_and(|loader| loader.ends_with("Contents/MacOS/wine")));
    }

    #[test]
    fn reads_the_version_from_the_bundled_loader_path() {
        let loader = Path::new(
            "/x/runtimes/components/orbit-wine/26.3.0/Orbit Wine.app/Contents/MacOS/wine",
        );
        assert_eq!(version_of(loader).as_deref(), Some("26.3.0"));
        let plain = Path::new("/x/runtimes/components/orbit-wine/26.2.1/bin/wine");
        assert_eq!(version_of(plain).as_deref(), Some("26.2.1"));
        assert_eq!(version_of(Path::new("/usr/local/bin/wine")), None);
    }
}
