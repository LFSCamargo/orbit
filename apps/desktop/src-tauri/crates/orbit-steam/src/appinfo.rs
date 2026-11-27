//! Install folder names from Steam's binary `appcache/appinfo.vdf` (v28 and
//! v29). A library can lose an `appmanifest_<id>.acf` while the game folder is
//! still there; this names that folder. Bounded: the file is Steam-written but
//! still untrusted input.
use std::collections::{HashMap, HashSet};

const MAGIC_V28: u32 = 0x0756_4428;
const MAGIC_V29: u32 = 0x0756_4429;
const MAX_BYTES: usize = 128 * 1024 * 1024;
const MAX_APPS: usize = 200_000;
const MAX_DEPTH: usize = 16;
/// Per-app fields between the app header and its key-values.
const APP_PREAMBLE: usize = 4 + 4 + 8 + 20 + 4 + 20;

/// Common metadata for one app from `appcache/appinfo.vdf`.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct AppSummary {
    pub name: Option<String>,
    pub app_type: Option<String>,
    pub required_bytes: Option<u64>,
    /// Bytes of the depots a Mac install downloads: macOS and shared depots.
    pub mac_required_bytes: Option<u64>,
    /// At least one non-DLC depot is built for macOS.
    pub has_mac_build: bool,
}

/// `appinfo/config/installdir` for each wanted app id found in the file.
/// Complexity: O(bytes), single bounded pass.
pub fn install_dirs(bytes: &[u8], wanted: &HashSet<u32>) -> HashMap<u32, String> {
    let mut found = HashMap::new();
    scan_apps(bytes, wanted, |reader, app_id, start, end| {
        if let Some(dir) = reader.installdir(start, end) {
            found.insert(app_id, dir);
        }
        found.len() == wanted.len()
    });
    found
}

/// `appinfo/common/name` and lowercased `appinfo/common/type` for each wanted
/// app id in `appcache/appinfo.vdf`. Complexity: O(bytes), single bounded pass.
pub fn app_summaries(bytes: &[u8], wanted: &HashSet<u32>) -> HashMap<u32, AppSummary> {
    let mut found = HashMap::new();
    scan_apps(bytes, wanted, |reader, app_id, start, end| {
        if let Some(summary) = reader.summary(start, end) {
            found.insert(app_id, summary);
        }
        found.len() == wanted.len()
    });
    found
}

fn scan_apps(
    bytes: &[u8],
    wanted: &HashSet<u32>,
    mut visit: impl FnMut(&Reader<'_>, u32, usize, usize) -> bool,
) {
    if bytes.len() > MAX_BYTES || wanted.is_empty() {
        return;
    }
    let Some(magic) = u32_at(bytes, 0) else {
        return;
    };
    let strings = match magic {
        MAGIC_V29 => match string_table(bytes) {
            Some(table) => Some(table),
            None => return,
        },
        MAGIC_V28 => None,
        _ => return,
    };
    let reader = Reader {
        bytes,
        strings: strings.as_deref(),
    };
    let mut at = if magic == MAGIC_V29 { 16 } else { 8 };
    for _ in 0..MAX_APPS {
        let Some(app_id) = u32_at(bytes, at) else {
            break;
        };
        let Some(size) = u32_at(bytes, at + 4) else {
            break;
        };
        if app_id == 0 {
            break;
        }
        let body = at + 8;
        let Some(next) = body
            .checked_add(size as usize)
            .filter(|end| *end <= bytes.len())
        else {
            break;
        };
        if wanted.contains(&app_id)
            && body + APP_PREAMBLE < next
            && visit(&reader, app_id, body + APP_PREAMBLE, next)
        {
            break;
        }
        at = next;
    }
}

fn u32_at(bytes: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_le_bytes(bytes.get(at..at + 4)?.try_into().ok()?))
}

fn string_table(bytes: &[u8]) -> Option<Vec<&str>> {
    let offset = usize::try_from(u64::from_le_bytes(bytes.get(8..16)?.try_into().ok()?)).ok()?;
    let count = u32_at(bytes, offset)? as usize;
    let mut strings = Vec::with_capacity(count.min(1 << 16));
    let mut at = offset + 4;
    for _ in 0..count.min(1 << 20) {
        let (text, end) = c_str(bytes, at, bytes.len())?;
        strings.push(text);
        at = end;
    }
    Some(strings)
}

