//! Native session from the signed-in Windows Steam prefix and the Orbit QR login.
//! The refresh token is stored for Play and is never written to logs.
use std::io::Read;
use std::path::Path;

use orbit_steam::NativeSession;
use serde::{Deserialize, Serialize};

use crate::utils::steam_account::{self, most_recent_account};

const SESSION_FILE: &str = "native-session.json";

#[derive(Clone, Serialize, Deserialize)]
struct StoredSession {
    account_name: String,
    steam_id: String,
    refresh_token: String,
    /// True only after Steam's own window wrote this token. A website sign-in
    /// cannot log a game container on.
    #[serde(default)]
    client_login: bool,
}

impl std::fmt::Debug for StoredSession {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("StoredSession")
            .field("account_name", &self.account_name)
            .field("steam_id", &self.steam_id)
            .field("client_login", &self.client_login)
            .finish()
    }
}

pub fn from_prefix(prefix: &Path) -> Result<NativeSession, String> {
    let loginusers = prefix.join("drive_c/Program Files (x86)/Steam/config/loginusers.vdf");
    if loginusers
        .symlink_metadata()
        .is_ok_and(|meta| meta.file_type().is_symlink())
    {
        return Err("Steam login file cannot be a symlink".into());
    }
    let file = std::fs::File::open(&loginusers)
        .map_err(|_| "Sign in with Steam before playing this game".to_string())?;
    let mut content = String::new();
    file.take(8 * 1024 * 1024)
        .read_to_string(&mut content)
        .map_err(|_| "Steam login file could not be read".to_string())?;
    let account = most_recent_account(&content)
        .ok_or_else(|| "Sign in with Steam before playing this game".to_string())?;
    if !steam_account::valid_account_name(&account.name) {
        return Err("Sign in with Steam before playing this game".into());
    }
    NativeSession::parse(&account.name, &account.steam_id)
}

pub fn store_refresh(
    session_dir: &Path,
    account_name: &str,
    steam_id: &str,
    refresh_token: &str,
) -> Result<(), String> {
    persist_session(session_dir, account_name, steam_id, refresh_token, false)
}

