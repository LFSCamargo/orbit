//! Steam QR sign-in rendered by Orbit. The challenge comes from Valve's
//! authentication API. The access token is used once to read owned app ids
//! and is never returned to the frontend or written to disk.

use std::io::Read;
use std::time::Duration;

use base64::Engine;
use qrcode::render::svg;
use qrcode::QrCode;
use serde::Serialize;

use crate::database::GameRepository;
use crate::services::steam_catalog::{self, SteamCatalogEntry};
use crate::services::steam_windows::{self, SteamWindowsStatus};
use crate::utils::steam_account::valid_account_name;

const BEGIN_URL: &str =
    "https://api.steampowered.com/IAuthenticationService/BeginAuthSessionViaQR/v1/";
const POLL_URL: &str =
    "https://api.steampowered.com/IAuthenticationService/PollAuthSessionStatus/v1/";
const OWNED_URL: &str = "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/";
const BEGIN_LIMIT: usize = 16 * 1024;
const POLL_LIMIT: usize = 64 * 1024;
const OWNED_LIMIT: usize = 2 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamQrStart {
    pub qr_svg: String,
    pub client_id: String,
    pub request_id: String,
    pub interval_seconds: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamQrPoll {
    pub done: bool,
    pub status: Option<SteamWindowsStatus>,
    pub library_error: Option<String>,
}

struct QrChallenge {
    challenge_url: String,
    client_id: String,
    request_id: String,
    interval_seconds: u64,
}

enum PollState {
    Pending,
    Approved {
        account_name: String,
        access_token: String,
    },
}

pub fn start() -> Result<SteamQrStart, String> {
    steam_windows::begin_sign_in();
    let body = post_form(
        BEGIN_URL,
        &[
            ("device_friendly_name", "Orbit"),
            ("platform_type", "2"),
            ("website_id", "Community"),
        ],
        BEGIN_LIMIT,
    )?;
    let challenge = parse_begin_body(&body)?;
    Ok(SteamQrStart {
        qr_svg: qr_svg(&challenge.challenge_url)?,
        client_id: challenge.client_id,
        request_id: challenge.request_id,
        interval_seconds: challenge.interval_seconds,
    })
}

pub fn poll(
    repo: &GameRepository,
    client_id: &str,
    request_id: &str,
) -> Result<SteamQrPoll, String> {
    if steam_windows::sign_in_cancelled() {
        return Err("Steam sign-in was cancelled".into());
    }
    if !valid_client_id(client_id) || !valid_request_id(request_id) {
        return Err("Steam sign-in could not be confirmed".into());
    }
    let body = post_form(
        POLL_URL,
        &[("client_id", client_id), ("request_id", request_id)],
        POLL_LIMIT,
    )?;
    match parse_poll_body(&body)? {
        PollState::Pending => Ok(SteamQrPoll {
            done: false,
            status: None,
            library_error: None,
        }),
        PollState::Approved {
            account_name,
            access_token,
        } => finish_login(repo, &account_name, &access_token),
    }
}

fn finish_login(
    repo: &GameRepository,
    account_name: &str,
    access_token: &str,
) -> Result<SteamQrPoll, String> {
    let (games, library_error) = match fetch_owned_games(access_token) {
        Ok(games) => (games, None),
        Err(err) => (Vec::new(), Some(err)),
    };
    let status = steam_windows::complete_qr_sign_in(repo, account_name, &games)?;
    Ok(SteamQrPoll {
        done: true,
        status: Some(status),
        library_error,
    })
}

fn fetch_owned_games(access_token: &str) -> Result<Vec<SteamCatalogEntry>, String> {
    let steam_id = steam_id_from_access_token(access_token)?;
    let response = http_client()?
        .get(OWNED_URL)
        .query(&[
            ("access_token", access_token),
            ("steamid", steam_id.as_str()),
            ("include_appinfo", "true"),
            ("include_played_free_games", "true"),
            ("include_free_sub", "true"),
            ("skip_unvetted_apps", "false"),
            ("format", "json"),
        ])
        .send()
        .map_err(|_| "Steam library could not be loaded".to_string())?;
    if !response.status().is_success() {
        return Err("Steam library could not be loaded".into());
    }
    let body = read_limited(response, OWNED_LIMIT)?;
    steam_catalog::parse_owned_games(&body)
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

fn parse_begin_body(body: &str) -> Result<QrChallenge, String> {
    if body.len() > BEGIN_LIMIT {
        return Err("Steam sign-in could not start".into());
    }
    let value: serde_json::Value =
        serde_json::from_str(body).map_err(|_| "Steam sign-in could not start".to_string())?;
    let response = value
        .get("response")
        .ok_or("Steam sign-in could not start")?;
    let challenge_url = response
        .get("challenge_url")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("");
    if !valid_challenge_url(challenge_url) {
        return Err("Steam sign-in could not start".into());
    }
    let client_id = json_id(response, "client_id").ok_or("Steam sign-in could not start")?;
    let request_id = json_id(response, "request_id").ok_or("Steam sign-in could not start")?;
    if !valid_client_id(&client_id) || !valid_request_id(&request_id) {
        return Err("Steam sign-in could not start".into());
    }
    let interval_seconds = response
        .get("interval")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(5)
        .clamp(1, 15);
    Ok(QrChallenge {
        challenge_url: challenge_url.to_string(),
        client_id,
        request_id,
        interval_seconds,
    })
}

fn parse_poll_body(body: &str) -> Result<PollState, String> {
    if body.len() > POLL_LIMIT {
        return Err("Steam sign-in could not be confirmed".into());
    }
    let value: serde_json::Value = serde_json::from_str(body)
        .map_err(|_| "Steam sign-in could not be confirmed".to_string())?;
    let Some(response) = value.get("response") else {
        return Ok(PollState::Pending);
    };
    let account_name = response
        .get("account_name")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("");
    let access_token = response
        .get("access_token")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("");
    if account_name.is_empty() && access_token.is_empty() {
        return Ok(PollState::Pending);
    }
    if !valid_account_name(account_name) || !valid_access_token(access_token) {
        return Err("Steam sign-in could not be confirmed".into());
    }
    Ok(PollState::Approved {
        account_name: account_name.to_string(),
        access_token: access_token.to_string(),
    })
}

fn steam_id_from_access_token(token: &str) -> Result<String, String> {
    if !valid_access_token(token) {
        return Err("Steam library could not be loaded".into());
    }
    let payload = token
        .split('.')
        .nth(1)
        .ok_or("Steam library could not be loaded")?;
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload)
        .map_err(|_| "Steam library could not be loaded".to_string())?;
    if bytes.len() > 8 * 1024 {
        return Err("Steam library could not be loaded".into());
    }
    let value: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|_| "Steam library could not be loaded".to_string())?;
    let steam_id = value
        .get("sub")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("");
    if (16..=20).contains(&steam_id.len()) && steam_id.chars().all(|c| c.is_ascii_digit()) {
        Ok(steam_id.to_string())
    } else {
        Err("Steam library could not be loaded".into())
    }
}