fn c_str(bytes: &[u8], at: usize, limit: usize) -> Option<(&str, usize)> {
    let rest = bytes.get(at..limit)?;
    let len = rest.iter().position(|byte| *byte == 0)?;
    Some((std::str::from_utf8(&rest[..len]).ok()?, at + len + 1))
}

struct Reader<'a> {
    bytes: &'a [u8],
    strings: Option<&'a [&'a str]>,
}

impl Reader<'_> {
    fn installdir(&self, start: usize, end: usize) -> Option<String> {
        let mut path = Vec::new();
        let mut found = None;
        self.walk(start, end, &mut path, &mut found)?;
        found
    }

    fn summary(&self, start: usize, end: usize) -> Option<AppSummary> {
        let mut path = Vec::new();
        let mut accum = SummaryAccum::default();
        self.walk_summary(start, end, &mut path, &mut accum)?;
        let mut found = accum.summary;
        found.required_bytes = depot_bytes(&accum.depots, "windows");
        found.mac_required_bytes = depot_bytes(&accum.depots, "macos");
        found.has_mac_build = accum.depots.iter().any(|depot| {
            !depot.is_dlc
                && depot
                    .oslist
                    .as_deref()
                    .is_some_and(|os| os.contains("macos"))
        });
        (found.name.is_some() || found.app_type.is_some()).then_some(found)
    }

    fn key(&self, at: usize, end: usize) -> Option<(&str, usize)> {
        match self.strings {
            Some(table) => Some((*table.get(u32_at(self.bytes, at)? as usize)?, at + 4)),
            None => c_str(self.bytes, at, end),
        }
    }

    /// Walk one nested object; records `appinfo/config/installdir`.
    fn walk<'k>(
        &'k self,
        mut at: usize,
        end: usize,
        path: &mut Vec<&'k str>,
        found: &mut Option<String>,
    ) -> Option<usize> {
        if path.len() > MAX_DEPTH {
            return None;
        }
        loop {
            let kind = *self.bytes.get(at).filter(|_| at < end)?;
            at += 1;
            if kind == 0x08 {
                return Some(at);
            }
            let (key, next) = self.key(at, end)?;
            at = next;
            at = match kind {
                0x00 => {
                    path.push(key);
                    let next = self.walk(at, end, path, found)?;
                    path.pop();
                    next
                }
                0x01 => {
                    let (value, next) = c_str(self.bytes, at, end)?;
                    if found.is_none()
                        && key.eq_ignore_ascii_case("installdir")
                        && path.len() == 2
                        && path[0].eq_ignore_ascii_case("appinfo")
                        && path[1].eq_ignore_ascii_case("config")
                    {
                        *found = Some(value.to_string());
                    }
                    next
                }
                0x02 | 0x03 | 0x04 | 0x06 => at + 4,
                0x07 | 0x0a => at + 8,
                _ => return None,
            };
        }
    }

    /// Walk one nested object; records `appinfo/common/name`, `appinfo/common/type`,
    /// and Windows/shared depot `maxsize` under `appinfo/depots/<id>`.
    fn walk_summary<'k>(
        &'k self,
        mut at: usize,
        end: usize,
        path: &mut Vec<&'k str>,
        accum: &mut SummaryAccum,
    ) -> Option<usize> {
        if path.len() > MAX_DEPTH {
            return None;
        }
        loop {
            let kind = *self.bytes.get(at).filter(|_| at < end)?;
            at += 1;
            if kind == 0x08 {
                return Some(at);
            }
            let (key, next) = self.key(at, end)?;
            at = next;
            let entering_depot = path.len() == 2
                && path[0].eq_ignore_ascii_case("appinfo")
                && path[1].eq_ignore_ascii_case("depots")
                && !key.is_empty()
                && key.bytes().all(|b| b.is_ascii_digit())
                && accum.depots.len() < 256;
            at = match kind {
                0x00 => {
                    if entering_depot {
                        accum.depots.push(DepotAccum::default());
                        accum.in_depot = true;
                    }
                    path.push(key);
                    let next = self.walk_summary(at, end, path, accum)?;
                    path.pop();
                    if entering_depot {
                        accum.in_depot = false;
                    }
                    next
                }
                0x01 => {
                    let (value, next) = c_str(self.bytes, at, end)?;
                    let in_common = path.len() == 2
                        && path[0].eq_ignore_ascii_case("appinfo")
                        && path[1].eq_ignore_ascii_case("common");
                    if in_common {
                        if accum.summary.name.is_none() && key.eq_ignore_ascii_case("name") {
                            let trimmed = value.trim();
                            if !trimmed.is_empty() {
                                accum.summary.name = Some(trimmed.to_string());
                            }
                        } else if accum.summary.app_type.is_none()
                            && key.eq_ignore_ascii_case("type")
                        {
                            let kind = value.trim().to_ascii_lowercase();
                            if !kind.is_empty() {
                                accum.summary.app_type = Some(kind);
                            }
                        }
                    } else if accum.in_depot {
                        if let Some(depot) = accum.depots.last_mut() {
                            let size = (path.len() == 3 && key.eq_ignore_ascii_case("maxsize"))
                                || (path.len() == 5
                                    && depot.maxsize == 0
                                    && path[3].eq_ignore_ascii_case("manifests")
                                    && path[4].eq_ignore_ascii_case("public")
                                    && key.eq_ignore_ascii_case("size"));
                            if size {
                                if let Ok(bytes) = value.trim().parse::<u64>() {
                                    depot.maxsize = bytes;
                                }
                            } else if path.len() == 3 && key.eq_ignore_ascii_case("dlcappid") {
                                depot.is_dlc = true;
                            } else if path.len() == 4
                                && path[3].eq_ignore_ascii_case("config")
                                && key.eq_ignore_ascii_case("oslist")
                            {
                                depot.oslist = Some(value.trim().to_ascii_lowercase());
                            } else if path.len() == 4
                                && path[3].eq_ignore_ascii_case("config")
                                && key.eq_ignore_ascii_case("osarch")
                            {
                                depot.osarch = Some(value.trim().to_string());
                            }
                        }
                    }
                    next
                }
                0x02 => {
                    if accum.in_depot && path.len() == 3 {
                        if let Some(depot) = accum.depots.last_mut() {
                            if key.eq_ignore_ascii_case("maxsize") {
                                depot.maxsize = u32_at(self.bytes, at)? as u64;
                            } else if key.eq_ignore_ascii_case("dlcappid") {
                                depot.is_dlc = true;
                            }
                        }
                    }
                    at + 4
                }
                0x03 | 0x04 | 0x06 => at + 4,
                0x07 | 0x0a => {
                    if accum.in_depot && path.len() == 3 && key.eq_ignore_ascii_case("maxsize") {
                        if let Some(depot) = accum.depots.last_mut() {
                            let lo = u32_at(self.bytes, at)? as u64;
                            let hi = u32_at(self.bytes, at + 4)? as u64;
                            depot.maxsize = lo | (hi << 32);
                        }
                    }
                    at + 8
                }
                _ => return None,
            };
        }
    }
}

