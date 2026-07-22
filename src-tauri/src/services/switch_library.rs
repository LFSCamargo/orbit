use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

use crate::database::GameRepository;
use crate::models::{
    GameProvider, LaunchConfiguration, SwitchContentKind, SwitchLibraryScan, SwitchRomEntry,
    SwitchTitleGroup,
};
use crate::utils::filenames::{
    classify_switch_content, extract_switch_dlc_name, has_switch_dlc_keywords,
    is_switch_application_title_id, is_switch_patch_title_id, normalize_switch_group_title,
    parse_switch_filename, switch_application_id_from_title_id, switch_rom_stem,
};
use crate::utils::paths::{canonical_import_path, is_macos_metadata_file, resolve_launch_file_path};
use crate::utils::size::path_size_bytes;

/// Scan ROM folders inferred from Astris games already stored in SQLite.
pub fn scan_switch_library_from_library(repo: &GameRepository) -> Result<SwitchLibraryScan, String> {
    let folders = discover_switch_rom_folders(repo);
    scan_switch_library_folders(repo, &folders)
}

pub fn scan_switch_library(
    repo: &GameRepository,
    folder: &Path,
) -> Result<SwitchLibraryScan, String> {
    scan_switch_library_folders(repo, &[folder.to_path_buf()])
}

pub fn discover_switch_rom_folders(repo: &GameRepository) -> Vec<PathBuf> {
    let mut folders = HashSet::new();

    for game in repo.list_games().unwrap_or_default() {
        if game.provider != GameProvider::Astris {
            continue;
        }

        let LaunchConfiguration::OpenFile { file_path, .. } = &game.launch_config else {
            continue;
        };

        let resolved = resolve_launch_file_path(Path::new(file_path));
        if let Some(parent) = resolved.parent() {
            if parent.is_dir() {
                folders.insert(canonical_import_path(parent));
            }
        }
    }

    let mut folders: Vec<PathBuf> = folders.into_iter().collect();
    folders.sort_by(|a, b| a.to_string_lossy().cmp(&b.to_string_lossy()));
    folders
}

pub fn scan_switch_library_folders(
    repo: &GameRepository,
    folders: &[PathBuf],
) -> Result<SwitchLibraryScan, String> {
    let library_ids = linked_astris_games(repo);
    let mut groups: HashMap<String, SwitchTitleGroup> = HashMap::new();
    let mut title_aliases: HashMap<String, String> = HashMap::new();
    let mut total_files = 0usize;
    let mut scanned_folders = Vec::new();

    for folder in folders {
        if !folder.exists() || !folder.is_dir() {
            continue;
        }

        scanned_folders.push(canonical_import_path(folder).to_string_lossy().to_string());
        total_files += ingest_folder(
            folder,
            &library_ids,
            &mut groups,
            &mut title_aliases,
        )?;
    }

    let mut groups: Vec<SwitchTitleGroup> = groups.into_values().collect();
    for group in &mut groups {
        group.updates.sort_by(|a, b| {
            version_sort_key(&a.version).cmp(&version_sort_key(&b.version))
        });
        group.dlcs.sort_by(|a, b| a.label.cmp(&b.label));
        group.extras.sort_by(|a, b| a.label.cmp(&b.label));
        if group.display_title.is_empty() {
            group.display_title = group
                .base
                .as_ref()
                .map(|entry| entry.label.clone())
                .or_else(|| group.updates.first().map(|entry| entry.label.clone()))
                .unwrap_or_else(|| "Unknown title".into());
        }
    }
    groups.sort_by(|a, b| a.display_title.to_lowercase().cmp(&b.display_title.to_lowercase()));

    Ok(SwitchLibraryScan {
        folders: scanned_folders,
        groups,
        total_files,
    })
}

