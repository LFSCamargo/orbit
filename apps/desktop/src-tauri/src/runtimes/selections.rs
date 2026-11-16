//! Which installed component version a launch should use. Installing a version
//! makes it the newest, but the user can keep several versions side by side and
//! pick one. Selections live under one SQLite setting and are validated against
//! the component store, so a stale or invented version string can never reach a
//! launch.
use super::components::{self, InstalledComponent};
use crate::database::GameRepository;
use anyhow::{bail, Result};
use std::{collections::BTreeMap, path::Path};

pub const ACTIVE_COMPONENTS_KEY: &str = "windows-compatibility-active-components-v1";
/// Which catalog row each Compatibility picker is showing. This is separate
/// from the launch selection: two GPTK packages can share one installed
/// version, and an uninstalled row is still a choice the user expects to see
/// after leaving the tab.
pub const COMPONENT_VIEWS_KEY: &str = "windows-compatibility-component-views-v1";

pub type ActiveComponents = BTreeMap<String, String>;

pub fn load(repo: &GameRepository) -> Result<ActiveComponents> {
    match repo.get_setting(ACTIVE_COMPONENTS_KEY)? {
        Some(value) => Ok(serde_json::from_value(value)?),
        None => Ok(ActiveComponents::new()),
    }
}

fn save(repo: &GameRepository, actives: &ActiveComponents) -> Result<()> {
    repo.set_setting(ACTIVE_COMPONENTS_KEY, &serde_json::to_value(actives)?)?;
    Ok(())
}

fn is_selectable(component: &str) -> bool {
    component == "dxvk"
        || component == "dxmt"
        || component == "gptk"
        || component == "vkd3d-proton"
        || component == "zink"
        || component.starts_with("wine-")
}

/// Record the chosen installed version for a component. Anything not present in
/// the component store is rejected, so the UI cannot select a version Orbit
/// would then fail to find at launch.
pub fn set_active(
    repo: &GameRepository,
    root: &Path,
    component: &str,
    version: &str,
) -> Result<ActiveComponents> {
    if !is_selectable(component) {
        bail!("{component} has no version to select. Choose a Wine or graphics component");
    }
    let installed = components::installed_components(root)
        .into_iter()
        .find(|item| item.id == component && item.version == version)
        .ok_or_else(|| {
            anyhow::anyhow!(
                "{component} {version} is not installed. Install it before making it active"
            )
        })?;
    let mut actives = load(repo)?;
    actives.insert(component.into(), installed.version.clone());
    save(repo, &actives)?;
    Ok(actives)
}

pub type ComponentViews = BTreeMap<String, String>;

pub fn load_views(repo: &GameRepository) -> Result<ComponentViews> {
    match repo.get_setting(COMPONENT_VIEWS_KEY)? {
        Some(value) => Ok(serde_json::from_value(value)?),
        None => Ok(ComponentViews::new()),
    }
}

/// Remember the catalog row a Compatibility picker is showing. The value is a
/// display key, never a filesystem path.
pub fn set_view(repo: &GameRepository, group: &str, key: &str) -> Result<ComponentViews> {
    if !is_view_group(group) {
        bail!("{group} is not a compatibility row");
    }
    if key.is_empty() || key.len() > 512 || key.chars().any(|character| character.is_control()) {
        bail!("Choose a version from the list");
    }
    let mut views = load_views(repo)?;
    views.insert(group.into(), key.into());
    repo.set_setting(COMPONENT_VIEWS_KEY, &serde_json::to_value(&views)?)?;
    Ok(views)
}

fn is_view_group(group: &str) -> bool {
    matches!(group, "wine" | "graphics")
        || (group.len() <= 32
            && group.chars().all(|character| {
                character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-'
            }))
}

pub fn clear_active(repo: &GameRepository, component: &str) -> Result<ActiveComponents> {
    let mut actives = load(repo)?;
    actives.remove(component);
    save(repo, &actives)?;
    Ok(actives)
}