/// Sum of the non-DLC depots one platform installs: its own and the shared
/// ones (no `oslist`). 32-bit-only depots are left out; Steam skips them on
/// a 64-bit Mac or PC. O(depots).
fn depot_bytes(depots: &[DepotAccum], os: &str) -> Option<u64> {
    let total = depots
        .iter()
        .filter(|depot| {
            !depot.is_dlc
                && depot.osarch.as_deref() != Some("32")
                && depot
                    .oslist
                    .as_deref()
                    .is_none_or(|list| list.is_empty() || list.contains(os))
        })
        .fold(0u64, |total, depot| total.saturating_add(depot.maxsize));
    (total > 0).then_some(total)
}

#[derive(Default)]
struct SummaryAccum {
    summary: AppSummary,
    depots: Vec<DepotAccum>,
    in_depot: bool,
}

#[derive(Default)]
struct DepotAccum {
    maxsize: u64,
    oslist: Option<String>,
    osarch: Option<String>,
    is_dlc: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A v29 file with two apps; only `appinfo/config/installdir` counts.
    fn sample_v29() -> Vec<u8> {
        let strings = ["appinfo", "config", "installdir", "common", "name"];
        let key =
            |name: &str| (strings.iter().position(|s| *s == name).unwrap() as u32).to_le_bytes();
        let app = |id: u32, dir: &str, decoy: &str| {
            let mut kv = Vec::new();
            kv.push(0x00);
            kv.extend(key("appinfo"));
            kv.push(0x00);
            kv.extend(key("common"));
            kv.push(0x01);
            kv.extend(key("installdir"));
            kv.extend(decoy.as_bytes());
            kv.push(0);
            kv.push(0x08);
            kv.push(0x00);
            kv.extend(key("config"));
            kv.push(0x02);
            kv.extend(key("name"));
            kv.extend(7u32.to_le_bytes());
            kv.push(0x01);
            kv.extend(key("installdir"));
            kv.extend(dir.as_bytes());
            kv.push(0);
            kv.push(0x08);
            kv.push(0x08);
            kv.push(0x08);
            let mut body = vec![0u8; APP_PREAMBLE];
            body.extend(kv);
            let mut out = id.to_le_bytes().to_vec();
            out.extend((body.len() as u32).to_le_bytes());
            out.extend(body);
            out
        };
        let mut apps = app(1593500, "GodOfWar", "not this");
        apps.extend(app(883710, "RESIDENT EVIL 2  BIOHAZARD RE2", "nor this"));
        apps.extend(0u32.to_le_bytes());
        let table_at = 16 + apps.len();
        let mut out = MAGIC_V29.to_le_bytes().to_vec();
        out.extend(1u32.to_le_bytes());
        out.extend((table_at as u64).to_le_bytes());
        out.extend(apps);
        out.extend((strings.len() as u32).to_le_bytes());
        for name in strings {
            out.extend(name.as_bytes());
            out.push(0);
        }
        out
    }

