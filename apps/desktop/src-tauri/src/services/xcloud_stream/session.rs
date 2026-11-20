//! One xCloud stream at a time: start, state (with the one-time `/connect`),
//! SDP and ICE exchange, keepalive and stop. The streaming token and session
//! live here; the player page only sees state names, SDP text and ICE
//! candidates.

use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use reqwest::Method;
use serde::Serialize;
use zeroize::Zeroizing;

use super::auth::{cloud_session, StreamingSession};
use super::http::{send, send_limited, TITLES_LIMIT};
use crate::services::xbox_auth;

const EXCHANGE_TIMEOUT: Duration = Duration::from_secs(30);
const EXCHANGE_POLL: Duration = Duration::from_millis(500);

struct Active {
    base: String,
    path: String,
    token: Zeroizing<String>,
    connected: bool,
}

static ACTIVE: Mutex<Option<Active>> = Mutex::new(None);

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamState {
    pub state: String,
    /// Microsoft's reason when the stream failed.
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IceCandidate {
    pub candidate: String,
    pub sdp_mid: Option<String>,
    pub sdp_m_line_index: Option<u16>,
}

fn take_active<T>(f: impl FnOnce(&mut Active) -> Result<T, String>) -> Result<T, String> {
    let mut guard = ACTIVE.lock().map_err(|_| "Xbox Cloud Gaming is busy")?;
    let active = guard.as_mut().ok_or("No cloud game is streaming")?;
    f(active)
}

fn snapshot() -> Result<(String, String, Zeroizing<String>), String> {
    take_active(|active| {
        Ok((
            active.base.clone(),
            active.path.clone(),
            active.token.clone(),
        ))
    })
}

/// Requests a stream for a Store product id. Network: login, titles, start.
pub fn start(session_dir: &Path, product_id: &str) -> Result<(), String> {
    stop();
    let login = cloud_session(session_dir)?;
    let base = login
        .default_region()
        .map(|region| region.base_uri.clone())
        .ok_or("Xbox Cloud Gaming has no region for this account")?;
    let title_id = title_id_for(&base, &login, product_id)?;
    let response = send(
        Method::POST,
        &base,
        "/v5/sessions/cloud/play",
        &login.token,
        Some(&start_body(&title_id)),
    )?;
    if !(200..300).contains(&response.status) {
        return Err(failure_text(&response.body)
            .unwrap_or_else(|| "Xbox Cloud Gaming could not start this game".into()));
    }
    let path = session_path(&response.body)?;
    *ACTIVE.lock().map_err(|_| "Xbox Cloud Gaming is busy")? = Some(Active {
        base,
        path,
        token: login.token,
        connected: false,
    });
    Ok(())
}

fn start_body(title_id: &str) -> serde_json::Value {
    serde_json::json!({
        "clientSessionId": "",
        "titleId": title_id,
        "systemUpdateGroup": "",
        "settings": {
            "nanoVersion": "V3;WebrtcTransport.dll",
            "enableOptionalDataCollection": false,
            "enableTextToSpeech": false,
            "highContrast": 0,
            "locale": "en-US",
            "useIceConnection": false,
            "timezoneOffsetMinutes": 0,
            "sdkType": "web",
            "osName": "windows",
        },
        "serverId": "",
        "fallbackRegionNames": [],
    })
}

/// xCloud's title id for a Store product id: `/v2/titles` first, then the
/// Game Pass catalog's `XCloudTitleId` (the list can leave titles out for an
/// account or market). Network: one or two requests.
fn title_id_for(base: &str, login: &StreamingSession, product_id: &str) -> Result<String, String> {
    let listed = titles_list_id(base, login, product_id);
    if let Ok(Some(id)) = &listed {
        return Ok(id.clone());
    }
    match catalog_title_id(&login.market, product_id) {
        Some(id) => Ok(id),
        None => {
            eprintln!(
                "[orbit] xcloud: no title id for {product_id} (titles list: {})",
                match &listed {
                    Ok(_) => "not listed".to_string(),
                    Err(error) => error.clone(),
                }
            );
            Err("This game is not available to stream on your account".into())
        }
    }
}

const CATALOG_URL: &str = "https://catalog.gamepass.com/v3/products";

/// `XCloudTitleId` for a product from the public Game Pass catalog.
fn catalog_title_id(market: &str, product_id: &str) -> Option<String> {
    let market = if market.len() == 2 && market.chars().all(|c| c.is_ascii_alphabetic()) {
        market.to_ascii_uppercase()
    } else {
        "US".to_string()
    };
    let response = reqwest::blocking::Client::builder()
        .user_agent("Orbit")
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .ok()?
        .post(CATALOG_URL)
        .query(&[
            ("market", market.as_str()),
            ("language", "en-US"),
            ("hydration", "RemoteHighSapphire0"),
        ])
        .header("ms-cv", "0")
        .header("calling-app-name", "Xbox Cloud Gaming Web")
        .header("calling-app-version", "21.0.0")
        .json(&serde_json::json!({ "Products": [product_id] }))
        .send()
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let mut body = Vec::new();
    use std::io::Read;
    response.take(1024 * 1024 + 1).read_to_end(&mut body).ok()?;
    if body.len() > 1024 * 1024 {
        return None;
    }
    parse_catalog_title_id(std::str::from_utf8(&body).ok()?, product_id)
}

fn parse_catalog_title_id(body: &str, product_id: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(body).ok()?;
    let products = value.get("Products")?.as_object()?;
    products
        .iter()
        .find(|(key, _)| key.eq_ignore_ascii_case(product_id))
        .and_then(|(_, product)| product.get("XCloudTitleId")?.as_str())
        .filter(|id| valid_title_id(id))
        .map(str::to_string)
}

fn valid_title_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric())
}