fn persist_session(
    session_dir: &Path,
    account_name: &str,
    steam_id: &str,
    refresh_token: &str,
    client_login: bool,
) -> Result<(), String> {
    let session = NativeSession::parse(account_name, steam_id)?;
    if refresh_token.len() < 20 || refresh_token.len() > 4096 || refresh_token.contains('\0') {
        return Err("Steam session could not be saved".into());
    }
    let stored = StoredSession {
        account_name: session.account_name,
        steam_id: session.steam_id,
        refresh_token: refresh_token.to_string(),
        client_login,
    };
    std::fs::create_dir_all(session_dir).map_err(|err| err.to_string())?;
    let path = session_dir.join(SESSION_FILE);
    if path
        .symlink_metadata()
        .is_ok_and(|meta| meta.file_type().is_symlink())
    {
        return Err("Steam session file cannot be a symlink".into());
    }
    let body = serde_json::to_vec(&stored).map_err(|_| "Steam session could not be saved")?;
    std::fs::write(&path, body).map_err(|err| err.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

/// Write the saved Orbit session into a game container. Does not start Steam.
pub fn apply_to_prefix(prefix: &Path, session_dir: &Path) -> Result<(), String> {
    let Some(stored) = load_stored(session_dir) else {
        return Ok(());
    };
    let config = prefix.join("drive_c/Program Files (x86)/Steam/config");
    std::fs::create_dir_all(&config).map_err(|err| err.to_string())?;
    let login_path = config.join("loginusers.vdf");
    let config_path = config.join("config.vdf");
    write_login_file(&login_path, &login_users(&stored))?;
    write_login_file(&config_path, &client_config(&stored))
}

fn login_users(stored: &StoredSession) -> String {
    format!(
        "\"users\"\n{{\n\t\"{id}\"\n\t{{\n\t\t\"AccountName\"\t\t\"{name}\"\n\t\t\"PersonaName\"\t\t\"{name}\"\n\t\t\"RememberPassword\"\t\t\"1\"\n\t\t\"MostRecent\"\t\t\"1\"\n\t\t\"AllowAutoLogin\"\t\t\"1\"\n\t}}\n}}\n",
        id = stored.steam_id,
        name = stored.account_name,
    )
}

fn client_config(stored: &StoredSession) -> String {
    format!(
        "\"InstallConfigStore\"\n{{\n\t\"Software\"\n\t{{\n\t\t\"Valve\"\n\t\t{{\n\t\t\t\"Steam\"\n\t\t\t{{\n\t\t\t\t\"Accounts\"\n\t\t\t\t{{\n\t\t\t\t\t\"{name}\"\n\t\t\t\t\t{{\n\t\t\t\t\t\t\"SteamID\"\t\t\"{id}\"\n\t\t\t\t\t\t\"RefreshToken\"\t\t\"{token}\"\n\t\t\t\t\t}}\n\t\t\t\t}}\n\t\t\t}}\n\t\t}}\n\t}}\n}}\n",
        name = stored.account_name,
        id = stored.steam_id,
        token = stored.refresh_token,
    )
}

fn write_login_file(path: &Path, body: &str) -> Result<(), String> {
    if path
        .symlink_metadata()
        .is_ok_and(|meta| meta.file_type().is_symlink())
    {
        return Err("Steam login file cannot be a symlink".into());
    }
    std::fs::write(path, body).map_err(|err| err.to_string())
}

/// A Steam client has saved a login this prefix can reuse: a `RefreshToken`
/// in `config.vdf` (older clients) or a `ConnectCache` entry in the user's
/// `local.vdf` (current clients). A web cookie and a still-open "Logged On"
/// line are not required. The token is not returned.
pub fn client_login_ready(prefix: &Path) -> bool {
    let Some(account) = saved_account(prefix) else {
        return false;
    };
    config_token(prefix, &account.name).is_some() || connect_cache_entry(prefix, &account.name)
}

/// The first prefix whose Steam client is logged on with a saved refresh token.
pub fn first_ready_prefix<'a>(prefixes: impl IntoIterator<Item = &'a Path>) -> Option<&'a Path> {
    prefixes
        .into_iter()
        .find(|prefix| client_login_ready(prefix))
}

/// Whether the sign-in prefix holds a login Play has not stored yet: nothing
/// is saved, the saved token is not a client token, or Steam saved its login
/// after Orbit did.
pub fn needs_capture(prefix: &Path, session_dir: &Path) -> bool {
    if !client_login_ready(prefix) {
        return false;
    }
    if !has_saved(session_dir) {
        return true;
    }
    let modified = |path: &Path| path.metadata().and_then(|meta| meta.modified()).ok();
    let Some(saved) = modified(&session_dir.join(SESSION_FILE)) else {
        return true;
    };
    let steam = crate::runtimes::containers::steam::steam_root(prefix);
    let mut sources = vec![steam.join("config/config.vdf")];
    sources.extend(local_vdf_files(prefix));
    sources
        .iter()
        .filter_map(|path| modified(path))
        .any(|time| time > saved)
}

/// Save the client token Steam's own window wrote. `unwrap` reads the
/// DPAPI-wrapped `ConnectCache` entry for an account inside Wine; it is only
/// asked when `config.vdf` has no token. Only a client token for the signed-in
/// account is stored. Nothing to save is not an error.
pub fn capture_from_client(
    prefix: &Path,
    session_dir: &Path,
    unwrap: impl FnOnce(&str) -> Option<String>,
) -> Result<(), String> {
    let Some(account) = saved_account(prefix) else {
        return Ok(());
    };
    let token = config_token(prefix, &account.name)
        .filter(|token| orbit_steam::is_client_token(token, &account.steam_id))
        .or_else(|| {
            connect_cache_entry(prefix, &account.name)
                .then(|| unwrap(&account.name))
                .flatten()
                .map(|token| token.trim().to_string())
        });
    let Some(token) = token.filter(|token| {
        acceptable_refresh_token(token) && orbit_steam::is_client_token(token, &account.steam_id)
    }) else {
        return Ok(());
    };
    persist_session(session_dir, &account.name, &account.steam_id, &token, true)
}

