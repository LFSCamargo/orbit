//! Which installed Orbit Wine Play uses. With no choice stored, Play follows
//! the newest installed build, so updates apply on their own. Choosing an
//! older build pins it; choosing the newest goes back to following updates.
//! The choice is a version folder name, checked against what is installed, so
//! an invented or removed version never reaches a launch.
use super::orbit_wine::{self, OrbitWineRelease};
use super::wine_capabilities::{self, version_key};
use crate::database::GameRepository;
use anyhow::{anyhow, Result};
use serde::Serialize;
use std::path::{Path, PathBuf};

pub const PIN_KEY: &str = "orbit-wine-version-v1";

/// One Orbit Wine build Settings can offer.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrbitWineVersion {
    pub version: String,
    pub installed: bool,
    /// The build Play uses.
    pub active: bool,
    /// The download size of a published build.
    pub size_bytes: Option<u64>,
}

/// What Settings lists, and why published builds are missing (offline).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrbitWineVersions {
    pub versions: Vec<OrbitWineVersion>,
    pub error: Option<String>,
}

fn pinned(repo: &GameRepository) -> Option<String> {
    repo.get_setting(PIN_KEY)
        .ok()
        .flatten()
        .and_then(|value| value.as_str().map(str::to_owned))
}

/// The Orbit Wine loader Play uses: the chosen build while it is installed and
/// passes the probe, otherwise the newest installed one.
pub fn play_loader(repo: &GameRepository, root: &Path) -> Option<PathBuf> {
    pinned(repo)
        .and_then(|version| wine_capabilities::crossover_at(root, &version))
        .or_else(|| wine_capabilities::installed_crossover(root))
}

/// Make an installed build the one Play uses and return its loader. Choosing
/// the newest installed build clears the pin, so later updates apply.
pub fn select(repo: &GameRepository, root: &Path, version: &str) -> Result<PathBuf> {
    let loader = wine_capabilities::crossover_at(root, version).ok_or_else(|| {
        anyhow!("Orbit Wine {version} is not installed. Install it before choosing it")
    })?;
    let newest = wine_capabilities::installed_crossover(root)
        .and_then(|newest| orbit_wine::version_of(&newest));
    let value = if newest.as_deref() == Some(version) {
        serde_json::Value::Null
    } else {
        serde_json::json!(version)
    };
    repo.set_setting(PIN_KEY, &value)?;
    Ok(loader)
}

/// Published and installed builds, highest first; a build only installed (a
/// local build, or one no longer published) is still listed. O((p + i) log).
pub fn versions(
    published: &[OrbitWineRelease],
    installed: &[String],
    active: Option<&str>,
) -> Vec<OrbitWineVersion> {
    let mut list: Vec<OrbitWineVersion> = published
        .iter()
        .map(|release| OrbitWineVersion {
            version: release.version.clone(),
            installed: installed.contains(&release.version),
            active: active == Some(release.version.as_str()),
            size_bytes: Some(release.size),
        })
        .collect();
    for version in installed {
        if !list.iter().any(|item| &item.version == version) {
            list.push(OrbitWineVersion {
                version: version.clone(),
                installed: true,
                active: active == Some(version.as_str()),
                size_bytes: None,
            });
        }
    }
    list.sort_by_key(|item| std::cmp::Reverse(version_key(&item.version)));
    list
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn fake_orbit_wine(root: &Path, version: &str) -> PathBuf {
        let dist = root.join(wine_capabilities::ORBIT_WINE_DIR).join(version);
        fs::create_dir_all(dist.join("bin")).unwrap();
        fs::create_dir_all(dist.join("lib/wine/x86_64-unix")).unwrap();
        fs::write(dist.join("bin/wine"), b"wine").unwrap();
        fs::write(dist.join("bin/wineserver"), b"WINEMSYNC").unwrap();
        fs::write(
            dist.join("lib/wine/x86_64-unix/ntdll.so"),
            b"CX_APPLEGPTK_LIBD3DSHARED_PATH libd3dshared",
        )
        .unwrap();
        dist.join("bin/wine").canonicalize().unwrap()
    }

    fn release(version: &str) -> OrbitWineRelease {
        OrbitWineRelease {
            version: version.into(),
            url: String::new(),
            size: 471_000_000,
            sha256: String::new(),
            sources_url: String::new(),
        }
    }

    fn loader(repo: &GameRepository, root: &Path) -> Option<PathBuf> {
        play_loader(repo, root).map(|path| path.canonicalize().unwrap())
    }

    #[test]
    fn play_follows_the_newest_build_until_an_older_one_is_chosen() {
        let root = std::env::temp_dir().join(format!("orbit-wine-pick-{}", uuid::Uuid::new_v4()));
        let old = fake_orbit_wine(&root, "26.3.0");
        let new = fake_orbit_wine(&root, "26.3.0-2");
        let repo = GameRepository::open(&root.join("library.sqlite")).unwrap();
        assert_eq!(loader(&repo, &root), Some(new.clone()));

        assert_eq!(
            select(&repo, &root, "26.3.0")
                .unwrap()
                .canonicalize()
                .unwrap(),
            old
        );
        assert_eq!(loader(&repo, &root), Some(old.clone()));
        // A newer build installed later does not override the user's choice.
        fake_orbit_wine(&root, "26.3.0-3");
        assert_eq!(loader(&repo, &root), Some(old));

        // Choosing the newest goes back to following updates.
        select(&repo, &root, "26.3.0-3").unwrap();
        let newest = fake_orbit_wine(&root, "26.3.0-4");
        assert_eq!(loader(&repo, &root), Some(newest));
        drop(repo);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn only_an_installed_build_can_be_chosen() {
        let root = std::env::temp_dir().join(format!("orbit-wine-pick-{}", uuid::Uuid::new_v4()));
        let installed = fake_orbit_wine(&root, "26.3.0");
        let repo = GameRepository::open(&root.join("library.sqlite")).unwrap();
        assert!(select(&repo, &root, "26.4.0").is_err());
        assert!(select(&repo, &root, "../26.3.0").is_err());
        assert!(select(&repo, &root, "").is_err());
        // A pin to a build that was removed falls back to the newest.
        repo.set_setting(PIN_KEY, &serde_json::json!("26.1.0"))
            .unwrap();
        assert_eq!(loader(&repo, &root), Some(installed));
        drop(repo);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn lists_published_and_installed_builds_highest_first() {
        let installed = ["26.3.0".to_string(), "26.2.0-local".to_string()];
        let list = versions(
            &[release("26.3.0"), release("26.3.0-2")],
            &installed,
            Some("26.3.0"),
        );
        let summary: Vec<_> = list
            .iter()
            .map(|item| {
                (
                    item.version.as_str(),
                    item.installed,
                    item.active,
                    item.size_bytes,
                )
            })
            .collect();
        assert_eq!(
            summary,
            [
                ("26.3.0-2", false, false, Some(471_000_000)),
                ("26.3.0", true, true, Some(471_000_000)),
                ("26.2.0-local", true, false, None),
            ]
        );
    }
}
