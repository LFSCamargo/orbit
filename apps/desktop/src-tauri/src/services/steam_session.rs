//! Read only the managed Steam client's account-matched web session, in memory.
use zeroize::Zeroizing;

pub struct WebToken(Zeroizing<String>);
impl std::fmt::Debug for WebToken {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("WebToken([redacted])")
    }
}
impl WebToken {
    pub fn expose(&self) -> &str {
        &self.0
    }
}

use anyhow::{bail, Context, Result};
use base64::{
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
    Engine,
};
use rusqlite::{Connection, OpenFlags};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Stdio,
    sync::atomic::AtomicBool,
    time::{Duration, Instant},
};
const LIMIT: u64 = 1_048_576;
/// Valve's `steamLoginSecure` JWT expires after 24 hours; allow generous clock
/// skew before skipping the Wine unlock helper on clearly stale cookie files.
const COOKIE_FRESH_WINDOW: Duration = Duration::from_secs(36 * 60 * 60);
const HELPER: &[u8] = include_bytes!("../../assets/steam-session-helper.exe");

/// True when any user profile in `prefix` has a non-symlink Chromium `Cookies`
/// file modified within `COOKIE_FRESH_WINDOW`. Prevents spawning Wine on boot
/// to decrypt cookies that have been expired for days. O(profiles <= 16).
pub fn has_fresh_cookies(prefix: &Path) -> bool {
    let Ok(users) = fs::read_dir(prefix.join("drive_c/users")) else {
        return false;
    };
    let now = std::time::SystemTime::now();
    for user in users.flatten().take(16) {
        if !user.file_type().is_ok_and(|kind| kind.is_dir()) {
            continue;
        }
        let cookies = user
            .path()
            .join("AppData/Local/Steam/htmlcache/Default/Network/Cookies");
        let Ok(meta) = fs::symlink_metadata(&cookies) else {
            continue;
        };
        if !meta.is_file() || meta.file_type().is_symlink() {
            continue;
        }
        if meta
            .modified()
            .ok()
            .and_then(|mtime| now.duration_since(mtime).ok())
            .is_some_and(|age| age <= COOKIE_FRESH_WINDOW)
        {
            return true;
        }
    }
    false
}

fn cookie_token(raw: &[u8], host: &str, account: &str, now: u64) -> Result<WebToken> {
    let hash = Sha256::digest(host.as_bytes());
    let raw = raw.strip_prefix(hash.as_slice()).unwrap_or(raw);
    let value = Zeroizing::new(urlencoding::decode(std::str::from_utf8(raw)?)?.into_owned());
    let (id, token) = value
        .split_once("||")
        .context("Steam web session is not ready")?;
    if id != account || token.len() > 8192 {
        bail!("Steam web session does not match the signed-in account");
    }
    let mut parts = token.split('.');
    let _header = parts.next().context("Invalid Steam web session")?;
    let payload = parts.next().context("Invalid Steam web session")?;
    if parts.next().is_none() || parts.next().is_some() {
        bail!("Invalid Steam web session");
    }
    let payload = URL_SAFE_NO_PAD.decode(payload)?;
    let claims: serde_json::Value = serde_json::from_slice(&payload)?;
    if claims.get("sub").and_then(|v| v.as_str()) != Some(account)
        || claims.get("exp").and_then(|v| v.as_u64()).unwrap_or(0) <= now
    {
        bail!("Steam web session is expired or belongs to a different account");
    }
    Ok(WebToken(Zeroizing::new(token.to_string())))
}