fn saved_account(prefix: &Path) -> Option<steam_account::SteamAccount> {
    let steam = crate::runtimes::containers::steam::steam_root(prefix);
    let login = read_text_capped(&steam.join("config/loginusers.vdf"), 8 * 1024 * 1024).ok()??;
    let account = steam_account::most_recent_account(&login)?;
    steam_account::valid_account_name(&account.name).then_some(account)
}

fn config_token(prefix: &Path, account: &str) -> Option<String> {
    let steam = crate::runtimes::containers::steam::steam_root(prefix);
    let config = read_text_capped(&steam.join("config/config.vdf"), 8 * 1024 * 1024).ok()??;
    refresh_token_for_account(&config, account)
}

fn connect_cache_entry(prefix: &Path, account: &str) -> bool {
    local_vdf_files(prefix).iter().any(|path| {
        read_text_capped(path, 1024 * 1024)
            .ok()
            .flatten()
            .is_some_and(|text| orbit_steam::saved_token_hex(&text, account).is_some())
    })
}

/// Each real Windows user's `AppData/Local/Steam/local.vdf` in the prefix.
fn local_vdf_files(prefix: &Path) -> Vec<std::path::PathBuf> {
    let Ok(entries) = std::fs::read_dir(prefix.join("drive_c/users")) else {
        return Vec::new();
    };
    entries
        .flatten()
        .take(16)
        .filter(|entry| entry.file_name() != "Public")
        .map(|entry| entry.path().join("AppData/Local/Steam/local.vdf"))
        .filter(|path| path.is_file())
        .collect()
}

fn read_text_capped(path: &Path, limit: u64) -> Result<Option<String>, String> {
    let Ok(meta) = path.symlink_metadata() else {
        return Ok(None);
    };
    if meta.file_type().is_symlink() {
        return Err("Steam login file cannot be a symlink".into());
    }
    if !meta.is_file() {
        return Ok(None);
    }
    let file = std::fs::File::open(path).map_err(|err| err.to_string())?;
    let mut text = String::new();
    file.take(limit + 1)
        .read_to_string(&mut text)
        .map_err(|err| err.to_string())?;
    if text.len() as u64 > limit {
        return Err("Steam login file is too large".into());
    }
    Ok(Some(text))
}

/// The `RefreshToken` inside `account`'s block of a Steam `config.vdf`.
fn refresh_token_for_account(config: &str, account: &str) -> Option<String> {
    if !steam_account::valid_account_name(account) {
        return None;
    }
    let mut depth = 0i32;
    // `None` outside the account, `Some(-1)` after its key and before `{`.
    let mut account_depth: Option<i32> = None;
    for line in config.lines().take(20_000) {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(key) = lone_key(trimmed) {
            let opens = trimmed.ends_with('{');
            if opens {
                depth += 1;
            }
            if account_depth.is_none() && key == account {
                account_depth = Some(if opens { depth } else { -1 });
            }
            continue;
        }
        if trimmed == "{" {
            depth += 1;
            if account_depth == Some(-1) {
                account_depth = Some(depth);
            }
            continue;
        }
        if trimmed.starts_with('}') {
            if account_depth == Some(depth) {
                return None;
            }
            depth = depth.saturating_sub(1);
            continue;
        }
        if account_depth == Some(-1) {
            account_depth = None;
        }
        if account_depth.is_some() {
            if let Some(token) = quoted_value(trimmed, "RefreshToken") {
                if acceptable_refresh_token(&token) {
                    return Some(token);
                }
            }
        }
    }
    None
}

