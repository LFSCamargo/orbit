//! Microsoft Store PC authentication: Windows device credential provisioning
//! (`device.json`) and TokenBroker sign-in (`msstore_session.json`) using a
//! locked-down Tauri `WebviewWindow` with a strict Microsoft host allowlist.
//!
//! Security invariants:
//! - Existing Xbox Cloud Gaming (`session.json`) is never touched or cleared.
//! - Both `device.json` and `msstore_session.json` are written mode `0600`
//!   and symlinks are strictly refused.
//! - Secrets live in `Zeroizing` containers in Rust memory and are never logged
//!   or returned to the frontend.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use orbit_msstore::clep::{build_clep_v2, obfuscate_clep, HardwareFingerprint};
use orbit_msstore::soap::{
    build_device_add_credential_request, build_rst2_request, parse_device_add_credential_response,
    parse_rst2_response, DEVICE_ADD_CREDENTIAL_URL, INLINE_LOGIN_URL, RST2_URL,
};
use orbit_msstore::splicense::SpLicense;
use orbit_msstore::{is_allowed_login_url, MAX_CONTROL_RESPONSE_BYTES};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use zeroize::Zeroizing;

use crate::runtimes::{components, wine_capabilities};
use crate::services::steam_windows;

const DEVICE_FILE: &str = "msstore_device.json";
const SESSION_FILE: &str = "msstore_session.json";
pub const LOGIN_WINDOW_LABEL: &str = "msstore-login";

const LOGIN_INIT_SCRIPT: &str = r#"
(function() {
  if (window.__orbitMsStoreBridge) return;
  window.__orbitMsStoreBridge = true;
  window.external = window.external || {};
  window.external.notify = function(payload) {
    try {
      var parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (parsed && parsed.daToken && window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
        window.__TAURI_INTERNALS__.invoke('msstore_auth_complete', {
          daToken: String(parsed.daToken),
          accountLabel: parsed.accountLabel ? String(parsed.accountLabel) : null
        });
      }
    } catch (_) {}
  };
})();
"#;

/// Public status sent to the frontend; contains zero tokens or keys.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MsStoreAccountStatus {
    pub signed_in: bool,
    pub device_ready: bool,
    pub account_label: Option<String>,
    pub gamertag: Option<String>,
    pub xuid: Option<String>,
    pub wine_ready: bool,
    pub xgameruntime_installed: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredDevice {
    device_name: String,
    password: String,
    puid: String,
    hardware_id_b64: String,
    device_key_b64: String,
    device_da_token: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSession {
    account_label: Option<String>,
    gamertag: Option<String>,
    xuid: Option<String>,
    user_da_token: String,
    #[serde(default)]
    updated_at: String,
}

pub fn session_dir(app_data: &Path) -> PathBuf {
    crate::services::xbox_auth::session_dir(app_data)
}

/// Computes current Microsoft Store PC readiness without performing network I/O.
pub fn status(
    session_dir: &Path,
    runtimes_root: &Path,
    repo: Option<&crate::database::GameRepository>,
) -> MsStoreAccountStatus {
    let device_ready = read_device(session_dir).is_some();
    let session = read_session(session_dir);
    let xcloud_account = crate::services::xbox_auth::account(session_dir);

    let wine_ready = repo
        .and_then(steam_windows::play_wine_binary)
        .or_else(|| wine_capabilities::installed_crossover(runtimes_root))
        .and_then(|wine| wine_capabilities::inspect(&wine).ok())
        .is_some_and(|caps| caps.msstore_file_map);

    let xgameruntime_installed = components::is_installed(runtimes_root, "xgameruntime");

    MsStoreAccountStatus {
        signed_in: session.is_some(),
        device_ready,
        account_label: session.as_ref().and_then(|s| s.account_label.clone()),
        gamertag: session
            .as_ref()
            .and_then(|s| s.gamertag.clone())
            .or_else(|| xcloud_account.as_ref().map(|a| a.gamertag.clone())),
        xuid: session
            .as_ref()
            .and_then(|s| s.xuid.clone())
            .or_else(|| xcloud_account.as_ref().map(|a| a.xuid.clone())),
        wine_ready,
        xgameruntime_installed,
    }
}

/// Validates a navigation URL for the TokenBroker login webview.
pub fn validate_login_navigation(url: &str) -> bool {
    is_allowed_login_url(url)
}

/// Opens Orbit's locked-down Microsoft Store TokenBroker login webview.
/// Only HTTPS Microsoft authentication domains are allowed by `on_navigation`.
pub fn open_login_window(app: &AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window(LOGIN_WINDOW_LABEL) {
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(());
    }
    let login_url = format!(
        "{INLINE_LOGIN_URL}?id=292543&bk=1&wa=wsignin1.0&wreply=https://login.live.com/oauth20_desktop.srf"
    );
    if !validate_login_navigation(&login_url) {
        return Err("Microsoft Store login URL failed allowlist check".into());
    }
    let parsed = tauri::Url::parse(&login_url)
        .map_err(|_| "Microsoft Store login URL could not be parsed".to_string())?;
    WebviewWindowBuilder::new(app, LOGIN_WINDOW_LABEL, WebviewUrl::External(parsed))
        .title("Sign in to Microsoft Store")
        .inner_size(520.0, 680.0)
        .resizable(true)
        .initialization_script(LOGIN_INIT_SCRIPT)
        .on_navigation(|url| validate_login_navigation(url.as_str()))
        .build()
        .map_err(|err| format!("Could not open Microsoft Store sign-in window: {err}"))?;
    Ok(())
}

/// Closes the login webview if it is currently open.
pub fn cancel_login_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(LOGIN_WINDOW_LABEL) {
        let _ = window.close();
    }
}

