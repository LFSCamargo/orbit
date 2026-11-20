//! Microsoft account link for Xbox Cloud Gaming using the device-code flow:
//! Orbit shows a code, the user enters it at microsoft.com/link, and Orbit
//! polls until it is approved. Only the refresh token and gamertag are
//! saved (0600, app data dir); access tokens and the device code never
//! reach the frontend. It signs in with xbox.com's own client, the one xCloud
//! issues streaming tokens to (`services/xcloud_stream`).

use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

/// xbox.com's public client. The older Xbox app client (`000000004C12AE6F`)
/// links the account but cannot get xCloud streaming tokens.
const CLIENT_ID: &str = "1f907974-e22b-4810-a9de-d9647380c97e";
const SCOPE: &str = "xboxlive.signin openid profile offline_access";
const DEVICE_CODE_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode";
const TOKEN_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
/// xCloud's `/connect` step takes a login.live.com token for this purpose,
/// minted from the same refresh token.
const TRANSFER_TOKEN_URL: &str = "https://login.live.com/oauth20_token.srf";
const TRANSFER_SCOPE: &str =
    "service::http://Passport.NET/purpose::PURPOSE_XBOX_CLOUD_CONSOLE_TRANSFER_TOKEN";
const USER_AUTH_URL: &str = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS_URL: &str = "https://xsts.auth.xboxlive.com/xsts/authorize";
const RESPONSE_LIMIT: usize = 64 * 1024;
const SESSION_FILE: &str = "session.json";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct XboxDeviceStart {
    pub user_code: String,
    pub verification_uri: String,
    pub interval_seconds: u64,
    pub expires_in_seconds: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct XboxAccount {
    pub gamertag: String,
    pub xuid: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct XboxDevicePoll {
    pub done: bool,
    pub account: Option<XboxAccount>,
}

#[derive(Debug, PartialEq, Eq)]
enum PollState {
    Pending,
    SlowDown,
    Approved {
        access_token: Zeroizing<String>,
        refresh_token: Zeroizing<String>,
    },
}

struct Pending {
    device_code: Zeroizing<String>,
    expires_at: Instant,
}

static PENDING: Mutex<Option<Pending>> = Mutex::new(None);

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSession {
    gamertag: String,
    xuid: String,
    refresh_token: String,
    /// The client the refresh token belongs to; a link from an older client
    /// counts as signed out so the user links again.
    #[serde(default)]
    client_id: String,
}

pub fn session_dir(app_data: &Path) -> PathBuf {
    app_data.join("xbox")
}

pub fn start() -> Result<XboxDeviceStart, String> {
    let body = post_form(
        DEVICE_CODE_URL,
        &[("client_id", CLIENT_ID), ("scope", SCOPE)],
    )?;
    let (start, device_code) = parse_device_code(&body)?;
    *PENDING.lock().map_err(|_| "Xbox sign-in is busy")? = Some(Pending {
        device_code,
        expires_at: Instant::now() + Duration::from_secs(start.expires_in_seconds),
    });
    Ok(start)
}

pub fn cancel() {
    if let Ok(mut pending) = PENDING.lock() {
        *pending = None;
    }
}

pub fn poll(session_dir: &Path) -> Result<XboxDevicePoll, String> {
    let device_code = {
        let mut guard = PENDING.lock().map_err(|_| "Xbox sign-in is busy")?;
        let Some(pending) = guard.as_ref() else {
            return Err("Xbox sign-in was cancelled".into());
        };
        if Instant::now() >= pending.expires_at {
            *guard = None;
            return Err("The code expired. Get a new code and try again".into());
        }
        pending.device_code.clone()
    };
    let body = post_form_any_status(
        TOKEN_URL,
        &[
            ("client_id", CLIENT_ID),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ("device_code", device_code.as_str()),
        ],
    )?;
    let state = match parse_poll_body(&body) {
        Ok(state) => state,
        Err(err) => {
            cancel();
            return Err(err);
        }
    };
    match state {
        PollState::Pending | PollState::SlowDown => Ok(XboxDevicePoll {
            done: false,
            account: None,
        }),
        PollState::Approved {
            access_token,
            refresh_token,
        } => {
            cancel();
            let account = xbox_account(&access_token)?;
            store_session(session_dir, &account, &refresh_token)?;
            Ok(XboxDevicePoll {
                done: true,
                account: Some(account),
            })
        }
    }
}

/// The linked account, read from disk without network access.
pub fn account(session_dir: &Path) -> Option<XboxAccount> {
    let stored = read_session(session_dir)?;
    Some(XboxAccount {
        gamertag: stored.gamertag,
        xuid: stored.xuid,
    })
}

/// The saved session, when it belongs to the current client.
fn read_session(session_dir: &Path) -> Option<StoredSession> {
    let body = Zeroizing::new(std::fs::read(session_dir.join(SESSION_FILE)).ok()?);
    let stored: StoredSession = serde_json::from_slice(&body).ok()?;
    (stored.client_id == CLIENT_ID).then_some(stored)
}

fn stored_refresh_token(session_dir: &Path) -> Result<Zeroizing<String>, String> {
    read_session(session_dir)
        .map(|stored| Zeroizing::new(stored.refresh_token))
        .ok_or_else(|| "Link your Xbox account in Settings first".to_string())
}

/// Microsoft rotates refresh tokens; keep the newest one.
fn rotate_refresh_token(session_dir: &Path, refresh_token: &str) -> Result<(), String> {
    let stored = read_session(session_dir).ok_or("Link your Xbox account in Settings first")?;
    let account = XboxAccount {
        gamertag: stored.gamertag,
        xuid: stored.xuid,
    };
    store_session(session_dir, &account, refresh_token)
}

/// A fresh Microsoft access token from the saved link, saving the rotated
/// refresh token. Network: one request.
pub(crate) fn refresh_access_token(session_dir: &Path) -> Result<Zeroizing<String>, String> {
    let refresh_token = stored_refresh_token(session_dir)?;
    let body = post_form_any_status(
        TOKEN_URL,
        &[
            ("client_id", CLIENT_ID),
            ("grant_type", "refresh_token"),
            ("scope", SCOPE),
            ("refresh_token", refresh_token.as_str()),
        ],
    )?;
    match parse_poll_body(&body) {
        Ok(PollState::Approved {
            access_token,
            refresh_token,
        }) => {
            rotate_refresh_token(session_dir, &refresh_token)?;
            Ok(access_token)
        }
        _ => Err("Your Xbox link expired. Link your Xbox account in Settings again".into()),
    }
}

/// The token xCloud's `/connect` step asks for once a stream is ready.
/// Network: one request. The saved v2 refresh token is left unchanged.
pub(crate) fn transfer_token(session_dir: &Path) -> Result<Zeroizing<String>, String> {
    let refresh_token = stored_refresh_token(session_dir)?;
    let body = post_form_any_status(
        TRANSFER_TOKEN_URL,
        &[
            ("client_id", CLIENT_ID),
            ("scope", TRANSFER_SCOPE),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token.as_str()),
        ],
    )?;
    parse_access_token(&body)
}

fn parse_access_token(body: &str) -> Result<Zeroizing<String>, String> {
    let value: serde_json::Value = serde_json::from_str(body)
        .map_err(|_| "Xbox Cloud Gaming could not confirm your account".to_string())?;
    value
        .get("access_token")
        .and_then(|v| v.as_str())
        .filter(|t| !t.is_empty() && t.len() <= 8192)
        .map(|t| Zeroizing::new(t.to_string()))
        .ok_or_else(|| "Xbox Cloud Gaming could not confirm your account".to_string())
}

/// `RpsTicket` for a consumers v2 access token.
fn rps_ticket(access_token: &str) -> Zeroizing<String> {
    Zeroizing::new(format!("d={access_token}"))
}

/// Microsoft access token → Xbox user token.
pub(crate) fn user_token(access_token: &str) -> Result<Zeroizing<String>, String> {
    let ticket = rps_ticket(access_token);
    let user = post_json(
        USER_AUTH_URL,
        &serde_json::json!({
            "Properties": {
                "AuthMethod": "RPS",
                "SiteName": "user.auth.xboxlive.com",
                "RpsTicket": ticket.as_str(),
            },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT",
        }),
    )?;
    parse_token(&user)
}

/// Xbox user token → XSTS response body for `relying_party`.
pub(crate) fn xsts(user_token: &str, relying_party: &str) -> Result<Zeroizing<String>, String> {
    post_json(
        XSTS_URL,
        &serde_json::json!({
            "Properties": { "SandboxId": "RETAIL", "UserTokens": [user_token] },
            "RelyingParty": relying_party,
            "TokenType": "JWT",
        }),
    )
    .map(Zeroizing::new)
}

pub(crate) fn xsts_token(body: &str) -> Result<Zeroizing<String>, String> {
    parse_token(body)
}

pub fn sign_out(session_dir: &Path) -> Result<(), String> {
    cancel();
    match std::fs::remove_file(session_dir.join(SESSION_FILE)) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("Xbox account could not be removed".into()),
    }
}

