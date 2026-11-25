//! Read owned Steam games from verified local Steam roots belonging to the
//! signed-in account: `userdata/<id>/config/localconfig.vdf` plus
//! `appcache/packageinfo.vdf` joined with `appcache/appinfo.vdf`.
//!
//! Why: `localconfig.vdf` omits newly purchased games that have never been
//! launched, and Chromium's `steamLoginSecure` cookie expires 24 hours after
//! sign-in. Valve's client writes every owned package to `packageinfo.vdf` and
//! its app metadata to `appinfo.vdf`, so scanning verified local roots picks up
//! newly bought games instantly and offline-safely.
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use crate::services::steam_app_types;
use crate::services::steam_catalog::{self, SteamCatalogEntry};
use crate::services::steam_download::valid_app_id;
use crate::utils::steam_account::{self, most_recent_account, userdata_account_id, SteamAccount};

const LOGIN_LIMIT: u64 = 8 * 1024 * 1024;
const LOCALCONFIG_LIMIT: u64 = 8 * 1024 * 1024;
const PACKAGEINFO_LIMIT: u64 = 32 * 1024 * 1024;
const APPINFO_LIMIT: u64 = 128 * 1024 * 1024;
const CONTAINER_CAP: usize = 64;
const MAX_ENTRIES: usize = 2_000;

#[derive(Debug, Default)]
pub struct LocalSteamSnapshot {
    pub local_ids: Vec<String>,
    pub entries: Vec<SteamCatalogEntry>,
}

/// Steam roots belonging to `account`: the primary sign-in prefix, Orbit's
/// sync and game containers whose `loginusers.vdf` matches `account`, and the
/// local Mac Steam install when its active login matches `account`.
/// Complexity: O(containers <= 64), bounded `loginusers.vdf` reads.
pub fn matching_steam_roots(
    account: &SteamAccount,
    primary_root: Option<&Path>,
    mac_root: Option<&Path>,
    containers_root: &Path,
) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let mut seen = HashSet::new();
    let mut push_if_matching = |root: PathBuf, require_match: bool| {
        if !root.is_dir() {
            return;
        }
        let key = root.canonicalize().unwrap_or_else(|_| root.clone());
        if !seen.insert(key) {
            return;
        }
        if !require_match || root_matches_account(&root, account) {
            roots.push(root);
        }
    };

    if let Some(primary) = primary_root {
        push_if_matching(primary.to_path_buf(), false);
    }
    let sync_root = crate::runtimes::containers::steam::steam_root(
        &containers_root.join("steam-sync").join("prefix"),
    );
    push_if_matching(sync_root, true);

    if let Ok(entries) = fs::read_dir(containers_root.join("games")) {
        for entry in entries.flatten().take(CONTAINER_CAP) {
            if !entry.file_type().is_ok_and(|kind| kind.is_dir()) {
                continue;
            }
            let steam =
                crate::runtimes::containers::steam::steam_root(&entry.path().join("prefix"));
            push_if_matching(steam, true);
        }
    }

    if let Some(mac) = mac_root {
        push_if_matching(mac.to_path_buf(), true);
    }

    roots
}

/// Discover owned IDs and playable package entries across `roots` for `account`.
/// Complexity: O(roots × bounded file bytes).
pub fn discover(account: &SteamAccount, roots: &[PathBuf]) -> LocalSteamSnapshot {
    let mut id_set = HashSet::new();
    let mut entries_by_id: HashMap<String, SteamCatalogEntry> = HashMap::new();

    for root in roots {
        for id in read_localconfig_ids(root, &account.steam_id) {
            if id_set.len() >= MAX_ENTRIES {
                break;
            }
            id_set.insert(id);
        }
        for entry in read_package_games(root) {
            let app_id = entry.app_id.clone();
            if let Some(existing) = entries_by_id.get_mut(&app_id) {
                if steam_catalog::is_placeholder_title(&existing.title, &existing.app_id)
                    && !steam_catalog::is_placeholder_title(&entry.title, &entry.app_id)
                {
                    existing.title = entry.title;
                }
                if existing.app_type.is_none() {
                    existing.app_type = entry.app_type;
                }
                if existing.install_size_bytes.is_none() {
                    existing.install_size_bytes = entry.install_size_bytes;
                }
            } else if entries_by_id.len() < MAX_ENTRIES {
                entries_by_id.insert(app_id, entry);
            }
        }
    }

    let mut local_ids: Vec<String> = id_set.into_iter().collect();
    local_ids.sort();
    let mut entries: Vec<SteamCatalogEntry> = entries_by_id.into_values().collect();
    entries.sort_by(|a, b| a.app_id.cmp(&b.app_id));

    LocalSteamSnapshot { local_ids, entries }
}

fn root_matches_account(root: &Path, account: &SteamAccount) -> bool {
    let login_path = root.join("config/loginusers.vdf");
    let Some(text) = read_text_capped(&login_path, LOGIN_LIMIT) else {
        return false;
    };
    let Some(recent) = most_recent_account(&text) else {
        return false;
    };
    recent.steam_id == account.steam_id && recent.name.eq_ignore_ascii_case(&account.name)
}