fn lone_key(line: &str) -> Option<&str> {
    let rest = line.strip_prefix('"')?;
    let (key, after) = rest.split_once('"')?;
    let after = after.trim();
    if after.is_empty() || after == "{" {
        Some(key)
    } else {
        None
    }
}

fn quoted_value(line: &str, field: &str) -> Option<String> {
    let rest = line.strip_prefix('"')?;
    let (key, after) = rest.split_once('"')?;
    if key != field {
        return None;
    }
    let after = after.trim().strip_prefix('"')?;
    let (value, _) = after.split_once('"')?;
    (!value.is_empty()).then(|| value.to_string())
}

fn acceptable_refresh_token(token: &str) -> bool {
    (20..=4096).contains(&token.len())
        && token
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
}

/// The saved identity and refresh token the in-container agent logs on with.
/// The token is secret: callers hand it straight to the agent and never log it.
pub struct AgentCredentials {
    pub account_name: String,
    pub steam_id: String,
    pub refresh_token: String,
}

impl std::fmt::Debug for AgentCredentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AgentCredentials")
            .field("account_name", &self.account_name)
            .field("steam_id", &self.steam_id)
            .finish_non_exhaustive()
    }
}

/// Whether Steam's own window saved a login that game containers can use.
/// A website sign-in is not enough. Does not expose the token.
pub fn has_saved(session_dir: &Path) -> bool {
    agent_credentials(session_dir).is_some()
}

pub fn agent_credentials(session_dir: &Path) -> Option<AgentCredentials> {
    let stored = load_stored(session_dir)?;
    // Earlier builds marked a QR token copied back from a container as a client
    // login. Steam refuses it in a container, so it is not a session.
    if !stored.client_login
        || !orbit_steam::is_client_token(&stored.refresh_token, &stored.steam_id)
    {
        return None;
    }
    Some(AgentCredentials {
        account_name: stored.account_name,
        steam_id: stored.steam_id,
        refresh_token: stored.refresh_token,
    })
}

