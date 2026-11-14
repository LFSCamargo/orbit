//! Steam account sign-in through Valve's authentication API.
//! The password is RSA-encrypted and sent only to Steam. It is never stored.

use std::io::Read;
use std::time::Duration;

use base64::Engine;
use rand::rngs::OsRng;
use rsa::pkcs1v15::Pkcs1v15Encrypt;
use rsa::{BigUint, RsaPublicKey};
use serde::Serialize;

use crate::utils::steam_account::valid_account_name;

const RSA_URL: &str =
    "https://api.steampowered.com/IAuthenticationService/GetPasswordRSAPublicKey/v1/";
const BEGIN_URL: &str =
    "https://api.steampowered.com/IAuthenticationService/BeginAuthSessionViaCredentials/v1/";
const GUARD_URL: &str =
    "https://api.steampowered.com/IAuthenticationService/UpdateAuthSessionWithSteamGuardCode/v1/";
const BODY_LIMIT: usize = 16 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamPasswordStart {
    pub client_id: String,
    pub request_id: String,
    pub interval_seconds: u64,
    pub steam_id: Option<String>,
    pub needs_code: bool,
    pub code_type: u32,
}

struct RsaKey {
    modulus: String,
    exponent: String,
    timestamp: String,
}

pub fn begin(account_name: &str, password: &str) -> Result<SteamPasswordStart, String> {
    if !valid_account_name(account_name) {
        return Err("Enter a Steam account name".into());
    }
    if !valid_password(password) {
        return Err("Enter your Steam password".into());
    }
    crate::services::steam_windows::begin_sign_in();
    let key = fetch_rsa_key(account_name)?;
    let encrypted = encrypt_password(password, &key)?;
    let body = post_form(
        BEGIN_URL,
        &[
            ("device_friendly_name", "Orbit"),
            ("account_name", account_name),
            ("encrypted_password", &encrypted),
            ("encryption_timestamp", &key.timestamp),
            ("remember_login", "true"),
            ("platform_type", "2"),
            ("persistence", "1"),
            ("website_id", "Community"),
        ],
        BODY_LIMIT,
    )?;
    parse_begin_body(&body)
}

pub fn submit_guard(
    client_id: &str,
    steam_id: &str,
    code: &str,
    code_type: u32,
) -> Result<(), String> {
    if crate::services::steam_windows::sign_in_cancelled() {
        return Err("Steam sign-in was cancelled".into());
    }
    if !valid_client_id(client_id) || !valid_steam_id(steam_id) || !valid_guard_code(code) {
        return Err("Steam Guard could not be confirmed".into());
    }
    if !(1..=7).contains(&code_type) {
        return Err("Steam Guard could not be confirmed".into());
    }
    let code_type = code_type.to_string();
    post_form(
        GUARD_URL,
        &[
            ("client_id", client_id),
            ("steamid", steam_id),
            ("code", code),
            ("code_type", &code_type),
        ],
        BODY_LIMIT,
    )?;
    Ok(())
}

fn fetch_rsa_key(account_name: &str) -> Result<RsaKey, String> {
    let response = http_client()?
        .get(RSA_URL)
        .query(&[("account_name", account_name)])
        .send()
        .map_err(|_| "Steam sign-in could not start".to_string())?;
    if !response.status().is_success() {
        return Err("Steam sign-in could not start".into());
    }
    let body = read_limited(response, BODY_LIMIT)?;
    parse_rsa_key(&body)
}

fn encrypt_password(password: &str, key: &RsaKey) -> Result<String, String> {
    let n = BigUint::from_bytes_be(&parse_hex(&key.modulus)?);
    let e = BigUint::from_bytes_be(&parse_hex(&key.exponent)?);
    let public =
        RsaPublicKey::new(n, e).map_err(|_| "Steam sign-in could not start".to_string())?;
    let encrypted = public
        .encrypt(&mut OsRng, Pkcs1v15Encrypt, password.as_bytes())
        .map_err(|_| "Steam sign-in could not start".to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(encrypted))
}

fn post_form(url: &str, fields: &[(&str, &str)], limit: usize) -> Result<String, String> {
    let response = http_client()?
        .post(url)
        .form(fields)
        .send()
        .map_err(|_| "Steam sign-in could not start".to_string())?;
    if !response.status().is_success() {
        return Err("Steam sign-in could not start".into());
    }
    read_limited(response, limit)
}

fn http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent("Orbit")
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|_| "Steam sign-in could not start".to_string())
}

fn read_limited(response: reqwest::blocking::Response, limit: usize) -> Result<String, String> {
    let mut body = Vec::new();
    response
        .take(limit as u64 + 1)
        .read_to_end(&mut body)
        .map_err(|_| "Steam sign-in could not be read".to_string())?;
    if body.len() > limit {
        return Err("Steam sign-in response was too large".into());
    }
    String::from_utf8(body).map_err(|_| "Steam sign-in could not be read".to_string())
}