fn titles_list_id(
    base: &str,
    login: &StreamingSession,
    product_id: &str,
) -> Result<Option<String>, String> {
    let response = send_limited(
        Method::GET,
        base,
        "/v2/titles",
        &login.token,
        None,
        TITLES_LIMIT,
    )?;
    if !(200..300).contains(&response.status) {
        return Err(format!("titles list answered {}", response.status));
    }
    Ok(find_title_id(&response.body, product_id))
}

fn find_title_id(body: &str, product_id: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(body).ok()?;
    value
        .get("results")?
        .as_array()?
        .iter()
        .find(|title| {
            title
                .pointer("/details/productId")
                .and_then(|id| id.as_str())
                .is_some_and(|id| id.eq_ignore_ascii_case(product_id))
        })
        .and_then(|title| title.get("titleId")?.as_str())
        .filter(|id| valid_title_id(id))
        .map(str::to_string)
}

/// `sessionPath` from the start answer, as a checked absolute path.
fn session_path(body: &str) -> Result<String, String> {
    let value: serde_json::Value =
        serde_json::from_str(body).map_err(|_| "Xbox Cloud Gaming answer could not be read")?;
    let path = value
        .get("sessionPath")
        .and_then(|v| v.as_str())
        .map(|p| format!("/{}", p.trim_start_matches('/')))
        .filter(|p| p.starts_with("/v5/sessions/cloud/") && super::http::safe_path(p))
        .ok_or("Xbox Cloud Gaming did not return a session")?;
    Ok(path)
}

fn failure_text(body: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(body).ok()?;
    let text = value
        .pointer("/errorDetails/message")
        .or_else(|| value.get("message"))
        .or_else(|| value.pointer("/errorDetails/code"))
        .or_else(|| value.get("code"))?
        .as_str()?;
    Some(text.chars().take(200).collect())
}

/// The stream's state. On `ReadyToConnect` this sends `/connect` once.
pub fn state(session_dir: &Path) -> Result<StreamState, String> {
    let (base, path, token) = snapshot()?;
    let response = send(Method::GET, &base, &format!("{path}/state"), &token, None)?;
    if !(200..300).contains(&response.status) {
        return Err("Xbox Cloud Gaming stopped answering".into());
    }
    let state = parse_state(&response.body)?;
    if state.state == "ReadyToConnect" && !take_active(|active| Ok(active.connected))? {
        let user_token = xbox_auth::transfer_token(session_dir)?;
        let connect = send(
            Method::POST,
            &base,
            &format!("{path}/connect"),
            &token,
            Some(&serde_json::json!({ "userToken": user_token.as_str() })),
        )?;
        if !(200..300).contains(&connect.status) {
            return Err("Xbox Cloud Gaming did not accept your account".into());
        }
        take_active(|active| {
            active.connected = true;
            Ok(())
        })?;
    }
    Ok(state)
}

fn parse_state(body: &str) -> Result<StreamState, String> {
    let value: serde_json::Value =
        serde_json::from_str(body).map_err(|_| "Xbox Cloud Gaming answer could not be read")?;
    let state = value
        .get("state")
        .and_then(|v| v.as_str())
        .filter(|s| s.len() <= 32 && s.chars().all(|c| c.is_ascii_alphanumeric()))
        .ok_or("Xbox Cloud Gaming answer could not be read")?
        .to_string();
    let error = (state == "Failed").then(|| failure_text(body)).flatten();
    Ok(StreamState { state, error })
}