fn read_localconfig_ids(root: &Path, steam_id: &str) -> Vec<String> {
    let mut files = Vec::new();
    if let Some(account_id) = userdata_account_id(steam_id) {
        files.push(
            root.join("userdata")
                .join(account_id)
                .join("config/localconfig.vdf"),
        );
    }
    if let Ok(entries) = fs::read_dir(root.join("userdata")) {
        for entry in entries.flatten().take(4) {
            files.push(entry.path().join("config/localconfig.vdf"));
        }
    }
    for path in files {
        let Some(content) = read_text_capped(&path, LOCALCONFIG_LIMIT) else {
            continue;
        };
        let ids = steam_account::local_library_ids(&content);
        if !ids.is_empty() {
            return ids;
        }
    }
    Vec::new()
}

/// Joins `appcache/packageinfo.vdf` (non-zero owned packages) with
/// `appcache/appinfo.vdf` to extract playable titles (`game`, `demo`, `mod`,
/// `beta`), keeping DLC, soundtracks, tools, and software out of the catalog.
fn read_package_games(root: &Path) -> Vec<SteamCatalogEntry> {
    let Some(pkg_bytes) =
        read_bytes_capped(&root.join("appcache/packageinfo.vdf"), PACKAGEINFO_LIMIT)
    else {
        return Vec::new();
    };
    let app_ids = orbit_steam::packageinfo::owned_app_ids(&pkg_bytes);
    if app_ids.is_empty() {
        return Vec::new();
    }
    let Some(app_bytes) = read_bytes_capped(&root.join("appcache/appinfo.vdf"), APPINFO_LIMIT)
    else {
        return Vec::new();
    };
    let summaries = orbit_steam::appinfo::app_summaries(&app_bytes, &app_ids);
    let mut games = Vec::new();
    for (numeric_id, summary) in summaries {
        let Some(raw_type) = summary.app_type.as_deref() else {
            continue;
        };
        let Some(app_type) = steam_app_types::clean(raw_type) else {
            continue;
        };
        if !steam_app_types::is_playable(Some(&app_type), false) {
            continue;
        }
        let app_id = numeric_id.to_string();
        if !valid_app_id(&app_id) {
            continue;
        }
        let title = summary
            .name
            .filter(|name| !steam_catalog::is_placeholder_title(name, &app_id))
            .unwrap_or_else(|| steam_catalog::placeholder_title(&app_id));
        let install_size_bytes = summary
            .required_bytes
            .and_then(|bytes| i64::try_from(bytes).ok());
        games.push(SteamCatalogEntry {
            app_id,
            title,
            app_type: Some(app_type),
            install_size_bytes,
            ..SteamCatalogEntry::default()
        });
        if games.len() >= MAX_ENTRIES {
            break;
        }
    }
    games
}

fn read_text_capped(path: &Path, limit: u64) -> Option<String> {
    let bytes = read_bytes_capped(path, limit)?;
    String::from_utf8(bytes).ok()
}

