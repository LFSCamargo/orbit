//! The files that hand a saved Steam login to an in-container client without a
//! sign-in window: the `local.vdf` ConnectCache, `loginusers.vdf`, and
//! `config.vdf`. The ConnectCache value itself is a DPAPI-wrapped refresh token
//! produced on Windows (inside Wine); this module only formats the containers
//! for it, so it stays pure and host-testable. Token bytes never live here.

/// IEEE CRC-32 (zlib). Steam names each ConnectCache entry after the CRC-32 of
/// the account name, written as lowercase hex with a trailing `1`.
pub fn crc32(data: &[u8]) -> u32 {
    let mut crc = !0u32;
    for &byte in data {
        crc ^= byte as u32;
        for _ in 0..8 {
            crc = if crc & 1 != 0 {
                (crc >> 1) ^ 0xEDB8_8320
            } else {
                crc >> 1
            };
        }
    }
    !crc
}

/// The ConnectCache sub-key Steam reads the saved token from. `{:x}` drops the
/// leading zero, matching the keys Valve's own client writes (`72a4e951`).
pub fn connect_cache_key(account_name: &str) -> String {
    format!("{:x}1", crc32(account_name.as_bytes()))
}

/// `local.vdf`: `drive_c/users/<user>/AppData/Local/Steam/local.vdf`. `token_hex`
/// is the DPAPI blob as lowercase hex; it is opaque to this function.
pub fn local_vdf(account_name: &str, token_hex: &str) -> String {
    format!(
        "\"MachineUserConfigStore\"\n{{\n\t\"Software\"\n\t{{\n\t\t\"Valve\"\n\t\t{{\n\t\t\t\"Steam\"\n\t\t\t{{\n\t\t\t\t\"ConnectCache\"\n\t\t\t\t{{\n\t\t\t\t\t\"{key}\"\t\t\"{token_hex}\"\n\t\t\t\t}}\n\t\t\t}}\n\t\t}}\n\t}}\n}}\n",
        key = connect_cache_key(account_name),
    )
}

/// `config/loginusers.vdf`: names the account the client signs in as and marks
/// it for silent auto-login.
pub fn loginusers_vdf(steam_id: &str, account_name: &str) -> String {
    format!(
        "\"users\"\n{{\n\t\"{id}\"\n\t{{\n\t\t\"AccountName\"\t\t\"{name}\"\n\t\t\"PersonaName\"\t\t\"{name}\"\n\t\t\"RememberPassword\"\t\t\"1\"\n\t\t\"AutoLogin\"\t\t\"1\"\n\t\t\"AllowAutoLogin\"\t\t\"1\"\n\t\t\"MostRecent\"\t\t\"1\"\n\t}}\n}}\n",
        id = steam_id,
        name = account_name,
    )
}

/// `config/config.vdf`: the refresh token Steam uses when the ConnectCache is
/// absent or stale. `refresh_token` is secret and must not be logged.
pub fn config_vdf(steam_id: &str, account_name: &str, refresh_token: &str) -> String {
    format!(
        "\"InstallConfigStore\"\n{{\n\t\"Software\"\n\t{{\n\t\t\"Valve\"\n\t\t{{\n\t\t\t\"Steam\"\n\t\t\t{{\n\t\t\t\t\"Accounts\"\n\t\t\t\t{{\n\t\t\t\t\t\"{name}\"\n\t\t\t\t\t{{\n\t\t\t\t\t\t\"SteamID\"\t\t\"{id}\"\n\t\t\t\t\t\t\"RefreshToken\"\t\t\"{token}\"\n\t\t\t\t\t}}\n\t\t\t\t}}\n\t\t\t}}\n\t\t}}\n\t}}\n}}\n",
        name = account_name,
        id = steam_id,
        token = refresh_token,
    )
}

/// The DPAPI blob hex Valve's client saved for `account_name` in `local.vdf`.
/// Returns `None` when the entry is missing or is not plain lowercase hex.
pub fn saved_token_hex<'a>(local_vdf: &'a str, account_name: &str) -> Option<&'a str> {
    let key = format!("\"{}\"", connect_cache_key(account_name));
    let mut in_cache = false;
    for line in local_vdf.lines().take(4096) {
        let trimmed = line.trim();
        if trimmed.starts_with("\"ConnectCache\"") {
            in_cache = true;
            continue;
        }
        if !in_cache {
            continue;
        }
        if trimmed.starts_with('}') {
            return None;
        }
        let Some(rest) = trimmed.strip_prefix(key.as_str()) else {
            continue;
        };
        let value = rest.trim().strip_prefix('"')?.strip_suffix('"')?;
        let plausible = (16..=16 * 1024).contains(&value.len())
            && value.len().is_multiple_of(2)
            && value
                .bytes()
                .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'));
        return plausible.then_some(value);
    }
    None
}

/// Lowercase or uppercase hex to bytes.
pub fn unhex(text: &str) -> Option<Vec<u8>> {
    if !text.len().is_multiple_of(2) {
        return None;
    }
    (0..text.len())
        .step_by(2)
        .map(|at| u8::from_str_radix(text.get(at..at + 2)?, 16).ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crc32_matches_zlib_and_the_observed_valve_key() {
        // zlib.crc32(b"lokopoco98") == 0x072a4e95; Valve writes the key 72a4e951.
        assert_eq!(crc32(b"lokopoco98"), 0x072a_4e95);
        assert_eq!(connect_cache_key("lokopoco98"), "72a4e951");
        assert_eq!(crc32(b""), 0);
        assert_eq!(crc32(b"123456789"), 0xcbf4_3926);
    }

    #[test]
    fn login_files_carry_the_account_and_refresh_token() {
        let login = loginusers_vdf("76561198000000000", "orbit_user");
        assert!(login.contains("\"AccountName\"\t\t\"orbit_user\""));
        assert!(login.contains("\"AutoLogin\"\t\t\"1\""));
        assert!(login.contains("\"AllowAutoLogin\"\t\t\"1\""));
        let config = config_vdf("76561198000000000", "orbit_user", "SECRETTOKEN");
        assert!(config.contains("\"RefreshToken\"\t\t\"SECRETTOKEN\""));
        assert!(config.contains("\"SteamID\"\t\t\"76561198000000000\""));
    }

    #[test]
    fn local_vdf_nests_the_token_under_the_crc_named_key() {
        let vdf = local_vdf("orbit_user", "deadbeef");
        assert!(vdf.contains("\"ConnectCache\""));
        assert!(vdf.contains(&format!(
            "\"{}\"\t\t\"deadbeef\"",
            connect_cache_key("orbit_user")
        )));
    }

    #[test]
    fn reads_back_only_this_accounts_saved_blob() {
        let vdf = local_vdf("orbit_user", "01000000d08c9ddf");
        assert_eq!(
            saved_token_hex(&vdf, "orbit_user"),
            Some("01000000d08c9ddf")
        );
        assert_eq!(saved_token_hex(&vdf, "someone_else"), None);
        assert_eq!(
            saved_token_hex(&local_vdf("orbit_user", "zz"), "orbit_user"),
            None
        );
        let outside = format!(
            "\"Other\"\n{{\n\t\"{}\"\t\t\"01000000d08c9ddf\"\n}}\n",
            connect_cache_key("orbit_user")
        );
        assert_eq!(saved_token_hex(&outside, "orbit_user"), None);
        assert_eq!(unhex("000fa0FF"), Some(vec![0x00, 0x0f, 0xa0, 0xff]));
        assert_eq!(unhex("abc"), None);
        assert_eq!(unhex("zz"), None);
    }
}
