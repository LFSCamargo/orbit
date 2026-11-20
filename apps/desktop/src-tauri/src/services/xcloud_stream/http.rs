//! Requests to an xCloud region host with the streaming bearer token.
//! Paths are checked so a server answer can never point Orbit elsewhere.

use std::io::Read;
use std::time::Duration;

use zeroize::Zeroizing;

/// Session answers (state, SDP, ICE) are small.
pub(crate) const RESPONSE_LIMIT: u64 = 256 * 1024;
/// `/v2/titles` lists every cloud game with its details: several MB.
pub(crate) const TITLES_LIMIT: u64 = 16 * 1024 * 1024;

/// What xbox.com sends as `X-MS-Device-Info`; `os.name: windows` asks for
/// 1080p (android gets 720p).
const DEVICE_INFO: &str = concat!(
    r#"{"appInfo":{"env":{"clientAppId":"www.xbox.com","clientAppType":"browser","#,
    r#""clientAppVersion":"21.1.98","clientSdkVersion":"8.5.3","httpEnvironment":"prod","#,
    r#""sdkInstallId":""}},"dev":{"hw":{"make":"Microsoft","model":"unknown","sdktype":"web"},"#,
    r#""os":{"name":"windows","ver":"22631.2715","platform":"desktop"},"#,
    r#""displayInfo":{"dimensions":{"widthInPixels":1920,"heightInPixels":1080},"#,
    r#""pixelDensity":{"dpiX":2,"dpiY":2}},"browser":{"browserName":"chrome","browserVersion":"119.0"}}}"#
);

pub struct Response {
    pub status: u16,
    pub body: String,
}

/// A path under the region host: `/v5/...` or `/v2/...`, letters, digits,
/// `-`, `_` and `/` only.
pub(crate) fn safe_path(path: &str) -> bool {
    (path.starts_with("/v5/") || path.starts_with("/v2/") || path.starts_with("/v1/"))
        && path.len() <= 256
        && !path.contains("//")
        && !path.contains("..")
        && path
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '-' | '_'))
}

fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent("Orbit")
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|_| "Xbox Cloud Gaming could not start".to_string())
}

/// `method` on `base + path`. `base` must come from a trusted login region.
pub fn send(
    method: reqwest::Method,
    base: &str,
    path: &str,
    token: &Zeroizing<String>,
    body: Option<&serde_json::Value>,
) -> Result<Response, String> {
    send_limited(method, base, path, token, body, RESPONSE_LIMIT)
}

/// `send` with a larger answer cap, for the titles list.
pub fn send_limited(
    method: reqwest::Method,
    base: &str,
    path: &str,
    token: &Zeroizing<String>,
    body: Option<&serde_json::Value>,
    limit: u64,
) -> Result<Response, String> {
    if !safe_path(path) {
        return Err("Xbox Cloud Gaming sent an unexpected address".into());
    }
    let mut request = client()?
        .request(method, format!("{base}{path}"))
        .header("Accept", "application/json")
        .header("X-Gssv-Client", "XboxComBrowser")
        .header("X-MS-Device-Info", DEVICE_INFO)
        .bearer_auth(token.as_str());
    request = match body {
        Some(body) => request.json(body),
        None => request.header("Content-Type", "application/json"),
    };
    let response = request
        .send()
        .map_err(|_| "Xbox Cloud Gaming could not be reached".to_string())?;
    let status = response.status().as_u16();
    let mut bytes = Vec::new();
    response
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Xbox Cloud Gaming answer could not be read".to_string())?;
    if bytes.len() as u64 > limit {
        return Err("Xbox Cloud Gaming answer was too large".into());
    }
    let body = String::from_utf8(bytes)
        .map_err(|_| "Xbox Cloud Gaming answer could not be read".to_string())?;
    Ok(Response { status, body })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_service_paths_are_requested() {
        assert!(safe_path("/v5/sessions/cloud/play"));
        assert!(safe_path("/v5/sessions/cloud/ABC-123_def/sdp"));
        assert!(safe_path("/v2/titles"));
        assert!(!safe_path("/v5/../admin"));
        assert!(!safe_path("//evil.example/v5"));
        assert!(!safe_path("https://evil.example/v5/x"));
        assert!(!safe_path("/v5/sessions?x=1"));
        assert!(!safe_path("/other/path"));
    }

    #[test]
    fn the_titles_list_gets_room_for_the_whole_catalog() {
        // Regression: /v2/titles is several MB and hit the 256 KB session cap
        // ("Xbox Cloud Gaming answer was too large").
        assert!(TITLES_LIMIT >= 8 * 1024 * 1024);
        assert!(RESPONSE_LIMIT < TITLES_LIMIT);
    }

    #[test]
    fn device_info_is_valid_json_asking_for_1080p() {
        let info: serde_json::Value = serde_json::from_str(DEVICE_INFO).unwrap();
        assert_eq!(info.pointer("/dev/os/name").unwrap(), "windows");
        assert_eq!(
            info.pointer("/appInfo/env/clientAppId").unwrap(),
            "www.xbox.com"
        );
    }
}