/// Posts to `{session}/{kind}` and waits for Microsoft's `exchangeResponse`.
fn exchange(kind: &str, body: serde_json::Value) -> Result<String, String> {
    let (base, path, token) = snapshot()?;
    let url = format!("{path}/{kind}");
    let posted = send(Method::POST, &base, &url, &token, Some(&body))?;
    if !(200..300).contains(&posted.status) {
        return Err("Xbox Cloud Gaming refused the connection".into());
    }
    let deadline = Instant::now() + EXCHANGE_TIMEOUT;
    while Instant::now() < deadline {
        let response = send(Method::GET, &base, &url, &token, None)?;
        if response.status == 200 {
            if let Some(exchange) = exchange_response(&response.body) {
                return Ok(exchange);
            }
        }
        std::thread::sleep(EXCHANGE_POLL);
    }
    Err("Xbox Cloud Gaming did not answer in time".into())
}

fn exchange_response(body: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(body).ok()?;
    value.get("exchangeResponse")?.as_str().map(str::to_string)
}

/// Sends the player's SDP offer; returns the answer SDP.
pub fn sdp(offer: &str) -> Result<String, String> {
    if !offer.starts_with("v=0") || offer.len() > 64 * 1024 {
        return Err("The player's connection offer is not valid".into());
    }
    let answer = exchange("sdp", sdp_body(offer))?;
    answer_sdp(&answer)
}

fn sdp_body(offer: &str) -> serde_json::Value {
    let version = |min: u8, max: u8| serde_json::json!({ "minVersion": min, "maxVersion": max });
    serde_json::json!({
        "messageType": "offer",
        "sdp": offer,
        "requestId": "1",
        "configuration": {
            "chatConfiguration": {
                "bytesPerSample": 2,
                "expectedClipDurationMs": 20,
                "format": { "codec": "opus", "container": "webm" },
                "numChannels": 1,
                "sampleFrequencyHz": 24000,
            },
            "chat": version(1, 1),
            "control": version(1, 3),
            "input": version(1, 9),
            "message": version(1, 1),
            "reliableinput": version(9, 9),
            "unreliableinput": version(9, 9),
        },
    })
}

fn answer_sdp(exchange: &str) -> Result<String, String> {
    let value: serde_json::Value =
        serde_json::from_str(exchange).map_err(|_| "Xbox Cloud Gaming answer could not be read")?;
    if value
        .get("status")
        .and_then(|s| s.as_str())
        .is_some_and(|s| s != "success")
    {
        return Err("Xbox Cloud Gaming could not set up the stream".into());
    }
    value
        .get("sdp")
        .and_then(|v| v.as_str())
        .filter(|sdp| sdp.starts_with("v=0") && sdp.len() <= 64 * 1024)
        .map(str::to_string)
        .ok_or_else(|| "Xbox Cloud Gaming answer could not be read".into())
}

/// Sends the player's ICE candidates; returns the server's.
pub fn ice(candidates: &[IceCandidate]) -> Result<Vec<IceCandidate>, String> {
    let local: Vec<String> = candidates
        .iter()
        .take(32)
        .map(|c| {
            serde_json::json!({
                "candidate": c.candidate,
                "sdpMid": c.sdp_mid,
                "sdpMLineIndex": c.sdp_m_line_index,
            })
            .to_string()
        })
        .collect();
    let answer = exchange("ice", serde_json::json!({ "candidates": local }))?;
    parse_candidates(&answer)
}

fn parse_candidates(exchange: &str) -> Result<Vec<IceCandidate>, String> {
    let value: serde_json::Value =
        serde_json::from_str(exchange).map_err(|_| "Xbox Cloud Gaming answer could not be read")?;
    let list = value
        .as_array()
        .ok_or("Xbox Cloud Gaming answer could not be read")?;
    Ok(list
        .iter()
        .take(32)
        .filter_map(|item| {
            let candidate = item.get("candidate")?.as_str()?;
            (candidate.len() <= 512).then(|| IceCandidate {
                candidate: candidate.to_string(),
                sdp_mid: item
                    .get("sdpMid")
                    .and_then(|v| v.as_str())
                    .filter(|m| m.len() <= 32)
                    .map(str::to_string),
                sdp_m_line_index: item
                    .get("sdpMLineIndex")
                    .and_then(|v| v.as_u64())
                    .and_then(|v| u16::try_from(v).ok()),
            })
        })
        .collect())
}

/// Keeps the session alive; false once Microsoft has ended it.
pub fn keepalive() -> Result<bool, String> {
    let (base, path, token) = snapshot()?;
    let response = send(
        Method::POST,
        &base,
        &format!("{path}/keepalive"),
        &token,
        None,
    )?;
    let ended =
        response.body.contains("SessionNotActive") || response.body.contains("SessionNotFound");
    Ok((200..300).contains(&response.status) && !ended)
}