fn qr_svg(url: &str) -> Result<String, String> {
    if !valid_challenge_url(url) {
        return Err("Steam sign-in could not start".into());
    }
    let code =
        QrCode::new(url.as_bytes()).map_err(|_| "Steam sign-in could not start".to_string())?;
    let svg = code.render::<svg::Color>().min_dimensions(240, 240).build();
    if !svg.contains("<svg") || svg.len() > 64 * 1024 {
        return Err("Steam sign-in could not start".into());
    }
    Ok(svg)
}

fn json_id(value: &serde_json::Value, key: &str) -> Option<String> {
    match value.get(key)? {
        serde_json::Value::String(text) => Some(text.clone()),
        serde_json::Value::Number(number) => number.as_u64().map(|id| id.to_string()),
        _ => None,
    }
}

fn valid_challenge_url(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://s.team/q/") else {
        return false;
    };
    !rest.is_empty()
        && rest.len() <= 128
        && rest
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '/' || c == '-' || c == '_')
}

fn valid_client_id(value: &str) -> bool {
    (1..=20).contains(&value.len()) && value.chars().all(|c| c.is_ascii_digit())
}

fn valid_request_id(value: &str) -> bool {
    (8..=128).contains(&value.len())
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '/' || c == '=')
}

fn valid_access_token(value: &str) -> bool {
    let mut parts = value.split('.');
    let header = parts.next().unwrap_or("");
    let payload = parts.next().unwrap_or("");
    let signature = parts.next().unwrap_or("");
    parts.next().is_none()
        && (20..=4096).contains(&value.len())
        && [header, payload, signature].iter().all(|part| {
            !part.is_empty()
                && part
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn begin_body_accepts_a_steam_challenge_and_rejects_other_urls() {
        let parsed = parse_begin_body(
            r#"{"response":{"client_id":"123456","challenge_url":"https://s.team/q/1/123456","request_id":"D+IScXv82i0=","interval":5}}"#,
        )
        .unwrap();
        assert_eq!(parsed.client_id, "123456");
        assert_eq!(parsed.interval_seconds, 5);
        assert!(parse_begin_body(
            r#"{"response":{"client_id":"123","challenge_url":"https://evil.example/q/1","request_id":"D+IScXv82i0=","interval":5}}"#
        )
        .is_err());
    }

    #[test]
    fn poll_waits_until_an_account_exists_and_drops_the_token() {
        assert!(matches!(
            parse_poll_body(r#"{"response":{}}"#).unwrap(),
            PollState::Pending
        ));
        let token = sample_token();
        let approved = parse_poll_body(&format!(
            r#"{{"response":{{"account_name":"orbit_player","access_token":"{token}"}}}}"#
        ))
        .unwrap();
        match approved {
            PollState::Approved {
                account_name,
                access_token,
            } => {
                assert_eq!(account_name, "orbit_player");
                assert_eq!(
                    steam_id_from_access_token(&access_token).unwrap(),
                    "76561198000000000"
                );
            }
            PollState::Pending => panic!("expected an approved login"),
        }
    }

    #[test]
    fn owned_games_keep_numeric_app_ids_only() {
        let games = steam_catalog::parse_owned_games(
            r#"{"response":{"games":[{"appid":570,"name":"Dota 2"},{"appid":0},{"name":"skip"},{"appid":730}]}}"#,
        )
        .unwrap();
        assert_eq!(
            games
                .iter()
                .map(|game| (game.app_id.as_str(), game.title.as_str()))
                .collect::<Vec<_>>(),
            vec![("570", "Dota 2"), ("730", "Steam 730")]
        );
    }

    #[test]
    fn qr_svg_is_markup_for_a_steam_url_only() {
        let svg = qr_svg("https://s.team/q/1/123456").unwrap();
        assert!(svg.contains("<svg"));
        assert!(!svg.contains("password"));
        assert!(qr_svg("https://evil.example/q").is_err());
    }

    fn sample_token() -> String {
        let payload = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .encode(br#"{"sub":"76561198000000000"}"#);
        format!("e30.{payload}.sig")
    }
}