/// The component to use for one id: the stored selection when it is still
/// installed, otherwise the most recently installed version.
fn pick(
    installed: &[InstalledComponent],
    actives: &ActiveComponents,
    component: &str,
) -> Option<InstalledComponent> {
    if let Some(version) = actives.get(component) {
        if let Some(found) = installed
            .iter()
            .find(|item| item.id == component && &item.version == version)
        {
            return Some(found.clone());
        }
    }
    installed
        .iter()
        .filter(|item| item.id == component)
        .max_by(|a, b| a.installed_at.cmp(&b.installed_at))
        .cloned()
}

/// Resolve every stored selection against the component store once per launch.
/// Returns `component id -> payload path`; a stale selection silently falls
/// back to the newest installed version instead of failing the launch.
pub fn resolve(root: &Path, actives: &ActiveComponents) -> BTreeMap<String, String> {
    let installed = components::installed_components(root);
    let mut paths = BTreeMap::new();
    for component in [
        "dxvk",
        "moltenvk",
        "dxmt",
        "gptk",
        "vkd3d-proton",
        "zink",
        "wine-stable",
        "wine-devel",
        "wine-staging",
    ] {
        if let Some(found) = pick(&installed, actives, component) {
            paths.insert(component.into(), found.path.clone());
        }
    }
    paths
}

