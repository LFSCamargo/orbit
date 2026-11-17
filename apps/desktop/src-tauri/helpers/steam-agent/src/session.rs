//! The request Orbit hands the agent, and the seed files it writes from it.
//! Pure and host-testable: the Windows DPAPI wrapping lives in `main.rs`, and
//! this module only decides what goes where. The refresh token is secret and is
//! never logged.
use serde::Deserialize;

/// Everything the agent needs for one launch, written by Orbit to a 0600 file
/// whose path arrives in `ORBIT_AGENT_SESSION`. The agent deletes it on read.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    pub account_name: String,
    pub steam_id: String,
    /// Secret. DPAPI-wrapped into the ConnectCache; never printed.
    pub refresh_token: String,
    /// Windows path to the container's Steam folder, e.g.
    /// `C:\Program Files (x86)\Steam`.
    pub steam_dir: String,
    /// Windows path to the container user's `AppData/Local/Steam/local.vdf`.
    pub local_vdf: String,
}

impl std::fmt::Debug for Request {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Request")
            .field("account_name", &self.account_name)
            .field("steam_id", &self.steam_id)
            .field("steam_dir", &self.steam_dir)
            .field("local_vdf", &self.local_vdf)
            .finish_non_exhaustive()
    }
}

impl Request {
    pub fn parse(bytes: &[u8]) -> Result<Self, String> {
        let request: Request =
            serde_json::from_slice(bytes).map_err(|_| "agent request is malformed".to_string())?;
        // Reuses the shared identity validator so the agent and Orbit agree on
        // what a well-formed account and id look like.
        orbit_steam::NativeSession::parse(&request.account_name, &request.steam_id)?;
        if request.refresh_token.len() < 20 || request.refresh_token.len() > 4096 {
            return Err("agent request token is out of range".into());
        }
        Ok(request)
    }

    /// `config/loginusers.vdf` contents for this account.
    pub fn loginusers_vdf(&self) -> String {
        orbit_steam::loginusers_vdf(&self.steam_id, &self.account_name)
    }

    /// `config/config.vdf` contents carrying the refresh token.
    pub fn config_vdf(&self) -> String {
        orbit_steam::config_vdf(&self.steam_id, &self.account_name, &self.refresh_token)
    }

    /// `local.vdf` contents wrapping the DPAPI blob (lowercase hex) for this
    /// account's ConnectCache entry.
    pub fn local_vdf(&self, token_hex: &str) -> String {
        orbit_steam::local_vdf(&self.account_name, token_hex)
    }

    pub fn steam_id_u64(&self) -> Result<u64, String> {
        self.steam_id
            .parse()
            .map_err(|_| "agent request steam id is not numeric".to_string())
    }
}

/// Lowercase hex of raw bytes, for the ConnectCache value.
pub fn hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Request {
        Request::parse(
            br#"{"accountName":"orbit_user","steamId":"76561198000000000","refreshToken":"eyJ0eXAiOiJKV1QiLCJhbGciOiJF", "steamDir":"C:\\Steam","localVdf":"C:\\local.vdf"}"#,
        )
        .unwrap()
    }

    #[test]
    fn parses_a_request_and_builds_the_seed_files() {
        let request = sample();
        assert_eq!(request.account_name, "orbit_user");
        assert_eq!(request.steam_id_u64().unwrap(), 76561198000000000);
        assert!(request.loginusers_vdf().contains("orbit_user"));
        assert!(request
            .config_vdf()
            .contains("eyJ0eXAiOiJKV1QiLCJhbGciOiJF"));
        assert!(request.local_vdf("deadbeef").contains("deadbeef"));
        // The token must not appear in Debug output.
        assert!(!format!("{request:?}").contains("eyJ0eXAiOiJKV1QiLCJhbGciOiJF"));
    }

    #[test]
    fn rejects_a_too_short_token() {
        assert!(Request::parse(
            br#"{"accountName":"orbit_user","steamId":"7656119800","refreshToken":"short","steamDir":"C:\\Steam","localVdf":"C:\\local.vdf"}"#
        )
        .is_err());
    }

    #[test]
    fn hex_is_lowercase_and_padded() {
        assert_eq!(hex(&[0x00, 0x0f, 0xa0, 0xff]), "000fa0ff");
    }
}
