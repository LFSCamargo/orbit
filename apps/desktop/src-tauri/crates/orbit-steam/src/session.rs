//! Saved Steam identity. Tokens never appear in Debug output.
use serde::{Deserialize, Serialize};

const MAX_ACCOUNT: usize = 64;
const MAX_STEAM_ID: usize = 20;

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSession {
    pub account_name: String,
    pub steam_id: String,
}

impl std::fmt::Debug for NativeSession {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("NativeSession")
            .field("account_name", &self.account_name)
            .field("steam_id", &self.steam_id)
            .finish()
    }
}

impl NativeSession {
    pub fn parse(account_name: &str, steam_id: &str) -> Result<Self, String> {
        if !valid_account_name(account_name) {
            return Err("Steam account name is missing".into());
        }
        if !valid_steam_id(steam_id) {
            return Err("Steam id is missing".into());
        }
        Ok(Self {
            account_name: account_name.to_string(),
            steam_id: steam_id.to_string(),
        })
    }
}

pub fn valid_account_name(name: &str) -> bool {
    let len = name.len();
    (1..=MAX_ACCOUNT).contains(&len)
        && name
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-' | b'.'))
}

pub fn valid_steam_id(id: &str) -> bool {
    let len = id.len();
    (1..=MAX_STEAM_ID).contains(&len) && id.bytes().all(|c| c.is_ascii_digit()) && id != "0"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_saved_identity_and_rejects_secrets_shaped_input() {
        let session = NativeSession::parse("orbit_user", "76561198000000000").unwrap();
        assert_eq!(session.account_name, "orbit_user");
        assert!(NativeSession::parse("", "76561198000000000").is_err());
        assert!(NativeSession::parse("orbit_user", "0").is_err());
        assert!(NativeSession::parse("orbit user", "76561198000000000").is_err());
        assert!(valid_account_name("a_b-c.d"));
        assert!(!valid_steam_id("abc"));
    }
}