fn parse_device_code(body: &str) -> Result<(XboxDeviceStart, Zeroizing<String>), String> {
    let value: serde_json::Value =
        serde_json::from_str(body).map_err(|_| "Xbox sign-in could not start".to_string())?;
    let text = |key: &str| value.get(key).and_then(|v| v.as_str()).map(str::to_string);
    let user_code = text("user_code").filter(|c| {
        !c.is_empty()
            && c.len() <= 16
            && c.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-')
    });
    let verification_uri = text("verification_uri").filter(|uri| {
        uri.starts_with("https://www.microsoft.com/") || uri.starts_with("https://microsoft.com/")
    });
    let device_code = text("device_code").filter(|c| !c.is_empty() && c.len() <= 4096);
    let (Some(user_code), Some(verification_uri), Some(device_code)) =
        (user_code, verification_uri, device_code)
    else {
        return Err("Xbox sign-in could not start".into());
    };
    let interval_seconds = value
        .get("interval")
        .and_then(|v| v.as_u64())
        .unwrap_or(5)
        .clamp(1, 30);
    let expires_in_seconds = value
        .get("expires_in")
        .and_then(|v| v.as_u64())
        .unwrap_or(900)
        .clamp(60, 1800);
    Ok((
        XboxDeviceStart {
            user_code,
            verification_uri,
            interval_seconds,
            expires_in_seconds,
        },
        Zeroizing::new(device_code),
    ))
}

