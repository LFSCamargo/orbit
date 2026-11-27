//! Offering a newer Orbit Wine build when Orbit opens. The offer carries the
//! release's notes for the update dialog. "Keep" remembers the version, so
//! that build is not offered again; a later build is. The notes come from
//! GitHub and are untrusted: control characters are dropped, the length is
//! capped, and the frontend renders them as plain text.
use super::orbit_wine::{self, GitHubRelease, OrbitWineRelease, REPOSITORY, TAG_PREFIX};
use super::wine_capabilities::is_version_name;
use crate::database::GameRepository;
use anyhow::{bail, Result};
use serde::Serialize;
use std::path::Path;
use std::time::Duration;

pub const SKIP_KEY: &str = "orbit-wine-update-skipped-v1";

/// A newer Orbit Wine build than the installed one, for the update dialog.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrbitWineUpdate {
    pub version: String,
    pub installed_version: String,
    pub size_bytes: u64,
    /// Plain-text Markdown release notes.
    pub notes: String,
    pub published_at: Option<String>,
    /// The release page, only when it is on Orbit's own GitHub releases.
    pub release_url: Option<String>,
}

/// The offer for `release` (with its manifest) over the installed version,
/// or `None` when it is not newer, was kept away from, or its manifest does
/// not match its tag.
pub fn offer(
    installed: &str,
    release: &GitHubRelease,
    manifest: &OrbitWineRelease,
    skipped: Option<&str>,
) -> Option<OrbitWineUpdate> {
    let tagged = release.tag_name.strip_prefix(TAG_PREFIX)?;
    if tagged != manifest.version
        || !orbit_wine::is_update(installed, &manifest.version)
        || skipped == Some(manifest.version.as_str())
    {
        return None;
    }
    let own_releases = format!("https://github.com/{REPOSITORY}/releases/");
    Some(OrbitWineUpdate {
        version: manifest.version.clone(),
        installed_version: installed.to_string(),
        size_bytes: manifest.size,
        notes: crate::utils::release_notes::plain_text(release.body.as_deref()),
        published_at: release.published_at.clone(),
        release_url: release
            .html_url
            .clone()
            .filter(|url| url.starts_with(&own_releases)),
    })
}

pub fn skipped(repo: &GameRepository) -> Option<String> {
    repo.get_setting(SKIP_KEY)
        .ok()
        .flatten()
        .and_then(|value| value.as_str().map(str::to_owned))
}

/// Keep the installed build: `version` is not offered again.
pub fn skip(repo: &GameRepository, version: &str) -> Result<()> {
    if !is_version_name(version) {
        bail!("That Orbit Wine version is not valid");
    }
    repo.set_setting(SKIP_KEY, &serde_json::json!(version))
}

/// The update to offer now, or `None` without an installed Orbit Wine
/// (onboarding installs it), when it is current, or when the newest build was
/// kept away from. Two requests: the releases list and one manifest.
pub fn check(repo: &GameRepository, root: &Path) -> Result<Option<OrbitWineUpdate>> {
    let Some(installed) = orbit_wine::status(root) else {
        return Ok(None);
    };
    let client = orbit_wine::client(Duration::from_secs(30))?;
    let releases = orbit_wine::github_releases(&client)?;
    let Some((release, url)) = orbit_wine::ranked(&releases).into_iter().next() else {
        return Ok(None);
    };
    let manifest = orbit_wine::fetch_manifest(&client, &url)?;
    Ok(offer(
        &installed.version,
        release,
        &manifest,
        skipped(repo).as_deref(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn release(tag: &str, body: &str) -> GitHubRelease {
        GitHubRelease {
            tag_name: tag.into(),
            body: Some(body.into()),
            published_at: Some("2026-11-27T20:00:05Z".into()),
            html_url: Some(format!(
                "https://github.com/{REPOSITORY}/releases/tag/{tag}"
            )),
            draft: false,
            prerelease: false,
            assets: Vec::new(),
        }
    }

    fn manifest(version: &str) -> OrbitWineRelease {
        OrbitWineRelease {
            version: version.into(),
            url: String::new(),
            size: 471_415_963,
            sha256: String::new(),
            sources_url: String::new(),
        }
    }

    #[test]
    fn offers_a_newer_build_with_its_notes() {
        let update = offer(
            "26.3.0",
            &release("orbit-wine-v26.3.0-2", "New:\r\n- No more crackling"),
            &manifest("26.3.0-2"),
            None,
        )
        .unwrap();
        assert_eq!(update.version, "26.3.0-2");
        assert_eq!(update.installed_version, "26.3.0");
        assert_eq!(update.size_bytes, 471_415_963);
        assert_eq!(update.notes, "New:\n- No more crackling");
        assert_eq!(
            update.release_url.as_deref(),
            Some(
                format!("https://github.com/{REPOSITORY}/releases/tag/orbit-wine-v26.3.0-2")
                    .as_str()
            )
        );
    }

    #[test]
    fn does_not_offer_a_kept_current_older_or_mismatched_build() {
        let rebuild = release("orbit-wine-v26.3.0-2", "");
        // Regression guard: "Keep" must stop the dialog for that build only.
        assert!(offer("26.3.0", &rebuild, &manifest("26.3.0-2"), Some("26.3.0-2")).is_none());
        assert!(offer("26.3.0", &rebuild, &manifest("26.3.0-2"), Some("26.3.0-1")).is_some());
        assert!(offer("26.3.0-2", &rebuild, &manifest("26.3.0-2"), None).is_none());
        assert!(offer("26.4.0", &rebuild, &manifest("26.3.0-2"), None).is_none());
        assert!(offer("26.3.0", &rebuild, &manifest("26.3.0-3"), None).is_none());
    }

    #[test]
    fn only_orbit_release_pages_are_linked() {
        let mut foreign = release("orbit-wine-v26.3.0-2", "");
        foreign.html_url = Some("https://example.com/phish".into());
        let update = offer("26.3.0", &foreign, &manifest("26.3.0-2"), None).unwrap();
        assert_eq!(update.release_url, None);
    }

    #[test]
    fn keeping_a_build_is_remembered_and_validated() {
        let root = std::env::temp_dir().join(format!("orbit-wine-skip-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let repo = GameRepository::open(&root.join("library.sqlite")).unwrap();
        assert_eq!(skipped(&repo), None);
        assert!(skip(&repo, "../26.3.0").is_err());
        skip(&repo, "26.3.0-2").unwrap();
        assert_eq!(skipped(&repo).as_deref(), Some("26.3.0-2"));
        drop(repo);
        let _ = std::fs::remove_dir_all(root);
    }
}