    #[test]
    fn names_the_install_folder_of_each_wanted_app() {
        let file = sample_v29();
        let found = install_dirs(&file, &HashSet::from([1593500, 883710, 42]));
        assert_eq!(found.get(&1593500).map(String::as_str), Some("GodOfWar"));
        assert_eq!(
            found.get(&883710).map(String::as_str),
            Some("RESIDENT EVIL 2  BIOHAZARD RE2")
        );
        assert!(!found.contains_key(&42));
        assert!(!install_dirs(&file, &HashSet::from([1593500])).contains_key(&883710));
    }

    #[test]
    fn truncated_or_foreign_files_yield_nothing() {
        let file = sample_v29();
        assert!(install_dirs(&file[..40], &HashSet::from([1593500])).is_empty());
        assert!(install_dirs(b"not appinfo at all", &HashSet::from([1])).is_empty());
        assert!(install_dirs(&[], &HashSet::from([1])).is_empty());
        assert!(app_summaries(&file[..40], &HashSet::from([1593500])).is_empty());
        assert!(app_summaries(b"not appinfo at all", &HashSet::from([1])).is_empty());
    }

    #[test]
    fn app_summaries_read_common_name_and_lowercased_type_only() {
        let strings = ["appinfo", "common", "name", "type", "config"];
        let key =
            |name: &str| (strings.iter().position(|s| *s == name).unwrap() as u32).to_le_bytes();
        let entry = |id: u32, name: &str, kind: &str| {
            let mut kv = Vec::new();
            kv.push(0x00);
            kv.extend(key("appinfo"));
            kv.push(0x00);
            kv.extend(key("config"));
            kv.push(0x01);
            kv.extend(key("name"));
            kv.extend(b"decoy-name\0");
            kv.push(0x01);
            kv.extend(key("type"));
            kv.extend(b"decoy-type\0");
            kv.push(0x08);
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
            let mut body = vec![0u8; APP_PREAMBLE];
            body.extend(kv);
            let mut out = id.to_le_bytes().to_vec();
            out.extend((body.len() as u32).to_le_bytes());
            out.extend(body);
            out
        };
        let mut apps = entry(2_322_010, "God of War Ragnarök", "Game");
        apps.extend(entry(2_974_330, "Deluxe Upgrade", "DLC"));
        apps.extend(0u32.to_le_bytes());
        let table_at = 16 + apps.len();
        let mut file = MAGIC_V29.to_le_bytes().to_vec();
        file.extend(1u32.to_le_bytes());
        file.extend((table_at as u64).to_le_bytes());
        file.extend(apps);
        file.extend((strings.len() as u32).to_le_bytes());
        for name in strings {
            file.extend(name.as_bytes());
            file.push(0);
        }
        let found = app_summaries(&file, &HashSet::from([2_322_010, 2_974_330, 999]));
        assert_eq!(
            found.get(&2_322_010),
            Some(&AppSummary {
                name: Some("God of War Ragnarök".into()),
                app_type: Some("game".into()),
                ..AppSummary::default()
            })
        );
        assert_eq!(
            found.get(&2_974_330),
            Some(&AppSummary {
                name: Some("Deluxe Upgrade".into()),
                app_type: Some("dlc".into()),
                ..AppSummary::default()
            })
        );
        assert!(!found.contains_key(&999));
    }
    /// A v28 file (inline keys): one app with Windows, macOS, shared, 32-bit
    /// and DLC depots.
    fn depot_file() -> Vec<u8> {
        fn key(kv: &mut Vec<u8>, kind: u8, name: &str) {
            kv.push(kind);
            kv.extend(name.as_bytes());
            kv.push(0);
        }
        fn text(kv: &mut Vec<u8>, name: &str, value: &str) {
            key(kv, 0x01, name);
            kv.extend(value.as_bytes());
            kv.push(0);
        }
        fn depot(
            kv: &mut Vec<u8>,
            id: &str,
            os: Option<&str>,
            arch: Option<&str>,
            size: &str,
            dlc: bool,
        ) {
            key(kv, 0x00, id);
            text(kv, "maxsize", size);
            if dlc {
                text(kv, "dlcappid", "9");
            }
            key(kv, 0x00, "config");
            if let Some(os) = os {
                text(kv, "oslist", os);
            }
            if let Some(arch) = arch {
                text(kv, "osarch", arch);
            }
            kv.push(0x08);
            kv.push(0x08);
        }
        let mut kv = Vec::new();
        key(&mut kv, 0x00, "appinfo");
        key(&mut kv, 0x00, "common");
        text(&mut kv, "name", "Cyberpunk 2077");
        text(&mut kv, "type", "Game");
        kv.push(0x08);
        key(&mut kv, 0x00, "depots");
        depot(&mut kv, "1", Some("windows"), None, "70000", false);
        depot(&mut kv, "2", Some("macos"), None, "90000", false);
        depot(&mut kv, "3", None, None, "5", false);
        depot(&mut kv, "4", Some("macos"), Some("32"), "1000", false);
        depot(&mut kv, "5", Some("macos"), None, "777", true);
        kv.push(0x08);
        kv.push(0x08);
        kv.push(0x08);
        let mut body = vec![0u8; APP_PREAMBLE];
        body.extend(kv);
        let mut file = MAGIC_V28.to_le_bytes().to_vec();
        file.extend(1u32.to_le_bytes());
        file.extend(1_091_500u32.to_le_bytes());
        file.extend((body.len() as u32).to_le_bytes());
        file.extend(body);
        file.extend(0u32.to_le_bytes());
        file
    }

    #[test]
    fn mac_and_windows_sizes_count_only_their_own_and_shared_depots() {
        let found = app_summaries(&depot_file(), &HashSet::from([1_091_500]));
        let summary = found.get(&1_091_500).unwrap();
        assert_eq!(summary.name.as_deref(), Some("Cyberpunk 2077"));
        assert_eq!(summary.required_bytes, Some(70_005));
        assert_eq!(summary.mac_required_bytes, Some(90_005));
        assert!(summary.has_mac_build);
    }
}