fn parse_rsa_key(body: &str) -> Result<RsaKey, String> {
    let value: serde_json::Value =
        serde_json::from_str(body).map_err(|_| "Steam sign-in could not start".to_string())?;
    let response = value
        .get("response")
        .ok_or("Steam sign-in could not start")?;
    let modulus = response
        .get("publickey_mod")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("");
    let exponent = response
        .get("publickey_exp")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("");
    let timestamp = json_id(response, "timestamp").unwrap_or_default();
    if parse_hex(modulus).is_err() || parse_hex(exponent).is_err() || timestamp.is_empty() {
        return Err("Steam sign-in could not start".into());
    }
    Ok(RsaKey {
        modulus: modulus.to_string(),
        exponent: exponent.to_string(),
        timestamp,
    })
}

fn parse_begin_body(body: &str) -> Result<SteamPasswordStart, String> {
    let value: serde_json::Value =
        serde_json::from_str(body).map_err(|_| "Steam sign-in could not start".to_string())?;
    let response = value
        .get("response")
        .ok_or("Steam username or password is incorrect")?;
    if response.as_object().is_some_and(|object| object.is_empty()) {
        return Err("Steam username or password is incorrect".into());
    }
    let client_id = json_id(response, "client_id").ok_or("Steam sign-in could not start")?;
    let request_id = json_id(response, "request_id").ok_or("Steam sign-in could not start")?;
    if !valid_client_id(&client_id) {
        return Err("Steam sign-in could not start".into());
    }
    let steam_id = json_id(response, "steamid").filter(|id| valid_steam_id(id));
    let types = confirmation_types(response);
    let code_type = types
        .iter()
        .copied()
        .find(|kind| *kind == 2 || *kind == 3)
        .unwrap_or(3);
    Ok(SteamPasswordStart {
        client_id,
        request_id,
        interval_seconds: response
            .get("interval")
            .and_then(serde_json::Value::as_u64)
            .unwrap_or(5)
            .clamp(1, 15),
        steam_id,
        needs_code: types.iter().any(|kind| *kind == 2 || *kind == 3),
        code_type,
    })
}

fn confirmation_types(response: &serde_json::Value) -> Vec<u32> {
    response
        .get("allowed_confirmations")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| {
            item.get("confirmation_type")
                .and_then(serde_json::Value::as_u64)
                .map(|kind| kind as u32)
        })
        .collect()
}

fn json_id(value: &serde_json::Value, key: &str) -> Option<String> {
    match value.get(key)? {
        serde_json::Value::String(text) if !text.is_empty() => Some(text.clone()),
        serde_json::Value::Number(number) => number.as_u64().map(|id| id.to_string()),
        _ => None,
    }
}

fn parse_hex(value: &str) -> Result<Vec<u8>, String> {
    if value.len() < 2 || value.len() % 2 != 0 || value.len() > 1024 {
        return Err("Steam sign-in could not start".into());
    }
    if !value.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Steam sign-in could not start".into());
    }
    (0..value.len())
        .step_by(2)
        .map(|index| {
            u8::from_str_radix(&value[index..index + 2], 16)
                .map_err(|_| "Steam sign-in could not start".into())
        })
        .collect()
}

fn valid_password(value: &str) -> bool {
    let len = value.chars().count();
    (1..=128).contains(&len) && !value.contains('\0')
}

fn valid_client_id(value: &str) -> bool {
    (1..=20).contains(&value.len()) && value.chars().all(|c| c.is_ascii_digit())
}

fn valid_steam_id(value: &str) -> bool {
    (16..=20).contains(&value.len()) && value.chars().all(|c| c.is_ascii_digit())
}

fn valid_guard_code(value: &str) -> bool {
    let len = value.chars().count();
    (4..=12).contains(&len) && value.chars().all(|c| c.is_ascii_alphanumeric())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rsa_key_parse_rejects_a_missing_modulus() {
        assert!(
            parse_rsa_key(r#"{"response":{"publickey_exp":"010001","timestamp":"1"}}"#).is_err()
        );
        let key = parse_rsa_key(
            r#"{"response":{"publickey_mod":"AA","publickey_exp":"010001","timestamp":"99"}}"#,
        )
        .unwrap();
        assert_eq!(key.timestamp, "99");
        assert_eq!(parse_hex("010001").unwrap(), vec![1, 0, 1]);
    }

    #[test]
    fn begin_body_asks_for_a_guard_code_only_when_steam_requires_one() {
        let device = parse_begin_body(
            r#"{"response":{"client_id":"12","request_id":"abcdEF==","interval":5,"steamid":"76561198000000000","allowed_confirmations":[{"confirmation_type":4}]}}"#,
        )
        .unwrap();
        assert!(!device.needs_code);
        let email = parse_begin_body(
            r#"{"response":{"client_id":"12","request_id":"abcdEF==","interval":5,"steamid":"76561198000000000","allowed_confirmations":[{"confirmation_type":2}]}}"#,
        )
        .unwrap();
        assert!(email.needs_code);
        assert_eq!(email.code_type, 2);
        assert!(parse_begin_body(r#"{"response":{}}"#).is_err());
    }

    #[test]
    fn password_and_guard_checks_never_echo_the_secret() {
        let err = begin("x", "super-secret-password").unwrap_err();
        assert!(!err.contains("super-secret-password"));
        assert!(valid_guard_code("AB12CD"));
        assert!(!valid_guard_code("bad code"));
    }
}