/// Completes sign-in once the TokenBroker webview hands over the user's DA token.
pub fn complete_sign_in(
    session_dir: &Path,
    da_token: &str,
    account_label: Option<String>,
) -> Result<(), String> {
    let trimmed = da_token.trim();
    if trimmed.is_empty() || trimmed.len() > 16_384 || trimmed.chars().any(char::is_control) {
        return Err("Microsoft Store sign-in returned an invalid token".into());
    }
    let xcloud = crate::services::xbox_auth::account(session_dir);
    let session = StoredSession {
        account_label: account_label
            .map(|label| label.trim().chars().take(128).collect::<String>())
            .filter(|label| !label.is_empty()),
        gamertag: xcloud.as_ref().map(|a| a.gamertag.clone()),
        xuid: xcloud.as_ref().map(|a| a.xuid.clone()),
        user_da_token: trimmed.to_string(),
        updated_at: chrono::Utc::now().to_rfc3339(),
    };
    write_secret_json(session_dir, SESSION_FILE, &session)
}

/// Signs out of Microsoft Store PC installs only; preserves xCloud and all saved games.
pub fn sign_out(session_dir: &Path) -> Result<(), String> {
    match std::fs::remove_file(session_dir.join(SESSION_FILE)) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("Microsoft Store session could not be removed".into()),
    }
}

/// Ensures a Windows CLEP device identity exists on disk, provisioning one via
/// `deviceaddcredential.srf` + `RST2.srf` if not yet stored.
pub fn ensure_device_identity(session_dir: &Path) -> Result<Zeroizing<String>, String> {
    if let Some(device) = read_device(session_dir) {
        return Ok(Zeroizing::new(device.device_da_token));
    }
    let fingerprint = HardwareFingerprint::collect_local();
    let mut rand_bytes = [0u8; 24];
    rand::thread_rng().fill_bytes(&mut rand_bytes);
    let device_name = format!(
        "11Orbit{:08X}",
        u32::from_le_bytes([rand_bytes[0], rand_bytes[1], rand_bytes[2], rand_bytes[3]])
    );
    let password = B64.encode(&rand_bytes[4..20]);
    let iv = u32::from_le_bytes([
        rand_bytes[20],
        rand_bytes[21],
        rand_bytes[22],
        rand_bytes[23],
    ]);

    let clep_plain = build_clep_v2(&fingerprint, &[]);
    let clep_obf = obfuscate_clep(&clep_plain, iv);
    let clep_b64 = B64.encode(clep_obf);
    let add_xml = build_device_add_credential_request(&device_name, &password, &clep_b64);

    let client = http_client()?;
    let add_resp = post_xml(&client, DEVICE_ADD_CREDENTIAL_URL, &add_xml)?;
    let cred = parse_device_add_credential_response(&add_resp).map_err(|e| e.to_string())?;

    let device_key = cred
        .device_license_b64
        .as_deref()
        .and_then(|b64| B64.decode(b64).ok())
        .and_then(|raw| SpLicense::parse(&raw).ok())
        .and_then(|lic| lic.device_key().ok())
        .unwrap_or_else(|| Zeroizing::new([0u8; 16]));

    let rst2_xml = build_rst2_request(
        &device_name,
        &password,
        &[("http://Passport.NET/tb", "MBI_SSL")],
        None,
    );
    let rst2_resp = post_xml(&client, RST2_URL, &rst2_xml)?;
    let tokens = parse_rst2_response(&rst2_resp).map_err(|e| e.to_string())?;
    let da_token = tokens
        .into_iter()
        .next()
        .map(|t| t.token)
        .ok_or_else(|| "Microsoft did not return a device security token".to_string())?;

    let stored = StoredDevice {
        device_name,
        password,
        puid: cred.puid,
        hardware_id_b64: B64.encode(&fingerprint.smbios),
        device_key_b64: B64.encode(*device_key),
        device_da_token: da_token.to_string(),
    };
    write_secret_json(session_dir, DEVICE_FILE, &stored)?;
    Ok(da_token)
}