fn ingest_folder(
    folder: &Path,
    library_ids: &HashMap<String, String>,
    groups: &mut HashMap<String, SwitchTitleGroup>,
    title_aliases: &mut HashMap<String, String>,
) -> Result<usize, String> {
    let mut total_files = 0usize;

    for entry in WalkDir::new(folder).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_file() || is_macos_metadata_file(path) {
            continue;
        }

        let ext = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if ext != "nsp" && ext != "xci" {
            continue;
        }

        total_files += 1;
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string();
        let original_stem = switch_rom_stem(path).unwrap_or_default();
        let parsed = parse_switch_filename(&file_name);
        let kind = inventory_kind(&parsed, &original_stem);
        let path_string = canonical_import_path(path).to_string_lossy().to_string();
        let title_id = parsed.title_id.clone();
        let in_library = title_id
            .as_ref()
            .and_then(|id| library_ids.get(id))
            .is_some()
            || title_id
                .as_ref()
                .and_then(|id| switch_application_id_from_title_id(id))
                .and_then(|app_id| library_ids.get(&app_id).cloned())
                .is_some();

        let rom = SwitchRomEntry {
            path: path_string,
            file_name: file_name.clone(),
            label: switch_rom_label(&original_stem, &parsed, &kind),
            title_id: title_id.clone(),
            version: parsed.version.clone(),
            kind: kind.clone(),
            size_bytes: path_size_bytes(path),
            in_library,
        };

        let group_key = resolve_group_key(&kind, &parsed, title_aliases);
        if kind == SwitchContentKind::Base {
            if let Some(id) = &title_id {
                let normalized = normalize_switch_group_title(&parsed.title).to_ascii_lowercase();
                title_aliases.insert(normalized, id.clone());
            }
        }

        let group = groups.entry(group_key.clone()).or_insert_with(|| SwitchTitleGroup {
            group_key: group_key.clone(),
            display_title: normalize_switch_group_title(&parsed.title),
            base_title_id: None,
            linked_game_id: title_id
                .as_ref()
                .and_then(|id| library_ids.get(id).cloned()),
            base: None,
            updates: Vec::new(),
            dlcs: Vec::new(),
            extras: Vec::new(),
        });

        if group.linked_game_id.is_none() {
            group.linked_game_id = title_id
                .as_ref()
                .and_then(|id| library_ids.get(id).cloned())
                .or_else(|| {
                    title_id.as_ref().and_then(|id| {
                        switch_application_id_from_title_id(id)
                            .and_then(|app_id| library_ids.get(&app_id).cloned())
                    })
                });
        }

        merge_rom_into_group(group, rom, kind);
    }

    Ok(total_files)
}

fn merge_rom_into_group(
    group: &mut SwitchTitleGroup,
    rom: SwitchRomEntry,
    kind: SwitchContentKind,
) {
    let path = rom.path.clone();

    match kind {
        SwitchContentKind::Base => {
            group.base_title_id = rom.title_id.clone();
            if group
                .base
                .as_ref()
                .map(|existing| existing.size_bytes.unwrap_or(0))
                .unwrap_or(0)
                <= rom.size_bytes.unwrap_or(0)
            {
                group.display_title = rom.label.clone();
                group.base = Some(rom);
            }
        }
        SwitchContentKind::Update => push_unique(&mut group.updates, rom, &path),
        SwitchContentKind::Dlc => push_unique(&mut group.dlcs, rom, &path),
        SwitchContentKind::Unknown => push_unique(&mut group.extras, rom, &path),
    }
}

fn push_unique(entries: &mut Vec<SwitchRomEntry>, rom: SwitchRomEntry, path: &str) {
    if entries.iter().any(|entry| entry.path == path) {
        return;
    }
    entries.push(rom);
}

fn linked_astris_games(repo: &GameRepository) -> HashMap<String, String> {
    repo.list_games()
        .unwrap_or_default()
        .into_iter()
        .filter(|game| game.provider == GameProvider::Astris)
        .filter_map(|game| game.source_id.map(|source_id| (source_id, game.id)))
        .collect()
}

fn switch_rom_label(
    original_stem: &str,
    parsed: &crate::utils::filenames::ParsedSwitchFilename,
    kind: &SwitchContentKind,
) -> String {
    if *kind == SwitchContentKind::Dlc {
        if let Some(name) = extract_switch_dlc_name(original_stem) {
            return name;
        }
    }
    parsed.title.clone()
}