fn limited_file(path: &Path, root: &Path) -> Result<Vec<u8>> {
    let canonical = path.canonicalize()?;
    if !canonical.starts_with(root) {
        bail!("Steam session path escapes the managed prefix");
    }
    let mut bytes = Vec::new();
    fs::File::open(canonical)?
        .take(LIMIT + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > LIMIT {
        bail!("Steam session file is too large");
    }
    Ok(bytes)
}

fn helper_in(root: &Path) -> Result<PathBuf> {
    let folder = root.join("orbit-helpers");
    if folder
        .symlink_metadata()
        .is_ok_and(|m| m.file_type().is_symlink())
    {
        bail!("Steam helper directory cannot be a symlink");
    }
    fs::create_dir_all(&folder)?;
    let target = folder.join("steam-session-helper.exe");
    if target
        .symlink_metadata()
        .is_ok_and(|m| m.file_type().is_symlink())
    {
        bail!("Steam helper cannot be a symlink");
    }
    if !target.exists() || limited_file(&target, root)? != HELPER {
        fs::write(&target, HELPER)?;
    }
    Ok(target)
}

fn unlock(
    wine: &Path,
    prefix: &Path,
    wrapped: &[u8],
    cookie: &[u8],
    timeout: Duration,
) -> Result<Zeroizing<Vec<u8>>> {
    let helper = helper_in(prefix)?;
    if wrapped.len() > 8192 || cookie.len() > 8192 {
        bail!("Steam session data is too large");
    }
    let hex = |bytes: &[u8]| {
        bytes
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>()
    };
    let input = Zeroizing::new(format!("{}\n{}", hex(wrapped), hex(cookie)));
    let mut child = super::steam_windows::steam_runtime_command(wine, prefix)
        .arg(helper)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()?;
    let write = child
        .stdin
        .take()
        .context("Missing Steam session pipe")?
        .write_all(input.as_bytes());
    if let Err(error) = write {
        // Reap even if a malformed input causes the helper to close its pipe.
        let kill = child.kill();
        let wait = child.wait();
        return Err(anyhow::anyhow!(
            "Steam session pipe failed: {error}; child cleanup: {kill:?}, {wait:?}"
        ));
    }
    let status =
        crate::runtimes::process::wait_bounded(&mut child, timeout, &AtomicBool::new(false))?;
    if !status.success() {
        bail!("Steam's existing web session could not be unlocked");
    }
    let mut bytes = Zeroizing::new(Vec::new());
    child
        .stdout
        .take()
        .context("Missing Steam session output")?
        .take(8193)
        .read_to_end(&mut bytes)?;
    if bytes.len() > 8192 {
        bail!("Steam session response exceeded its limit");
    }
    Ok(bytes)
}

/// At most 16 user folders and 16 Steam-domain cookies. No account/token data is logged.
pub fn web_token(wine: &Path, prefix: &Path, account: &str) -> Result<WebToken> {
    let prefix = prefix.canonicalize()?;
    let deadline = Instant::now() + Duration::from_secs(20);
    let now = chrono::Utc::now().timestamp().max(0) as u64;
    for user in fs::read_dir(prefix.join("drive_c/users"))?.take(16) {
        let user = user?;
        if !user.file_type()?.is_dir() {
            continue;
        }
        let browser = user.path().join("AppData/Local/Steam/htmlcache");
        let state = browser.join("Local State");
        let cookies = browser.join("Default/Network/Cookies");
        if !state.is_file() || !cookies.is_file() {
            continue;
        }
        let value: serde_json::Value = serde_json::from_slice(&limited_file(&state, &prefix)?)?;
        let wrapped = STANDARD.decode(
            value
                .pointer("/os_crypt/encrypted_key")
                .and_then(|v| v.as_str())
                .context("Steam web session key is not ready")?,
        )?;
        let wrapped = wrapped
            .strip_prefix(b"DPAPI")
            .context("Unsupported Steam browser session encryption")?;
        let path = cookies.canonicalize()?;
        if !path.starts_with(&prefix) {
            bail!("Steam cookie path escapes the managed prefix");
        }
        let database = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        database.busy_timeout(Duration::from_millis(500))?;
        let mut query = database.prepare("SELECT host_key,value,encrypted_value FROM cookies WHERE name=?1 AND host_key IN ('store.steampowered.com','.store.steampowered.com','steamcommunity.com','.steamcommunity.com') AND length(encrypted_value)<=8192 AND length(value)<=8192 LIMIT 16")?;
        let rows = query.query_map(["steamLoginSecure"], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Vec<u8>>(2)?,
            ))
        })?;
        for row in rows {
            let Some(remaining) = deadline.checked_duration_since(Instant::now()) else {
                bail!("Steam session inspection timed out");
            };
            let (host, plaintext, encrypted) = row?;
            let raw = if plaintext.is_empty() {
                match unlock(wine, &prefix, wrapped, &encrypted, remaining) {
                    Ok(raw) => raw,
                    Err(_) => continue,
                }
            } else {
                Zeroizing::new(plaintext.into_bytes())
            };
            if let Ok(token) = cookie_token(&raw, &host, account, now) {
                return Ok(token);
            }
        }
    }
    bail!("Steam is still preparing its authenticated web session")
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
    fn token(id: &str, expiry: u64) -> String {
        format!(
            "e30.{}.signature",
            URL_SAFE_NO_PAD.encode(serde_json::json!({"sub":id,"exp":expiry}).to_string())
        )
    }
    #[test]
    #[ignore = "requires ORBIT_TEST_STEAM_PREFIX and ORBIT_TEST_WINE for an existing signed-in client"]
    fn real_existing_session_loads_owned_games_without_authentication() {
        let prefix = PathBuf::from(std::env::var("ORBIT_TEST_STEAM_PREFIX").unwrap());
        let wine = PathBuf::from(std::env::var("ORBIT_TEST_WINE").unwrap());
        let file = prefix.join("drive_c/Program Files (x86)/Steam/config/loginusers.vdf");
        let account = crate::utils::steam_account::most_recent_account(
            &std::fs::read_to_string(file).unwrap(),
        )
        .unwrap();
        let token = web_token(&wine, &prefix, &account.steam_id).unwrap();
        let games = super::super::steam_qr::fetch_owned_games(token.expose()).unwrap();
        assert!(!games.is_empty());
        if let Ok(id) = std::env::var("ORBIT_TEST_STEAM_APP_ID") {
            assert!(games.iter().any(|game| game.app_id == id));
        }
        println!(
            "Existing authenticated client returned {} owned games",
            games.len()
        );
    }

    #[test]
    fn accepts_only_the_signed_in_accounts_unexpired_web_cookie() {
        let id = "76561197960265729";
        let raw = format!("{id}%7C%7C{}", token(id, 1000));
        let result = cookie_token(raw.as_bytes(), "store.steampowered.com", id, 500).unwrap();
        assert_eq!(result.expose(), token(id, 1000));
        assert!(!format!("{result:?}").contains("signature"));
        assert!(cookie_token(
            raw.as_bytes(),
            "store.steampowered.com",
            "76561197960265730",
            500
        )
        .is_err());
        assert!(cookie_token(raw.as_bytes(), "store.steampowered.com", id, 1001).is_err());
    }
    #[test]
    fn supports_chromiums_domain_bound_cookie_and_rejects_a_wrong_host() {
        use sha2::{Digest, Sha256};
        let id = "76561197960265729";
        let mut raw = Sha256::digest(b"store.steampowered.com").to_vec();
        raw.extend_from_slice(format!("{id}||{}", token(id, 1000)).as_bytes());
        assert!(cookie_token(&raw, "store.steampowered.com", id, 500).is_ok());
        assert!(cookie_token(&raw, "steamcommunity.com", id, 500).is_err());
    }

    #[test]
    fn fresh_cookies_check_skips_missing_and_expired_cookie_files() {
        let root = std::env::temp_dir().join(format!("orbit-cookies-{}", uuid::Uuid::new_v4()));
        assert!(!has_fresh_cookies(&root));
        let cookies =
            root.join("drive_c/users/player/AppData/Local/Steam/htmlcache/Default/Network/Cookies");
        fs::create_dir_all(cookies.parent().unwrap()).unwrap();
        fs::write(&cookies, b"sqlite").unwrap();
        assert!(has_fresh_cookies(&root));
        let stale = std::time::SystemTime::now() - Duration::from_secs(48 * 60 * 60);
        fs::File::options()
            .write(true)
            .open(&cookies)
            .unwrap()
            .set_modified(stale)
            .unwrap();
        assert!(!has_fresh_cookies(&root));
        let _ = fs::remove_dir_all(root);
    }
}