/// The Wine payload to launch with, honouring a selection on any Wine track and
/// falling back to the newest installed Wine build.
pub fn active_wine_path(root: &Path, actives: &ActiveComponents) -> Option<String> {
    let installed = components::installed_components(root);
    let mut wines: Vec<_> = installed
        .iter()
        .filter(|item| item.is_wine())
        .cloned()
        .collect();
    for (component, version) in actives {
        if component.starts_with("wine-") {
            if let Some(found) = wines
                .iter()
                .find(|item| &item.id == component && &item.version == version)
            {
                return Some(found.path.clone());
            }
        }
    }
    wines.sort_by(|a, b| b.installed_at.cmp(&a.installed_at));
    wines.first().map(|item| item.path.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtimes::components::ComponentKind;
    use std::fs;

    fn temp_root() -> std::path::PathBuf {
        std::env::temp_dir().join(format!("orbit-active-{}", uuid::Uuid::new_v4()))
    }

    fn write_installed(root: &Path, id: &str, version: &str, installed_at: &str) {
        let dir = components::components_root(root).join(id).join(version);
        fs::create_dir_all(&dir).unwrap();
        let component = InstalledComponent {
            id: id.into(),
            version: version.into(),
            kind: ComponentKind::Gptk,
            path: dir.to_string_lossy().into_owned(),
            installed_at: installed_at.into(),
        };
        fs::write(
            dir.join("orbit-component.json"),
            serde_json::to_vec(&component).unwrap(),
        )
        .unwrap();
    }

    #[test]
    fn selection_round_trips_and_rejects_uninstalled_versions() {
        let root = temp_root();
        fs::create_dir_all(&root).unwrap();
        write_installed(&root, "gptk", "4.0 beta 3", "2026-11-12T00:00:00Z");
        let database = root.join("library.sqlite");
        let repo = GameRepository::open(&database).unwrap();
        assert!(set_active(&repo, &root, "gptk", "never installed").is_err());
        assert!(set_active(&repo, &root, "moltenvk", "whatever").is_err());
        set_active(&repo, &root, "gptk", "4.0 beta 3").unwrap();
        assert_eq!(load(&repo).unwrap().get("gptk").unwrap(), "4.0 beta 3");
        drop(repo);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn dxvk_launch_resolves_its_installed_moltenvk_dependency() {
        let root = temp_root();
        write_installed(&root, "dxvk", "1", "2026-11-12T00:00:00Z");
        write_installed(&root, "moltenvk", "1", "2026-11-12T00:00:00Z");
        let paths = resolve(&root, &ActiveComponents::new());
        let settings = super::super::settings::CompatibilitySettings {
            graphics: super::super::settings::GraphicsBackend::Dxvk,
            ..Default::default()
        };
        settings.validate_launchable(&paths).unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn resolve_prefers_the_selection_over_the_newest_install() {
        let root = temp_root();
        fs::create_dir_all(&root).unwrap();
        write_installed(&root, "gptk", "4.0 beta 3", "2026-11-12T00:00:00Z");
        write_installed(&root, "gptk", "3.0-3", "2026-11-01T00:00:00Z");
        let mut actives = ActiveComponents::new();
        actives.insert("gptk".into(), "3.0-3".into());
        let paths = resolve(&root, &actives);
        assert!(paths["gptk"].ends_with("gptk/3.0-3"));
        // Without a selection the newest installed version wins.
        let paths = resolve(&root, &ActiveComponents::new());
        assert!(paths["gptk"].ends_with("gptk/4.0 beta 3"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_selected_component_version_is_the_one_the_launch_profile_resolves() {
        use crate::runtimes::settings::{self, CompatibilitySettings};
        use crate::runtimes::WineProfile;

        let root = temp_root();
        fs::create_dir_all(&root).unwrap();
        write_installed(&root, "gptk", "4.0 beta 3", "2026-11-12T00:00:00Z");
        write_installed(&root, "gptk", "3.0-3", "2026-11-13T00:00:00Z");
        let repo = GameRepository::open(&root.join("library.sqlite")).unwrap();
        // D3DMetal is only selectable because a GPTK version is installed.
        settings::save_global_in(
            &root,
            &repo,
            &CompatibilitySettings {
                graphics: settings::GraphicsBackend::D3dmetal,
                ..Default::default()
            },
        )
        .unwrap();

        // Newest installed would be 3.0-3; the stored choice must win.
        set_active(&repo, &root, "gptk", "4.0 beta 3").unwrap();
        let resolved = settings::resolve_profile_in(
            &root,
            &repo,
            &WineProfile {
                compatibility: Default::default(),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(resolved.selections["gptk"].ends_with("gptk/4.0 beta 3"));

        // With no choice stored, launch resolves to the newest installed version.
        clear_active(&repo, "gptk").unwrap();
        let resolved = settings::resolve_profile_in(
            &root,
            &repo,
            &WineProfile {
                compatibility: Default::default(),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(resolved.selections["gptk"].ends_with("gptk/3.0-3"));
        drop(repo);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_picker_row_survives_reopen_and_rejects_a_blank_choice() {
        let root = temp_root();
        fs::create_dir_all(&root).unwrap();
        let repo = GameRepository::open(&root.join("library.sqlite")).unwrap();
        let key = "[\"gptk\",\"4.0 beta 3 · Apple download (evaluation)\"]";
        assert!(set_view(&repo, "graphics", "").is_err());
        assert!(set_view(&repo, "../gptk", key).is_err());
        let views = set_view(&repo, "graphics", key).unwrap();
        assert_eq!(views.get("graphics").unwrap(), key);
        drop(repo);
        let repo = GameRepository::open(&root.join("library.sqlite")).unwrap();
        assert_eq!(load_views(&repo).unwrap().get("graphics").unwrap(), key);
        drop(repo);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_stale_selection_falls_back_instead_of_failing_the_launch() {
        let root = temp_root();
        fs::create_dir_all(&root).unwrap();
        write_installed(&root, "gptk", "3.0-3", "2026-11-01T00:00:00Z");
        let mut actives = ActiveComponents::new();
        actives.insert("gptk".into(), "9.9 deleted".into());
        let paths = resolve(&root, &actives);
        assert!(paths["gptk"].ends_with("gptk/3.0-3"));
        let _ = fs::remove_dir_all(root);
    }
}