/// Ends the stream on Microsoft's side and forgets it here. Best effort.
pub fn stop() {
    let active = ACTIVE.lock().ok().and_then(|mut guard| guard.take());
    if let Some(active) = active {
        let _ = send(
            Method::DELETE,
            &active.base,
            &active.path,
            &active.token,
            None,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_a_store_product_to_its_cloud_title() {
        let body = r#"{"results":[
            {"titleId":"HALOINFINITE","details":{"productId":"9PP5G1F0C2B6"}},
            {"titleId":"DEADSPACE","details":{"productId":"9NBLGGH4R315"}}]}"#;
        assert_eq!(
            find_title_id(body, "9nblggh4r315").as_deref(),
            Some("DEADSPACE")
        );
        assert_eq!(find_title_id(body, "MISSING"), None);
        assert_eq!(
            find_title_id(
                r#"{"results":[{"titleId":"../x","details":{"productId":"A"}}]}"#,
                "A"
            ),
            None
        );
    }

    #[test]
    fn falls_back_to_the_game_pass_catalog_for_the_cloud_title() {
        // Regression: /v2/titles left the game out for this account, so Play
        // said "not available" for a Game Pass cloud title.
        let body = r#"{"Products":{"9NBLGGH4R315":{"ProductTitle":"Dead Space","XCloudTitleId":"DEADSPACE2023","StoreId":"9NBLGGH4R315"}}}"#;
        assert_eq!(
            parse_catalog_title_id(body, "9nblggh4r315").as_deref(),
            Some("DEADSPACE2023")
        );
        assert_eq!(parse_catalog_title_id(body, "OTHER"), None);
        assert_eq!(
            parse_catalog_title_id(r#"{"Products":{"A":{"XCloudTitleId":"bad id"}}}"#, "A"),
            None
        );
        assert_eq!(
            parse_catalog_title_id(r#"{"Products":{"A":{}}}"#, "A"),
            None
        );
    }

    #[test]
    fn keeps_the_session_on_the_cloud_path() {
        assert_eq!(
            session_path(r#"{"sessionPath":"v5/sessions/cloud/ABC-123","state":"Provisioning"}"#)
                .unwrap(),
            "/v5/sessions/cloud/ABC-123"
        );
        assert!(session_path(r#"{"sessionPath":"v5/sessions/home/ABC"}"#).is_err());
        assert!(session_path(r#"{"sessionPath":"v5/sessions/cloud/../x"}"#).is_err());
        assert!(session_path("{}").is_err());
    }

    #[test]
    fn reads_states_and_failure_reasons() {
        assert_eq!(
            parse_state(r#"{"state":"WaitingForResources"}"#).unwrap(),
            StreamState {
                state: "WaitingForResources".into(),
                error: None
            }
        );
        let failed = parse_state(
            r#"{"state":"Failed","errorDetails":{"code":"NoAvailableServers","message":"No servers"}}"#,
        )
        .unwrap();
        assert_eq!(failed.error.as_deref(), Some("No servers"));
        assert!(parse_state(r#"{"state":"<script>"}"#).is_err());
    }

    #[test]
    fn reads_the_answer_sdp_and_server_candidates() {
        let answer = r#"{"chat":1,"control":3,"input":9,"message":1,"sdp":"v=0\r\no=- 1 2 IN IP4 0.0.0.0","sdpType":"answer","status":"success"}"#;
        assert!(answer_sdp(answer).unwrap().starts_with("v=0"));
        assert!(answer_sdp(r#"{"status":"failed","sdp":"v=0"}"#).is_err());
        let candidates = parse_candidates(
            r#"[{"candidate":"a=candidate:1 1 UDP 100 20.1.2.3 1234 typ host","sdpMid":"0","sdpMLineIndex":0},
                {"candidate":"a=end-of-candidates","sdpMid":"0","sdpMLineIndex":0}]"#,
        )
        .unwrap();
        assert_eq!(candidates.len(), 2);
        assert_eq!(candidates[0].sdp_m_line_index, Some(0));
        assert!(exchange_response(r#"{"exchangeResponse":"[]"}"#).is_some());
    }

    #[test]
    fn the_offer_asks_for_greenlights_channel_versions() {
        let body = sdp_body("v=0");
        assert_eq!(body.pointer("/configuration/input/maxVersion").unwrap(), 9);
        assert_eq!(
            body.pointer("/configuration/control/maxVersion").unwrap(),
            3
        );
        assert_eq!(start_body("DEADSPACE")["titleId"], "DEADSPACE");
        assert!(sdp("not an sdp").is_err());
    }
}