/// Returns the unpacked 16-byte device key used to unwrap `SPLicenseBlock` CIKs.
pub fn device_key(session_dir: &Path) -> Result<Zeroizing<[u8; 16]>, String> {
    let device = read_device(session_dir)
        .ok_or_else(|| "Sign in to Microsoft Store in Settings first".to_string())?;
    let bytes = B64
        .decode(device.device_key_b64.trim())
        .map_err(|_| "Stored Microsoft device key is corrupt".to_string())?;
    if bytes.len() != 16 {
        return Err("Stored Microsoft device key has invalid length".into());
    }
    let mut key = Zeroizing::new([0u8; 16]);
    key.copy_from_slice(&bytes);
    Ok(key)
}

/// Returns the base64 hardware ID bound to this device license.
pub fn hardware_id_b64(session_dir: &Path) -> Result<String, String> {
    let device = read_device(session_dir)
        .ok_or_else(|| "Sign in to Microsoft Store in Settings first".to_string())?;
    Ok(device.hardware_id_b64)
}

/// Exchanges the stored device identity for a `www.microsoft.com` `MBI_SSL` compact token.
pub fn device_ms_token(session_dir: &Path) -> Result<Zeroizing<String>, String> {
    let _ = ensure_device_identity(session_dir)?;
    let device = read_device(session_dir)
        .ok_or_else(|| "Microsoft device identity is unavailable".to_string())?;
    let rst2_xml = build_rst2_request(
        &device.device_name,
        &device.password,
        &[("www.microsoft.com", "MBI_SSL")],
        None,
    );
    let client = http_client()?;
    let resp = post_xml(&client, RST2_URL, &rst2_xml)?;
    let tokens = parse_rst2_response(&resp).map_err(|e| e.to_string())?;
    tokens
        .into_iter()
        .next()
        .map(|t| t.token)
        .ok_or_else(|| "Could not obtain Microsoft device Store token".to_string())
}

/// Exchanges the signed-in user's TokenBroker session for a target/policy token
/// (e.g. `("www.microsoft.com", "MBI_SSL")` or `("user.auth.xboxlive.com", "MBI_SSL")`).
pub fn exchange_user_token(
    session_dir: &Path,
    target: &str,
    policy: &str,
) -> Result<Zeroizing<String>, String> {
    let session = read_session(session_dir)
        .ok_or_else(|| "Sign in to Microsoft Store in Settings first".to_string())?;
    let device_da = ensure_device_identity(session_dir)?;
    let rst2_xml = build_rst2_request(
        "user",
        &session.user_da_token,
        &[(target, policy)],
        Some(device_da.as_str()),
    );
    let client = http_client()?;
    let resp = post_xml(&client, RST2_URL, &rst2_xml)?;
    let tokens = parse_rst2_response(&resp).map_err(|e| e.to_string())?;
    tokens
        .into_iter()
        .next()
        .map(|t| t.token)
        .ok_or_else(|| format!("Could not exchange Microsoft Store token for {target}"))
}

/// Returns an XSTS `XBL3.0 x=<uhs>;<token>` Authorization header for `http://update.xboxlive.com`
/// (used by `packagespc.xboxlive.com/GetBasePackage/{contentId}`).
pub fn xsts_update_auth_header(session_dir: &Path) -> Result<Zeroizing<String>, String> {
    // Prefer Orbit's existing Xbox Live OAuth session if linked (same MSA), falling back
    // to TokenBroker exchange for user.auth.xboxlive.com.
    let user_token = if let Ok(access) = crate::services::xbox_auth::refresh_access_token(session_dir)
    {
        crate::services::xbox_auth::user_token(&access)?
    } else {
        exchange_user_token(session_dir, "user.auth.xboxlive.com", "MBI_SSL")?
    };
    let xsts_body = crate::services::xbox_auth::xsts(&user_token, "http://update.xboxlive.com")?;
    let value: serde_json::Value = serde_json::from_str(&xsts_body)
        .map_err(|_| "Xbox update authorization could not be parsed".to_string())?;
    let token = value
        .get("Token")
        .and_then(|v| v.as_str())
        .filter(|t| !t.is_empty())
        .ok_or("Xbox update authorization missing Token")?;
    let uhs = value
        .pointer("/DisplayClaims/xui/0/uhs")
        .and_then(|v| v.as_str())
        .filter(|u| !u.is_empty())
        .ok_or("Xbox update authorization missing UHS")?;
    Ok(Zeroizing::new(format!("XBL3.0 x={uhs};{token}")))
}