fn read_bytes_capped(path: &Path, limit: u64) -> Option<Vec<u8>> {
    let meta = fs::symlink_metadata(path).ok()?;
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > limit {
        return None;
    }
    let mut bytes = Vec::with_capacity(meta.len() as usize);
    fs::File::open(path)
        .ok()?
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.len() as u64 > limit {
        return None;
    }
    Some(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_login(root: &Path, steam_id: &str, name: &str) {
        let cfg = root.join("config");
        fs::create_dir_all(&cfg).unwrap();
        fs::write(
            cfg.join("loginusers.vdf"),
            format!(
                "\"users\"\n{{\n\t\"{steam_id}\"\n\t{{\n\t\t\"AccountName\"\t\t\"{name}\"\n\t\t\"mostrecent\"\t\t\"1\"\n\t}}\n}}\n"
            ),
        )
        .unwrap();
    }

    fn write_packageinfo(root: &Path, packages: &[(u32, &[u32])]) {
        let cache = root.join("appcache");
        fs::create_dir_all(&cache).unwrap();
        let mut out = 0x0656_5528u32.to_le_bytes().to_vec();
        out.extend(1u32.to_le_bytes());
        for (sub_id, apps) in packages {
            out.extend(sub_id.to_le_bytes());
            out.extend(vec![0u8; 32]);
            out.push(0x00);
            out.extend(sub_id.to_string().as_bytes());
            out.push(0);
            out.push(0x00);
            out.extend(b"appids\0");
            for (index, app_id) in apps.iter().enumerate() {
                out.push(0x02);
                out.extend(index.to_string().as_bytes());
                out.push(0);
                out.extend(app_id.to_le_bytes());
            }
            out.push(0x08);
            out.push(0x08);
            out.push(0x08);
        }
        out.extend(u32::MAX.to_le_bytes());
        fs::write(cache.join("packageinfo.vdf"), out).unwrap();
    }

    fn write_appinfo(root: &Path, items: &[(u32, &str, &str)]) {
        let cache = root.join("appcache");
        fs::create_dir_all(&cache).unwrap();
        let strings = ["appinfo", "common", "name", "type"];
        let key =
            |name: &str| (strings.iter().position(|s| *s == name).unwrap() as u32).to_le_bytes();
        let mut apps = Vec::new();
        for (id, name, kind) in items {
            let mut kv = Vec::new();
            kv.push(0x00);
            kv.extend(key("appinfo"));
            kv.push(0x00);
            kv.extend(key("common"));
            kv.push(0x01);
            kv.extend(key("name"));
            kv.extend(name.as_bytes());
            kv.push(0);
            kv.push(0x01);
            kv.extend(key("type"));
            kv.extend(kind.as_bytes());
            kv.push(0);
            kv.push(0x08);
            kv.push(0x08);
            kv.push(0x08);
            let mut body = vec![0u8; 60];
            body.extend(kv);
            apps.extend(id.to_le_bytes());
            apps.extend((body.len() as u32).to_le_bytes());
            apps.extend(body);
        }
        apps.extend(0u32.to_le_bytes());
        let table_at = 16 + apps.len();
        let mut out = 0x0756_4429u32.to_le_bytes().to_vec();
        out.extend(1u32.to_le_bytes());
        out.extend((table_at as u64).to_le_bytes());
        out.extend(apps);
        out.extend((strings.len() as u32).to_le_bytes());
        for name in strings {
            out.extend(name.as_bytes());
            out.push(0);
        }
        fs::write(cache.join("appinfo.vdf"), out).unwrap();
    }

    #[test]
    fn discovers_newly_bought_games_from_matching_mac_steam_and_filters_dlcs_and_base_package() {
        let root = std::env::temp_dir().join(format!("orbit-local-cat-{}", uuid::Uuid::new_v4()));
        let win = root.join("steam-windows");
        let mac = root.join("mac-steam");
        let containers = root.join("containers");
        let account = SteamAccount {
            name: "orbit_player".into(),
            steam_id: "76561198240938860".into(),
        };
        write_login(&win, &account.steam_id, &account.name);
        write_login(&mac, &account.steam_id, &account.name);
        write_packageinfo(
            &mac,
            &[
                (0, &[480]),
                (1_070_850, &[2_322_010, 2_974_330, 2_974_310]),
                (1_399_488, &[1_808_500]),
            ],
        );
        write_appinfo(
            &mac,
            &[
                (480, "Spacewar", "Game"),
                (2_322_010, "God of War Ragnarök", "Game"),
                (2_974_330, "Deluxe Upgrade", "DLC"),
                (2_974_310, "Soundtrack", "Music"),
                (1_808_500, "ARC Raiders", "Game"),
            ],
        );

        let roots = matching_steam_roots(&account, Some(&win), Some(&mac), &containers);
        assert_eq!(roots.len(), 2);
        let snap = discover(&account, &roots);
        let found: HashMap<&str, &str> = snap
            .entries
            .iter()
            .map(|e| (e.app_id.as_str(), e.title.as_str()))
            .collect();
        assert_eq!(found.get("2322010"), Some(&"God of War Ragnarök"));
        assert_eq!(found.get("1808500"), Some(&"ARC Raiders"));
        assert!(!found.contains_key("480"), "package 0 must stay excluded");
        assert!(!found.contains_key("2974330"), "DLC must stay excluded");
        assert!(!found.contains_key("2974310"), "Music must stay excluded");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn ignores_secondary_steam_root_signed_into_a_different_account() {
        let root = std::env::temp_dir().join(format!("orbit-other-acct-{}", uuid::Uuid::new_v4()));
        let win = root.join("steam-windows");
        let mac = root.join("mac-steam");
        let containers = root.join("containers");
        let account = SteamAccount {
            name: "orbit_player".into(),
            steam_id: "76561198240938860".into(),
        };
        write_login(&win, &account.steam_id, &account.name);
        write_login(&mac, "76561198000000001", "someone_else");
        write_packageinfo(&mac, &[(1_070_850, &[2_322_010])]);
        write_appinfo(&mac, &[(2_322_010, "God of War Ragnarök", "Game")]);

        let roots = matching_steam_roots(&account, Some(&win), Some(&mac), &containers);
        assert_eq!(roots.len(), 1);
        let snap = discover(&account, &roots);
        assert!(snap.entries.is_empty());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    #[cfg(unix)]
    fn rejects_symlinked_cache_files() {
        let root = std::env::temp_dir().join(format!("orbit-sym-cat-{}", uuid::Uuid::new_v4()));
        let outside = root.join("outside.vdf");
        fs::create_dir_all(root.join("steam/appcache")).unwrap();
        fs::write(&outside, b"anything").unwrap();
        std::os::unix::fs::symlink(&outside, root.join("steam/appcache/packageinfo.vdf")).unwrap();
        assert!(read_bytes_capped(&root.join("steam/appcache/packageinfo.vdf"), 1024).is_none());
        let _ = fs::remove_dir_all(root);
    }
}