fn parse_poll_body(body: &str) -> Result<PollState, String> {
    let value: serde_json::Value = serde_json::from_str(body)
        .map_err(|_| "Xbox sign-in could not be confirmed".to_string())?;
    if let Some(error) = value.get("error").and_then(|e| e.as_str()) {
        return match error {
            "authorization_pending" => Ok(PollState::Pending),
            "slow_down" => Ok(PollState::SlowDown),
            "expired_token" => Err("The code expired. Get a new code and try again".into()),
            "access_denied" | "authorization_declined" => {
                Err("Sign-in was declined on the Microsoft page".into())
            }
            _ => Err("Xbox sign-in could not be confirmed".into()),
        };
    }
    let token = |key: &str| {
        value
            .get(key)
            .and_then(|v| v.as_str())
            .filter(|t| !t.is_empty() && t.len() <= 8192)
            .map(|t| Zeroizing::new(t.to_string()))
    };
    match (token("access_token"), token("refresh_token")) {
        (Some(access_token), Some(refresh_token)) => Ok(PollState::Approved {
            access_token,
            refresh_token,
        }),
        _ => Err("Xbox sign-in could not be confirmed".into()),
    }
}

/// Microsoft token → Xbox user token → XSTS, for the gamertag and XUID.
fn xbox_account(access_token: &str) -> Result<XboxAccount, String> {
    let user = user_token(access_token)?;
    parse_xsts_account(&xsts(&user, "http://xboxlive.com")?)
}

fn parse_token(body: &str) -> Result<Zeroizing<String>, String> {
    let value: serde_json::Value =
        serde_json::from_str(body).map_err(|_| "Xbox account could not be read".to_string())?;
    value
        .get("Token")
        .and_then(|t| t.as_str())
        .filter(|t| !t.is_empty())
        .map(|t| Zeroizing::new(t.to_string()))
        .ok_or_else(|| "Xbox account could not be read".to_string())
}

