//! Online component version catalogs from public release feeds. Release metadata
//! is untrusted: only bounded fields are parsed and no asset is executed here.
use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

const PAGE_SIZE: usize = 100;
const MAX_PAGES: usize = 10;
const CACHE_LIFETIME: Duration = Duration::from_secs(6 * 60 * 60);
const MAX_RESPONSE_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseAsset {
    pub name: String,
    pub url: String,
    pub size: u64,
    pub sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentVersion {
    pub version: String,
    pub prerelease: bool,
    pub asset: ReleaseAsset,
    /// Homebrew formula to install when this version is not a plain download.
    pub homebrew_formula: Option<super::homebrew::GptkFormula>,
    /// A local Apple GPTK package that Orbit can import without downloading.
    pub local_package: Option<super::gptk_local::LocalGptkPackage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogComponent {
    pub id: String,
    pub name: String,
    pub technology: String,
    pub source_url: String,
    pub distribution: String,
    pub versions: Vec<ComponentVersion>,
    /// Whether Orbit can download and install this component directly.
    pub downloadable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityCatalog {
    pub components: Vec<CatalogComponent>,
    pub fetched_at: String,
    pub warnings: Vec<String>,
}

struct CachedCatalog {
    fetched: Instant,
    catalog: CompatibilityCatalog,
}

static CACHE: tokio::sync::Mutex<Option<CachedCatalog>> = tokio::sync::Mutex::const_new(None);

#[derive(Debug, Clone, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
    #[serde(default)]
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Clone, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    digest: Option<String>,
}

fn asset(asset: &GitHubAsset) -> ReleaseAsset {
    ReleaseAsset {
        name: asset.name.clone(),
        url: asset.browser_download_url.clone(),
        size: asset.size,
        sha256: asset
            .digest
            .as_deref()
            .and_then(|digest| digest.strip_prefix("sha256:"))
            .map(str::to_owned),
    }
}

fn compatible_versions(
    releases: Vec<GitHubRelease>,
    select: impl Fn(&GitHubAsset) -> bool,
) -> Vec<ComponentVersion> {
    releases
        .into_iter()
        .filter(|release| !release.draft)
        .filter_map(|release| {
            let asset = release.assets.iter().find(|asset| select(asset))?;
            Some(ComponentVersion {
                version: release.tag_name,
                prerelease: release.prerelease,
                asset: self::asset(asset),
                homebrew_formula: None,
                local_package: None,
            })
        })
        .collect()
}

async fn fetch_page(
    client: &reqwest::Client,
    repo: &str,
    page: usize,
) -> Result<Vec<GitHubRelease>> {
    let mut response = client
        .get(format!(
            "https://api.github.com/repos/{repo}/releases?per_page={PAGE_SIZE}&page={page}"
        ))
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(anyhow::Error::msg)?;
    if !response.status().is_success() {
        bail!("GitHub returned HTTP {}", response.status());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(anyhow::Error::msg)? {
        if bytes.len() + chunk.len() > MAX_RESPONSE_BYTES {
            bail!("Release catalog exceeded the response size limit");
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(anyhow::Error::msg)
}

async fn fetch_releases(repo: &'static str) -> Result<Vec<GitHubRelease>> {
    let client = crate::services::http::orbit_client().map_err(anyhow::Error::msg)?;
    let mut releases = Vec::new();
    // Bounded pagination covers up to 1,000 public releases without an
    // unbounded query or an indefinite loop.
    for page in 1..=MAX_PAGES {
        let mut page_releases = fetch_page(&client, repo, page).await?;
        let count = page_releases.len();
        releases.append(&mut page_releases);
        if count < PAGE_SIZE {
            break;
        }
    }
    Ok(releases)
}

fn component(
    id: &str,
    name: &str,
    technology: &str,
    source_url: &str,
    distribution: &str,
    versions: Vec<ComponentVersion>,
    downloadable: bool,
) -> CatalogComponent {
    CatalogComponent {
        id: id.into(),
        name: name.into(),
        technology: technology.into(),
        source_url: source_url.into(),
        distribution: distribution.into(),
        versions,
        downloadable,
    }
}

async fn wine_components() -> Result<Vec<CatalogComponent>> {
    let releases = fetch_releases("Gcenx/macOS_Wine_builds").await?;
    let source = "https://github.com/Gcenx/macOS_Wine_builds/releases";
    Ok(["stable", "devel", "staging"]
        .into_iter()
        .map(|track| {
            let versions = compatible_versions(releases.clone(), |asset| {
                asset.name.starts_with(&format!("wine-{track}-"))
                    && asset.name.ends_with("-osx64.tar.xz")
            });
            let title = match track {
                "stable" => "Stable",
                "devel" => "Development",
                _ => "Staging",
            };
            component(
                &format!("wine-{track}"),
                &format!("Wine {title}"),
                "Wine",
                source,
                "Official Gcenx builds",
                versions,
                true,
            )
        })
        .collect())
}

async fn dxvk_component() -> Result<CatalogComponent> {
    let releases = fetch_releases("Gcenx/DXVK-macOS").await?;
    Ok(component(
        "dxvk",
        "DirectX 10/11 graphics",
        "DXVK-macOS",
        "https://github.com/Gcenx/DXVK-macOS/releases",
        "Official Gcenx builds",
        compatible_versions(releases, |asset| {
            asset.name.ends_with(".tar.gz") && !asset.name.contains("builtin")
        }),
        true,
    ))
}

async fn dxmt_component() -> Result<CatalogComponent> {
    let releases = fetch_releases("3Shain/dxmt").await?;
    Ok(component(
        "dxmt",
        "DirectX 11 graphics",
        "DXMT",
        "https://github.com/3Shain/dxmt/releases",
        "Official 3Shain builds",
        compatible_versions(releases, |asset| asset.name.ends_with(".tar.gz")),
        true,
    ))
}

async fn moltenvk_component() -> Result<CatalogComponent> {
    let releases = fetch_releases("KhronosGroup/MoltenVK").await?;
    Ok(component(
        "moltenvk",
        "Vulkan on Metal",
        "MoltenVK",
        "https://github.com/KhronosGroup/MoltenVK/releases",
        "Official Khronos builds",
        compatible_versions(releases, |asset| asset.name == "MoltenVK-macos.tar"),
        true,
    ))
}

async fn gptk_component() -> Result<CatalogComponent> {
    // Versioned GPTK installs across three legitimate sources:
    // 1. Apple's official Homebrew formula: only Apple's current build.
    // 2. Community binary releases (1.1 through 3.0-3 plus betas) with
    //    GitHub-published SHA-256 digests.
    // 3. Apple 3.x/4.x packages the user already downloaded with their
    //    Apple ID (typically via GameHub or the Apple Developer site), detected
    //    locally and imported with license documents preserved.
    let mut versions = Vec::new();
    let formulae = tokio::task::spawn_blocking(super::homebrew::gptk_formulae)
        .await
        .unwrap_or_default();
    for formula in formulae {
        versions.push(ComponentVersion {
            version: format!("{} · Apple official via Homebrew", formula.version),
            prerelease: false,
            asset: ReleaseAsset {
                name: String::new(),
                url: String::new(),
                size: 0,
                sha256: None,
            },
            homebrew_formula: Some(formula),
            local_package: None,
        });
    }
    let releases = fetch_releases("Gcenx/game-porting-toolkit").await?;
    versions.extend(compatible_versions(releases, |asset| {
        asset.name.starts_with("game-porting-toolkit-") && asset.name.ends_with(".tar.xz")
    }));
    let locals = tokio::task::spawn_blocking(super::gptk_local::scan_local_packages)
        .await
        .unwrap_or_default();
    for package in locals {
        versions.push(ComponentVersion {
            version: format!("{} · Apple download ({})", package.version, package.kind),
            prerelease: package.version.to_ascii_lowercase().contains("beta"),
            asset: ReleaseAsset {
                name: package.file.clone(),
                url: String::new(),
                size: package.size_bytes,
                sha256: None,
            },
            homebrew_formula: None,
            local_package: Some(package),
        });
    }
    Ok(component(
        "gptk",
        "DirectX 11/12 graphics",
        "Apple GPTK",
        "https://github.com/Gcenx/game-porting-toolkit/releases",
        "Community packages · Apple license required",
        versions,
        true,
    ))
}

pub async fn catalog(force_refresh: bool) -> CompatibilityCatalog {
    if !force_refresh {
        if let Some(cached) = CACHE.lock().await.as_ref() {
            if cached.fetched.elapsed() < CACHE_LIFETIME {
                return cached.catalog.clone();
            }
        }
    }
    let (wine, dxvk, dxmt, moltenvk, gptk) = tokio::join!(
        wine_components(),
        dxvk_component(),
        dxmt_component(),
        moltenvk_component(),
        gptk_component(),
    );
    let mut components = Vec::new();
    let mut warnings = Vec::new();
    let results = [
        ("Wine", wine),
        ("DXVK-macOS", dxvk.map(|entry| vec![entry])),
        ("DXMT", dxmt.map(|entry| vec![entry])),
        ("MoltenVK", moltenvk.map(|entry| vec![entry])),
        ("Apple GPTK", gptk.map(|entry| vec![entry])),
    ];
    for (name, result) in results {
        match result {
            Ok(mut entries) => components.append(&mut entries),
            Err(error) => warnings.push(format!("{name}: {error:#}")),
        }
    }
    let catalog = CompatibilityCatalog {
        components,
        fetched_at: chrono::Utc::now().to_rfc3339(),
        warnings,
    };
    *CACHE.lock().await = Some(CachedCatalog {
        fetched: Instant::now(),
        catalog: catalog.clone(),
    });
    catalog
}

#[cfg(test)]
mod tests {
    use super::*;

    fn releases() -> Vec<GitHubRelease> {
        serde_json::from_value(serde_json::json!([
            {
                "tag_name": "v2.0-beta",
                "prerelease": true,
                "assets": [{
                    "name": "component-builtin.tar.gz",
                    "browser_download_url": "https://example.com/builtin",
                    "size": 20
                }, {
                    "name": "component.tar.gz",
                    "browser_download_url": "https://example.com/component",
                    "size": 10,
                    "digest": "sha256:abc"
                }]
            },
            {
                "tag_name": "v1.0",
                "draft": true,
                "assets": [{
                    "name": "component.tar.gz",
                    "browser_download_url": "https://example.com/draft",
                    "size": 10
                }]
            }
        ]))
        .unwrap()
    }

    #[tokio::test]
    #[ignore = "queries the live public component release feeds"]
    async fn real_online_catalog_contains_all_components() {
        let catalog = catalog(true).await;
        for id in [
            "wine-stable",
            "wine-devel",
            "wine-staging",
            "dxvk",
            "dxmt",
            "moltenvk",
            "gptk",
        ] {
            let component = catalog
                .components
                .iter()
                .find(|component| component.id == id);
            assert!(
                component.is_some_and(|component| !component.versions.is_empty()),
                "missing {id}: {:?}",
                catalog.warnings
            );
        }
        assert!(
            catalog
                .components
                .iter()
                .find(|component| component.id == "dxmt")
                .unwrap()
                .versions
                .len()
                > 3
        );
    }

    #[test]
    fn parses_all_public_prereleases_and_skips_drafts_and_builtin_assets() {
        let versions = compatible_versions(releases(), |asset| {
            asset.name.ends_with(".tar.gz") && !asset.name.contains("builtin")
        });
        assert_eq!(versions.len(), 1);
        assert_eq!(versions[0].version, "v2.0-beta");
        assert!(versions[0].prerelease);
        assert_eq!(versions[0].asset.sha256.as_deref(), Some("abc"));
    }

    #[test]
    fn ignores_unrelated_fields_and_missing_digest() {
        let versions = compatible_versions(releases(), |asset| asset.name.contains("builtin"));
        assert_eq!(versions[0].asset.sha256, None);
    }
}
