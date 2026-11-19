//! Remove component entries that only pointed into the retired GameHub engine.
//! Each entry is Orbit's own manifest folder; the payload it referenced is
//! never touched. Active selections that used a removed version are cleared.
use super::{components, selections};
use crate::database::GameRepository;
use std::{fs, path::Path};

const RETIRED_ROOTS: [&str; 2] = ["/com.gamemac.www/", "/GameHub.app/"];

pub fn remove_in(root: &Path, repo: &GameRepository) -> usize {
    let mut removed = 0;
    let actives = selections::load(repo).unwrap_or_default();
    for item in components::installed_components(root) {
        if !RETIRED_ROOTS
            .iter()
            .any(|needle| item.path.contains(needle))
        {
            continue;
        }
        let dir = components::component_dir(root, &item.id, &item.version);
        // Only a pointer folder (the manifest alone) is ever deleted.
        let only_manifest = fs::read_dir(&dir)
            .map(|entries| {
                entries
                    .flatten()
                    .all(|entry| entry.file_name() == "orbit-component.json")
            })
            .unwrap_or(false);
        if !only_manifest || fs::remove_dir_all(&dir).is_err() {
            continue;
        }
        removed += 1;
        if actives.get(&item.id) == Some(&item.version) {
            let _ = selections::clear_active(repo, &item.id);
        }
    }
    removed
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtimes::components::{write_manifest, ComponentKind, InstalledComponent};

    fn manifest(root: &Path, id: &str, version: &str, path: &str, kind: ComponentKind) {
        let dir = components::component_dir(root, id, version);
        fs::create_dir_all(&dir).unwrap();
        write_manifest(
            &dir,
            &InstalledComponent {
                id: id.into(),
                version: version.into(),
                kind,
                path: path.into(),
                installed_at: "now".into(),
            },
        )
        .unwrap();
    }

    #[test]
    fn only_retired_pointer_folders_are_removed_and_their_selection_cleared() {
        let root = std::env::temp_dir().join(format!("orbit-retired-{}", uuid::Uuid::new_v4()));
        let repo = GameRepository::open(&root.join("orbit.sqlite3")).unwrap();
        let retired = "/Users/me/Library/Application Support/com.gamemac.www/wine-engine/downloads/gptk-4.0-2";
        manifest(&root, "gptk", "gptk-4.0-2", retired, ComponentKind::Gptk);
        manifest(&root, "dxvk", "2.6", "/orbit/dxvk/2.6", ComponentKind::Dxvk);
        // A retired path with real payload files beside the manifest is kept.
        manifest(&root, "dxmt", "v0.80", retired, ComponentKind::Dxmt);
        fs::write(
            components::component_dir(&root, "dxmt", "v0.80").join("d3d11.dll"),
            b"x",
        )
        .unwrap();
        repo.set_setting(
            selections::ACTIVE_COMPONENTS_KEY,
            &serde_json::json!({"gptk": "gptk-4.0-2", "dxvk": "2.6"}),
        )
        .unwrap();

        assert_eq!(remove_in(&root, &repo), 1);
        assert!(!components::component_dir(&root, "gptk", "gptk-4.0-2").exists());
        assert!(components::component_dir(&root, "dxvk", "2.6").exists());
        assert!(components::component_dir(&root, "dxmt", "v0.80").exists());
        let actives = selections::load(&repo).unwrap();
        assert!(!actives.contains_key("gptk"));
        assert_eq!(actives.get("dxvk").map(String::as_str), Some("2.6"));
        assert_eq!(remove_in(&root, &repo), 0, "idempotent");
        drop(repo);
        let _ = fs::remove_dir_all(root);
    }
}