fn parse_xsts_account(body: &str) -> Result<XboxAccount, String> {
    let value: serde_json::Value =
        serde_json::from_str(body).map_err(|_| "Xbox account could not be read".to_string())?;
    let claims = value
        .pointer("/DisplayClaims/xui/0")
        .ok_or("This Microsoft account has no Xbox profile yet. Create one at xbox.com")?;
    let gamertag = claims
        .get("gtg")
        .and_then(|v| v.as_str())
        .filter(|g| !g.is_empty() && g.len() <= 32)
        .ok_or("Xbox account could not be read")?;
    let xuid = claims
        .get("xid")
        .and_then(|v| v.as_str())
        .filter(|x| !x.is_empty() && x.chars().all(|c| c.is_ascii_digit()))
        .ok_or("Xbox account could not be read")?;
    Ok(XboxAccount {
        gamertag: gamertag.to_string(),
        xuid: xuid.to_string(),
    })
}

fn store_session(dir: &Path, account: &XboxAccount, refresh_token: &str) -> Result<(), String> {
    let stored = Zeroizing::new(
        serde_json::to_vec(&StoredSession {
            gamertag: account.gamertag.clone(),
            xuid: account.xuid.clone(),
            refresh_token: refresh_token.to_string(),
            client_id: CLIENT_ID.to_string(),
        })
        .map_err(|_| "Xbox account could not be saved")?,
    );
    std::fs::create_dir_all(dir).map_err(|_| "Xbox account could not be saved")?;
    let path = dir.join(SESSION_FILE);
    if path
        .symlink_metadata()
        .is_ok_and(|meta| meta.file_type().is_symlink())
    {
        return Err("Xbox session file cannot be a symlink".into());
    }
    std::fs::write(&path, stored.as_slice()).map_err(|_| "Xbox account could not be saved")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent("Orbit")
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|_| "Xbox sign-in could not start".to_string())
}

fn post_form(url: &str, fields: &[(&str, &str)]) -> Result<String, String> {
    let response = http_client()?
        .post(url)
        .form(fields)
        .send()
        .map_err(|_| "Xbox sign-in could not reach Microsoft".to_string())?;
    if !response.status().is_success() {
        return Err("Xbox sign-in could not start".into());
    }
    read_limited(response)
}

/// The token endpoint answers pending/declined polls with HTTP 400.
fn post_form_any_status(url: &str, fields: &[(&str, &str)]) -> Result<String, String> {
    let response = http_client()?
        .post(url)
        .form(fields)
        .send()
        .map_err(|_| "Xbox sign-in could not reach Microsoft".to_string())?;
    read_limited(response)
}

fn post_json(url: &str, body: &serde_json::Value) -> Result<String, String> {
    let response = http_client()?
        .post(url)
        .header("x-xbl-contract-version", "1")
        // Xbox Live checks these for xbox.com's client.
        .header("Origin", "https://www.xbox.com")
        .header("Referer", "https://www.xbox.com/")
        .json(body)
        .send()
        .map_err(|_| "Xbox account could not be reached".to_string())?;
    if !response.status().is_success() {
        return Err("This Microsoft account could not sign in to Xbox".into());
    }
    read_limited(response)
}