fn read_device(dir: &Path) -> Option<StoredDevice> {
    read_secret_json(dir, DEVICE_FILE)
}

fn read_session(dir: &Path) -> Option<StoredSession> {
    read_secret_json(dir, SESSION_FILE)
}

fn read_secret_json<T: for<'de> Deserialize<'de>>(dir: &Path, file_name: &str) -> Option<T> {
    let path = dir.join(file_name);
    if path
        .symlink_metadata()
        .is_ok_and(|meta| meta.file_type().is_symlink())
    {
        return None;
    }
    let raw = Zeroizing::new(std::fs::read(&path).ok()?);
    serde_json::from_slice(&raw).ok()
}

fn write_secret_json<T: Serialize>(dir: &Path, file_name: &str, value: &T) -> Result<(), String> {
    let bytes = Zeroizing::new(
        serde_json::to_vec(value)
            .map_err(|_| "Microsoft Store credentials could not be serialized".to_string())?,
    );
    std::fs::create_dir_all(dir)
        .map_err(|_| "Microsoft Store session folder could not be created".to_string())?;
    let path = dir.join(file_name);
    if path
        .symlink_metadata()
        .is_ok_and(|meta| meta.file_type().is_symlink())
    {
        return Err("Refusing to write Microsoft Store credentials through a symlink".into());
    }
    std::fs::write(&path, bytes.as_slice())
        .map_err(|_| "Microsoft Store credentials could not be saved".to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
            .map_err(|_| "Microsoft Store credential permissions could not be locked".to_string())?;
    }
    Ok(())
}

fn http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent("Orbit")
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|_| "Microsoft Store HTTP client could not start".to_string())
}

fn post_xml(client: &reqwest::blocking::Client, url: &str, xml: &str) -> Result<String, String> {
    let response = client
        .post(url)
        .header("Content-Type", "application/soap+xml; charset=utf-8")
        .body(xml.to_string())
        .send()
        .map_err(|_| "Could not reach Microsoft authentication servers".to_string())?;
    let mut body = Vec::new();
    response
        .take(MAX_CONTROL_RESPONSE_BYTES as u64 + 1)
        .read_to_end(&mut body)
        .map_err(|_| "Microsoft authentication response could not be read".to_string())?;
    if body.len() > MAX_CONTROL_RESPONSE_BYTES {
        return Err("Microsoft authentication response exceeded size limit".into());
    }
    String::from_utf8(body)
        .map_err(|_| "Microsoft authentication response was not valid UTF-8".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enforces_0600_permissions_rejects_symlinks_and_preserves_xcloud_on_sign_out() {
        let dir = std::env::temp_dir().join(format!("orbit-msstore-auth-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        // Simulate existing xCloud session file that must never be touched.
        std::fs::write(dir.join("session.json"), b"{\"xcloud\":true}").unwrap();

        complete_sign_in(&dir, "t=FAKE_DA_TOKEN", Some("player@example.com".into())).unwrap();

        let session_path = dir.join(SESSION_FILE);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&session_path).unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o600);
        }

        let st = status(&dir, &dir, None);
        assert!(st.signed_in);
        assert_eq!(st.account_label.as_deref(), Some("player@example.com"));

        sign_out(&dir).unwrap();
        assert!(!status(&dir, &dir, None).signed_in);
        assert!(
            dir.join("session.json").is_file(),
            "xCloud session must remain intact"
        );

        // Symlink refusal.
        let target = dir.join("elsewhere.json");
        std::fs::write(&target, b"{}").unwrap();
        std::os::unix::fs::symlink(&target, &session_path).unwrap();
        assert!(complete_sign_in(&dir, "t=FAKE", None).is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn login_navigation_allowlist_blocks_non_microsoft_hosts() {
        assert!(validate_login_navigation(
            "https://login.live.com/InlineLogin.srf?id=292543"
        ));
        assert!(validate_login_navigation(
            "https://login.microsoftonline.com/consumers/oauth2"
        ));
        assert!(!validate_login_navigation("https://evil.example/steal"));
        assert!(!validate_login_navigation("http://login.live.com/InlineLogin.srf"));
        assert!(!validate_login_navigation("file:///etc/passwd"));
    }
}