fn load_stored(session_dir: &Path) -> Option<StoredSession> {
    let path = session_dir.join(SESSION_FILE);
    let bytes = std::fs::read(&path).ok()?;
    if bytes.len() > 16 * 1024 {
        return None;
    }
    serde_json::from_slice(&bytes).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn reads_the_saved_windows_steam_account() {
        let root =
            std::env::temp_dir().join(format!("orbit-native-session-{}", uuid::Uuid::new_v4()));
        let config = root.join("drive_c/Program Files (x86)/Steam/config");
        fs::create_dir_all(&config).unwrap();
        fs::write(
            config.join("loginusers.vdf"),
            r#"
"users"
{
	"76561198000000000"
	{
		"AccountName"		"orbit_user"
		"MostRecent"		"1"
	}
}
"#,
        )
        .unwrap();
        let session = from_prefix(&root).unwrap();
        assert_eq!(session.account_name, "orbit_user");
        assert_eq!(session.steam_id, "76561198000000000");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn saved_refresh_session_is_written_for_play_and_omitted_from_debug() {
        let root = std::env::temp_dir().join(format!("orbit-refresh-{}", uuid::Uuid::new_v4()));
        let token = "a".repeat(40);
        store_refresh(&root, "orbit_user", "76561198000000000", &token).unwrap();
        let stored: StoredSession =
            serde_json::from_slice(&fs::read(root.join(SESSION_FILE)).unwrap()).unwrap();
        assert_eq!(stored.account_name, "orbit_user");
        assert!(format!("{stored:?}").contains("orbit_user"));
        assert!(!format!("{stored:?}").contains(&token));
        let prefix = root.join("prefix");
        apply_to_prefix(&prefix, &root).unwrap();
        let login = fs::read_to_string(
            prefix.join("drive_c/Program Files (x86)/Steam/config/loginusers.vdf"),
        )
        .unwrap();
        let client =
            fs::read_to_string(prefix.join("drive_c/Program Files (x86)/Steam/config/config.vdf"))
                .unwrap();
        assert!(login.contains("orbit_user"));
        assert!(client.contains(&token));
        assert!(!format!("{stored:?}").contains("RefreshToken"));
        assert!(!has_saved(&root));
        let _ = fs::remove_dir_all(&root);
        assert!(!has_saved(&root));
    }

    #[test]
    fn a_saved_website_login_is_not_a_container_session() {
        let root = std::env::temp_dir().join(format!("orbit-web-session-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        fs::write(
            root.join(SESSION_FILE),
            r#"{"account_name":"orbit_user","steam_id":"76561198000000000","refresh_token":"aaaaaaaaaaaaaaaaaaaa"}"#,
        )
        .unwrap();
        assert!(agent_credentials(&root).is_none());
        assert!(!has_saved(&root));
        let _ = fs::remove_dir_all(root);
    }

    const STEAM_ID: &str = "76561198000000000";

    /// A JWT shaped like Steam's: only its claims matter to Orbit.
    fn jwt(aud: &[&str], sub: &str) -> String {
        use base64::Engine;
        let claims = serde_json::json!({ "aud": aud, "sub": sub, "iss": "steam" }).to_string();
        format!(
            "eyJhbGciOiJFZERTQSJ9.{}.c2lnbmF0dXJl",
            base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(claims)
        )
    }

    fn client_jwt() -> String {
        jwt(&["client", "web", "renew", "derive"], STEAM_ID)
    }

    fn signed_in_prefix(root: &Path) -> std::path::PathBuf {
        let prefix = root.join("prefix");
        let config_dir = prefix.join("drive_c/Program Files (x86)/Steam/config");
        fs::create_dir_all(&config_dir).unwrap();
        fs::write(
            config_dir.join("loginusers.vdf"),
            "\"users\"\n{\n\t\"76561198000000000\"\n\t{\n\t\t\"AccountName\"\t\t\"orbit_user\"\n\t\t\"MostRecent\"\t\t\"1\"\n\t}\n}\n",
        )
        .unwrap();
        fs::write(
            config_dir.join("config.vdf"),
            "\"InstallConfigStore\"\n{\n\t\"Software\"\n\t{\n\t}\n}\n",
        )
        .unwrap();
        prefix
    }

    fn write_connect_cache(prefix: &Path) {
        let local = prefix.join("drive_c/users/player/AppData/Local/Steam/local.vdf");
        fs::create_dir_all(local.parent().unwrap()).unwrap();
        fs::write(
            &local,
            orbit_steam::local_vdf("orbit_user", "01000000d08c9ddf0115d1118c7a00c0"),
        )
        .unwrap();
    }

    #[test]
    fn a_current_client_login_is_unwrapped_from_its_connect_cache() {
        // Current Steam keeps the token only in local.vdf, wrapped with DPAPI.
        let root = std::env::temp_dir().join(format!("orbit-cc-capture-{}", uuid::Uuid::new_v4()));
        let prefix = signed_in_prefix(&root);
        let session = root.join("session");
        assert!(!client_login_ready(&prefix));
        capture_from_client(&prefix, &session, |_| panic!("nothing to unwrap")).unwrap();
        assert!(!has_saved(&session));

        write_connect_cache(&prefix);
        assert!(client_login_ready(&prefix));
        assert!(needs_capture(&prefix, &session));
        let token = client_jwt();
        let mut asked = None;
        capture_from_client(&prefix, &session, |account| {
            asked = Some(account.to_string());
            Some(format!("{token}\n"))
        })
        .unwrap();
        assert_eq!(asked.as_deref(), Some("orbit_user"));
        let saved = agent_credentials(&session).unwrap();
        assert_eq!(saved.refresh_token, token);
        assert_eq!(saved.steam_id, STEAM_ID);
        assert!(!needs_capture(&prefix, &session));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_website_token_is_never_saved_or_used_as_a_container_login() {
        // Regression: a QR token Orbit wrote into a container was read back as
        // a client login, and every container logon failed "Invalid Password".
        let root = std::env::temp_dir().join(format!("orbit-web-token-{}", uuid::Uuid::new_v4()));
        let prefix = signed_in_prefix(&root);
        write_connect_cache(&prefix);
        let session = root.join("session");
        let web = jwt(&["web", "renew", "derive"], STEAM_ID);
        capture_from_client(&prefix, &session, |_| Some(web.clone())).unwrap();
        assert!(!has_saved(&session));
        capture_from_client(&prefix, &session, |_| {
            Some(jwt(&["client"], "76561198000000001"))
        })
        .unwrap();
        assert!(!has_saved(&session), "another account's token");

        persist_session(&session, "orbit_user", STEAM_ID, &web, true).unwrap();
        assert!(agent_credentials(&session).is_none());
        assert!(
            needs_capture(&prefix, &session),
            "the bad session is replaced"
        );
        capture_from_client(&prefix, &session, |_| Some(client_jwt())).unwrap();
        assert_eq!(
            agent_credentials(&session).unwrap().refresh_token,
            client_jwt()
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_newer_settings_sign_in_replaces_the_saved_token() {
        let root = std::env::temp_dir().join(format!("orbit-newer-login-{}", uuid::Uuid::new_v4()));
        let prefix = signed_in_prefix(&root);
        write_connect_cache(&prefix);
        let session = root.join("session");
        capture_from_client(&prefix, &session, |_| Some(client_jwt())).unwrap();
        assert!(!needs_capture(&prefix, &session));
        let local = prefix.join("drive_c/users/player/AppData/Local/Steam/local.vdf");
        let later = std::time::SystemTime::now() + std::time::Duration::from_secs(60);
        fs::File::options()
            .write(true)
            .open(&local)
            .unwrap()
            .set_modified(later)
            .unwrap();
        assert!(needs_capture(&prefix, &session));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn window_sign_in_keeps_that_accounts_refresh_token() {
        let token = client_jwt();
        let other = jwt(&["client"], "76561198000000001");
        let config = format!(
            "\"InstallConfigStore\"\n{{\n\t\"Software\"\n\t{{\n\t\t\"Valve\"\n\t\t{{\n\t\t\t\"Steam\"\n\t\t\t{{\n\t\t\t\t\"Accounts\"\n\t\t\t\t{{\n\t\t\t\t\t\"other_user\"\n\t\t\t\t\t{{\n\t\t\t\t\t\t\"RefreshToken\"\t\t\"{other}\"\n\t\t\t\t\t}}\n\t\t\t\t\t\"orbit_user\"\n\t\t\t\t\t{{\n\t\t\t\t\t\t\"SteamID\"\t\t\"76561198000000000\"\n\t\t\t\t\t\t\"RefreshToken\"\t\t\"{token}\"\n\t\t\t\t\t}}\n\t\t\t\t}}\n\t\t\t}}\n\t\t}}\n\t}}\n}}\n"
        );
        assert_eq!(
            refresh_token_for_account(&config, "orbit_user").as_deref(),
            Some(token.as_str())
        );
        assert_eq!(
            refresh_token_for_account(&config, "other_user").as_deref(),
            Some(other.as_str())
        );
        let root = std::env::temp_dir().join(format!("orbit-capture-{}", uuid::Uuid::new_v4()));
        let prefix = root.join("prefix");
        let config_dir = prefix.join("drive_c/Program Files (x86)/Steam/config");
        fs::create_dir_all(&config_dir).unwrap();
        fs::write(
            config_dir.join("loginusers.vdf"),
            "\"users\"\n{\n\t\"76561198000000000\"\n\t{\n\t\t\"AccountName\"\t\t\"orbit_user\"\n\t\t\"MostRecent\"\t\t\"1\"\n\t}\n}\n",
        )
        .unwrap();
        fs::write(config_dir.join("config.vdf"), &config).unwrap();
        let session = root.join("session");
        capture_from_client(&prefix, &session, |_| None).unwrap();
        let saved = agent_credentials(&session).unwrap();
        assert_eq!(saved.account_name, "orbit_user");
        assert_eq!(saved.refresh_token, token);
        assert!(has_saved(&session));
        assert!(!format!("{saved:?}").contains(&token));
        // A client that saved the account but not a token leaves the session alone.
        fs::write(
            config_dir.join("config.vdf"),
            "\"InstallConfigStore\"\n{\n\t\"Software\"\n\t{\n\t\t\"Valve\"\n\t\t{\n\t\t\t\"Steam\"\n\t\t\t{\n\t\t\t\t\"Accounts\"\n\t\t\t\t{\n\t\t\t\t\t\"orbit_user\"\n\t\t\t\t\t{\n\t\t\t\t\t\t\"SteamID\"\t\t\"76561198000000000\"\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n}\n",
        )
        .unwrap();
        let empty = root.join("empty-session");
        capture_from_client(&prefix, &empty, |_| None).unwrap();
        assert!(agent_credentials(&empty).is_none());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_saved_refresh_token_stays_ready_when_the_log_moves_on() {
        let root = std::env::temp_dir().join(format!("orbit-ready-login-{}", uuid::Uuid::new_v4()));
        let waiting = root.join("sign-in");
        let saved = root.join("container");
        write_client_prefix(&waiting, false);
        write_client_prefix(&saved, true);
        assert!(!client_login_ready(&waiting));
        assert!(client_login_ready(&saved));
        assert_eq!(
            first_ready_prefix([waiting.as_path(), saved.as_path()]),
            Some(saved.as_path())
        );
        let _ = fs::remove_dir_all(root);
    }

    fn write_client_prefix(prefix: &std::path::Path, with_token: bool) {
        let steam = prefix.join("drive_c/Program Files (x86)/Steam");
        fs::create_dir_all(steam.join("config")).unwrap();
        fs::create_dir_all(steam.join("logs")).unwrap();
        fs::write(
            steam.join("config/loginusers.vdf"),
            "\"users\"\n{\n\t\"76561198000000000\"\n\t{\n\t\t\"AccountName\"\t\t\"orbit_user\"\n\t\t\"AutoLogin\"\t\t\"0\"\n\t}\n}\n",
        )
        .unwrap();
        let token = "c".repeat(40);
        let account = if with_token {
            format!("\"orbit_user\"\n{{\n\t\"RefreshToken\"\t\t\"{token}\"\n}}\n")
        } else {
            "\"orbit_user\"\n{\n\t\"SteamID\"\t\t\"76561198000000000\"\n}\n".to_string()
        };
        fs::write(
            steam.join("config/config.vdf"),
            format!(
                "\"InstallConfigStore\"\n{{\n\t\"Software\"\n\t{{\n\t\t\"Valve\"\n\t\t{{\n\t\t\t\"Steam\"\n\t\t\t{{\n\t\t\t\t\"Accounts\"\n\t\t\t\t{{\n\t\t\t\t\t{account}\t\t\t\t}}\n\t\t\t}}\n\t\t}}\n\t}}\n}}\n"
            ),
        )
        .unwrap();
        fs::write(
            steam.join("logs/connection_log.txt"),
            "[2026-11-17 00:46:34] [Logged On, 4, 7] [U:1:280673132] RecvMsgClientLogOnResponse()\n[2026-11-17 01:20:00] [Connecting, 4, 0] [U:1:280673132] LogOn() called\n",
        )
        .unwrap();
    }
}