fn read_limited(response: reqwest::blocking::Response) -> Result<String, String> {
    let mut body = Vec::new();
    response
        .take(RESPONSE_LIMIT as u64 + 1)
        .read_to_end(&mut body)
        .map_err(|_| "Xbox sign-in could not be read".to_string())?;
    if body.len() > RESPONSE_LIMIT {
        return Err("Xbox sign-in response was too large".into());
    }
    String::from_utf8(body).map_err(|_| "Xbox sign-in could not be read".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_device_code_response() {
        let (start, device) = parse_device_code(
            r#"{"user_code":"Y32E2FLD","device_code":"abc","verification_uri":"https://www.microsoft.com/link","interval":5,"expires_in":900}"#,
        )
        .unwrap();
        assert_eq!(start.user_code, "Y32E2FLD");
        assert_eq!(start.verification_uri, "https://www.microsoft.com/link");
        assert_eq!(start.interval_seconds, 5);
        assert_eq!(device.as_str(), "abc");
    }

    #[test]
    fn rejects_untrusted_verification_uri_and_bad_codes() {
        assert!(parse_device_code(
            r#"{"user_code":"ABC","device_code":"d","verification_uri":"https://evil.example/link"}"#
        )
        .is_err());
        assert!(parse_device_code(
            r#"{"user_code":"<script>","device_code":"d","verification_uri":"https://www.microsoft.com/link"}"#
        )
        .is_err());
        assert!(parse_device_code("nope").is_err());
    }

    #[test]
    fn poll_states() {
        assert_eq!(
            parse_poll_body(r#"{"error":"authorization_pending"}"#).unwrap(),
            PollState::Pending
        );
        assert_eq!(
            parse_poll_body(r#"{"error":"slow_down"}"#).unwrap(),
            PollState::SlowDown
        );
        assert!(parse_poll_body(r#"{"error":"expired_token"}"#)
            .unwrap_err()
            .contains("expired"));
        assert!(parse_poll_body(r#"{"error":"access_denied"}"#)
            .unwrap_err()
            .contains("declined"));
        assert!(matches!(
            parse_poll_body(r#"{"access_token":"a","refresh_token":"r"}"#).unwrap(),
            PollState::Approved { .. }
        ));
        assert!(parse_poll_body(r#"{"access_token":"a"}"#).is_err());
    }

    #[test]
    fn parses_xsts_claims() {
        let account = parse_xsts_account(
            r#"{"Token":"t","DisplayClaims":{"xui":[{"gtg":"Orbit Player","xid":"2533274800000000","uhs":"1"}]}}"#,
        )
        .unwrap();
        assert_eq!(account.gamertag, "Orbit Player");
        assert_eq!(account.xuid, "2533274800000000");
        assert!(parse_xsts_account(r#"{"DisplayClaims":{"xui":[]}}"#).is_err());
    }

    #[test]
    fn stores_reads_and_removes_session() {
        let dir = std::env::temp_dir().join(format!("orbit-xbox-{}", uuid::Uuid::new_v4()));
        let account = XboxAccount {
            gamertag: "Orbit Player".into(),
            xuid: "1".into(),
        };
        store_session(&dir, &account, "refresh-token").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(dir.join(SESSION_FILE))
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(mode & 0o777, 0o600);
        }
        assert_eq!(super::account(&dir), Some(account));
        sign_out(&dir).unwrap();
        assert_eq!(super::account(&dir), None);
        sign_out(&dir).unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn signs_in_with_the_xbox_web_client_so_cloud_streaming_works() {
        // xCloud only issues streaming tokens to xbox.com's client (as
        // Greenlight does); the old Xbox app client could not stream.
        assert_eq!(CLIENT_ID, "1f907974-e22b-4810-a9de-d9647380c97e");
        assert!(DEVICE_CODE_URL.starts_with("https://login.microsoftonline.com/consumers/"));
        assert!(SCOPE.contains("xboxlive.signin") && SCOPE.contains("offline_access"));
        assert_eq!(rps_ticket("abc").as_str(), "d=abc");
    }

    #[test]
    fn a_link_from_the_old_client_counts_as_signed_out() {
        let dir = std::env::temp_dir().join(format!("orbit-xbox-old-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join(SESSION_FILE),
            br#"{"gamertag":"Orbit Player","xuid":"1","refreshToken":"old"}"#,
        )
        .unwrap();
        assert_eq!(super::account(&dir), None);
        assert!(stored_refresh_token(&dir).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_refresh_keeps_the_account_and_saves_the_new_refresh_token() {
        let dir = std::env::temp_dir().join(format!("orbit-xbox-rot-{}", uuid::Uuid::new_v4()));
        let account = XboxAccount {
            gamertag: "Orbit Player".into(),
            xuid: "1".into(),
        };
        store_session(&dir, &account, "first").unwrap();
        assert_eq!(stored_refresh_token(&dir).unwrap().as_str(), "first");
        rotate_refresh_token(&dir, "second").unwrap();
        assert_eq!(stored_refresh_token(&dir).unwrap().as_str(), "second");
        assert_eq!(super::account(&dir), Some(account));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_connect_token_uses_the_cloud_console_transfer_scope() {
        assert!(TRANSFER_SCOPE.ends_with("PURPOSE_XBOX_CLOUD_CONSOLE_TRANSFER_TOKEN"));
        assert_eq!(
            parse_access_token(r#"{"access_token":"lpt","refresh_token":"r"}"#)
                .unwrap()
                .as_str(),
            "lpt"
        );
        assert!(parse_access_token(r#"{"error":"invalid_grant"}"#).is_err());
    }

    #[test]
    fn poll_without_pending_sign_in_fails() {
        cancel();
        let dir = std::env::temp_dir();
        assert!(poll(&dir).unwrap_err().contains("cancelled"));
    }
}
