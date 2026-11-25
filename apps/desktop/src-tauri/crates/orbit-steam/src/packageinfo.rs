//! Owned app IDs from Steam's binary `appcache/packageinfo.vdf` (v27 and v28).
//! Valve's client stores every package (sub ID) granted to the signed-in user
//! here, including newly purchased games that have never been launched yet.
//! Package `0` is skipped because it is Steam's universal free base package
//! (demos, Steam Client, Proton, etc.) present on every account.
//! Bounded: the file is Steam-written but still untrusted input.
use std::collections::HashSet;

const MAGIC_V27: u32 = 0x0656_5527;
const MAGIC_V28: u32 = 0x0656_5528;
const MAX_BYTES: usize = 32 * 1024 * 1024;
const MAX_PACKAGES: usize = 50_000;
const MAX_DEPTH: usize = 16;
const MAX_APP_IDS: usize = 16_000;
/// `sha1 (20) + change_number (4)` in v27; v28 appends `pics_token (8)`.
const PREAMBLE_V27: usize = 24;
const PREAMBLE_V28: usize = 32;

/// Unique positive app IDs across every non-zero package in `packageinfo.vdf`.
/// Complexity: O(bytes), single bounded pass.
pub fn owned_app_ids(bytes: &[u8]) -> HashSet<u32> {
    let mut found = HashSet::new();
    if bytes.len() > MAX_BYTES || bytes.len() < 8 {
        return found;
    }
    let Some(magic) = u32_at(bytes, 0) else {
        return found;
    };
    let preamble = match magic {
        MAGIC_V27 => PREAMBLE_V27,
        MAGIC_V28 => PREAMBLE_V28,
        _ => return found,
    };
    let mut at = 8;
    for _ in 0..MAX_PACKAGES {
        let Some(sub_id) = u32_at(bytes, at) else {
            break;
        };
        if sub_id == u32::MAX {
            break;
        }
        let Some(kv_start) = at
            .checked_add(4 + preamble)
            .filter(|offset| *offset < bytes.len())
        else {
            break;
        };
        let collect = sub_id != 0 && found.len() < MAX_APP_IDS;
        let Some(next) = walk_kv(bytes, kv_start, 0, false, collect, &mut found) else {
            break;
        };
        at = next;
    }
    found
}

fn u32_at(bytes: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_le_bytes(bytes.get(at..at + 4)?.try_into().ok()?))
}

fn c_str(bytes: &[u8], at: usize) -> Option<(&str, usize)> {
    let rest = bytes.get(at..)?;
    let len = rest.iter().position(|byte| *byte == 0)?;
    Some((std::str::from_utf8(&rest[..len]).ok()?, at + len + 1))
}

/// Walk one binary VDF object; records numeric values inside any `appids` block.
fn walk_kv(
    bytes: &[u8],
    mut at: usize,
    depth: usize,
    in_appids: bool,
    collect: bool,
    found: &mut HashSet<u32>,
) -> Option<usize> {
    if depth > MAX_DEPTH {
        return None;
    }
    loop {
        let kind = *bytes.get(at)?;
        at += 1;
        if kind == 0x08 {
            return Some(at);
        }
        let (key, next) = c_str(bytes, at)?;
        at = next;
        at = match kind {
            0x00 => {
                let child_appids = in_appids || key.eq_ignore_ascii_case("appids");
                walk_kv(bytes, at, depth + 1, child_appids, collect, found)?
            }
            0x01 | 0x05 => {
                let (value, next) = c_str(bytes, at)?;
                if collect && in_appids && found.len() < MAX_APP_IDS {
                    if let Ok(app_id) = value.parse::<u32>() {
                        if app_id > 0 {
                            found.insert(app_id);
                        }
                    }
                }
                next
            }
            0x02 => {
                let value = u32_at(bytes, at)?;
                if collect && in_appids && value > 0 && found.len() < MAX_APP_IDS {
                    found.insert(value);
                }
                at + 4
            }
            0x03 | 0x04 | 0x06 => {
                bytes.get(at..at + 4)?;
                at + 4
            }
            0x07 | 0x0a => {
                bytes.get(at..at + 8)?;
                at + 8
            }
            _ => return None,
        };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn encode_package(sub_id: u32, preamble: usize, app_ids: &[u32]) -> Vec<u8> {
        let mut out = sub_id.to_le_bytes().to_vec();
        out.extend(vec![0u8; preamble]);
        // Root object: "<sub_id>" { "billingtype" 10 "appids" { "0" <id> ... } }
        out.push(0x00);
        out.extend(sub_id.to_string().as_bytes());
        out.push(0);
        out.push(0x02);
        out.extend(b"billingtype\0");
        out.extend(10u32.to_le_bytes());
        out.push(0x00);
        out.extend(b"appids\0");
        for (index, app_id) in app_ids.iter().enumerate() {
            out.push(0x02);
            out.extend(index.to_string().as_bytes());
            out.push(0);
            out.extend(app_id.to_le_bytes());
        }
        out.push(0x08); // end appids
        out.push(0x08); // end sub_id
        out.push(0x08); // end package root
        out
    }

    fn sample_file(magic: u32, preamble: usize, packages: &[(u32, &[u32])]) -> Vec<u8> {
        let mut out = magic.to_le_bytes().to_vec();
        out.extend(1u32.to_le_bytes()); // universe
        for (sub_id, apps) in packages {
            out.extend(encode_package(*sub_id, preamble, apps));
        }
        out.extend(u32::MAX.to_le_bytes());
        out
    }

    #[test]
    fn collects_owned_apps_from_non_zero_packages_and_skips_base_package_zero() {
        let file = sample_file(
            MAGIC_V28,
            PREAMBLE_V28,
            &[
                (0, &[440, 480, 570]),
                (320_795, &[35_140, 200_260, 208_650]),
                (1_070_850, &[2_322_010, 0]),
            ],
        );
        let ids = owned_app_ids(&file);
        assert!(ids.contains(&35_140));
        assert!(ids.contains(&200_260));
        assert!(ids.contains(&208_650));
        assert!(ids.contains(&2_322_010));
        assert!(
            !ids.contains(&480),
            "package 0 is Steam's universal free base"
        );
        assert!(!ids.contains(&570));
        assert!(!ids.contains(&0));
        assert_eq!(ids.len(), 4);
    }

    #[test]
    fn parses_v27_packageinfo_and_rejects_malformed_or_truncated_input() {
        let v27 = sample_file(MAGIC_V27, PREAMBLE_V27, &[(1_399_488, &[1_808_500])]);
        assert_eq!(owned_app_ids(&v27), HashSet::from([1_808_500]));
        assert!(owned_app_ids(&v27[..20]).is_empty());
        assert!(owned_app_ids(b"not packageinfo").is_empty());
        assert!(owned_app_ids(&[]).is_empty());
    }
}