fn inventory_kind(
    parsed: &crate::utils::filenames::ParsedSwitchFilename,
    original_stem: &str,
) -> SwitchContentKind {
    let content = classify_switch_content(parsed);
    if has_switch_dlc_keywords(original_stem) || content == "dlc" {
        return SwitchContentKind::Dlc;
    }
    if content == "update" {
        return SwitchContentKind::Update;
    }
    if let Some(title_id) = parsed.title_id.as_deref() {
        if is_switch_patch_title_id(title_id) {
            return SwitchContentKind::Update;
        }
        if is_switch_application_title_id(title_id) && content == "base" {
            return SwitchContentKind::Base;
        }
    }
    SwitchContentKind::Unknown
}

fn resolve_group_key(
    kind: &SwitchContentKind,
    parsed: &crate::utils::filenames::ParsedSwitchFilename,
    title_aliases: &HashMap<String, String>,
) -> String {
    if let Some(title_id) = &parsed.title_id {
        if *kind == SwitchContentKind::Base {
            return title_id.clone();
        }
        if *kind == SwitchContentKind::Update {
            if let Some(app_id) = switch_application_id_from_title_id(title_id) {
                return app_id;
            }
        }
    }

    let normalized = normalize_switch_group_title(&parsed.title).to_ascii_lowercase();
    if let Some(existing) = title_aliases.get(&normalized) {
        return existing.clone();
    }

    format!("title:{normalized}")
}

fn version_sort_key(version: &Option<String>) -> u64 {
    version
        .as_ref()
        .and_then(|value| {
            value
                .trim_start_matches(['v', 'V'])
                .parse::<u64>()
                .ok()
        })
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{GamePlatform, GameProvider, LaunchConfiguration};
    use std::fs;
    use crate::utils::filenames::parse_switch_filename;
    use std::io::Write;

    #[test]
    fn discovers_parent_folder_from_library_paths() {
        let dir = std::env::temp_dir().join(format!("orbit-switch-disc-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let rom = dir.join("Game [0100F7E00C70E000][v0].nsp");
        fs::File::create(&rom).unwrap().write_all(b"x").unwrap();

        let repo = GameRepository::open_in_memory().expect("in-memory db");
        repo.create_game(crate::models::CreateGameRequest {
            title: "Game".into(),
            description: None,
            provider: GameProvider::Astris,
            platform: GamePlatform::NintendoSwitch,
            launch_config: LaunchConfiguration::OpenFile {
                file_path: rom.to_string_lossy().into(),
                application_path: None,
            },
            artwork: None,
            install_size_bytes: None,
        })
        .unwrap();

        let folders = discover_switch_rom_folders(&repo);
        assert_eq!(folders.len(), 1);
        assert_eq!(folders[0], canonical_import_path(&dir));

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn groups_base_update_and_dlc_together() {
        let dir = std::env::temp_dir().join(format!("orbit-switch-lib-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();

        let files = [
            "Hogwarts Legacy [0100F7E00C70E000][v0].nsp",
            "Hogwarts Legacy [0100F7E00C70E800][v327680].nsp",
            "Hogwarts Legacy [DLC Astronomers Hat] [0100F7E00C70F002][v65536].nsp",
        ];
        for file in files {
            let path = dir.join(file);
            fs::File::create(path).unwrap().write_all(b"x").unwrap();
        }

        let repo = GameRepository::open_in_memory().expect("in-memory db");
        let scan = scan_switch_library(&repo, &dir).expect("scan");
        assert_eq!(scan.groups.len(), 1);
        let group = &scan.groups[0];
        assert!(group.base.is_some());
        assert_eq!(group.updates.len(), 1);
        assert_eq!(group.dlcs.len(), 1);

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn inventory_kind_detects_update_patch_ids() {
        let parsed = parse_switch_filename("Game [0100F7E00C70E800][v327680].nsp");
        assert_eq!(
            inventory_kind(&parsed, "Game [0100F7E00C70E800][v327680]"),
            SwitchContentKind::Update
        );
    }
}
