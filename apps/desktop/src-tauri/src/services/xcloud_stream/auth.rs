//! xCloud streaming tokens from the linked account: Microsoft token → Xbox
//! user token → XSTS for gssv → `/v2/login/user`. The token never reaches the
//! frontend; only region names and the market do.

use std::io::Read;
use std::path::Path;
use std::time::Duration;

use serde::Serialize;
use zeroize::Zeroizing;

use crate::services::xbox_auth;

pub(crate) const GSSV_RELYING_PARTY: &str = "http://gssv.xboxlive.com/";
/// Game Pass cloud, then the free-to-play offering (as Greenlight asks).
pub(crate) const CLOUD_OFFERINGS: [&str; 2] = ["xgpuweb", "xgpuwebf2p"];
const SERVICE_SUFFIX: &str = ".gssv-play-prod.xboxlive.com";
/// The login answer carries the token and every region; leave room.
const RESPONSE_LIMIT: u64 = 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamRegion {
    pub name: String,
    pub base_uri: String,
    pub is_default: bool,
}

/// A streaming login: the bearer token stays in Rust.
pub struct StreamingSession {
    pub token: Zeroizing<String>,
    pub market: String,
    pub regions: Vec<StreamRegion>,
}

impl StreamingSession {
    /// The region Microsoft marks as default, else the first trusted one.
    pub fn default_region(&self) -> Option<&StreamRegion> {
        self.regions
            .iter()
            .find(|region| region.is_default)
            .or_else(|| self.regions.first())
    }
}

pub(crate) fn login_url(offering: &str) -> String {
    format!("https://{offering}{SERVICE_SUFFIX}/v2/login/user")
}

/// Signs in to xCloud with the linked account. Network: refresh, user token,
/// XSTS, then one login per offering until one answers.
pub fn cloud_session(session_dir: &Path) -> Result<StreamingSession, String> {
    let access = xbox_auth::refresh_access_token(session_dir)?;
    let user = xbox_auth::user_token(&access)?;
    let gssv = xbox_auth::xsts_token(&xbox_auth::xsts(&user, GSSV_RELYING_PARTY)?)?;
    let mut last_error = String::from("Xbox Cloud Gaming is not available for this account");
    for offering in CLOUD_OFFERINGS {
        match login(offering, &gssv) {
            Ok(session) => return Ok(session),
            Err(error) => last_error = error,
        }
    }
    Err(last_error)
}

fn login(offering: &str, gssv_token: &str) -> Result<StreamingSession, String> {
    let response = reqwest::blocking::Client::builder()
        .user_agent("Orbit")
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|_| "Xbox Cloud Gaming could not start".to_string())?
        .post(login_url(offering))
        .header("x-gssv-client", "XboxComBrowser")
        .header("Cache-Control", "no-store, must-revalidate, no-cache")
        .json(&serde_json::json!({ "token": gssv_token, "offeringId": offering }))
        .send()
        .map_err(|_| "Xbox Cloud Gaming could not be reached".to_string())?;
    if !response.status().is_success() {
        return Err("Xbox Cloud Gaming is not available for this account or country".into());
    }
    let mut body = Zeroizing::new(Vec::new());
    response
        .take(RESPONSE_LIMIT + 1)
        .read_to_end(&mut body)
        .map_err(|_| "Xbox Cloud Gaming answer could not be read".to_string())?;
    if body.len() as u64 > RESPONSE_LIMIT {
        return Err("Xbox Cloud Gaming login answer was too large".into());
    }
    parse_login(
        std::str::from_utf8(&body).map_err(|_| "Xbox Cloud Gaming answer could not be read")?,
    )
}

/// Only https hosts under Microsoft's streaming service are kept.
fn trusted_region_uri(uri: &str) -> bool {
    let Ok(url) = uri.parse::<tauri::Url>() else {
        return false;
    };
    url.scheme() == "https"
        && url
            .host_str()
            .is_some_and(|host| host.ends_with(SERVICE_SUFFIX))
}

fn parse_login(body: &str) -> Result<StreamingSession, String> {
    let value: serde_json::Value =
        serde_json::from_str(body).map_err(|_| "Xbox Cloud Gaming answer could not be read")?;
    let token = value
        .get("gsToken")
        .and_then(|v| v.as_str())
        .filter(|t| !t.is_empty() && t.len() <= 16 * 1024)
        .map(|t| Zeroizing::new(t.to_string()))
        .ok_or("Xbox Cloud Gaming did not return a streaming token")?;
    let regions: Vec<StreamRegion> = value
        .pointer("/offeringSettings/regions")
        .and_then(|v| v.as_array())
        .into_iter()
        .flatten()
        .take(64)
        .filter_map(|region| {
            let name = region.get("name")?.as_str()?.trim();
            let base_uri = region.get("baseUri")?.as_str()?;
            (!name.is_empty() && name.len() <= 64 && trusted_region_uri(base_uri)).then(|| {
                StreamRegion {
                    name: name.to_string(),
                    base_uri: base_uri.trim_end_matches('/').to_string(),
                    is_default: region.get("isDefault").and_then(|v| v.as_bool()) == Some(true),
                }
            })
        })
        .collect();
    if regions.is_empty() {
        return Err("Xbox Cloud Gaming has no region for this account".into());
    }
    let market = value
        .get("market")
        .and_then(|v| v.as_str())
        .filter(|m| m.len() <= 8 && m.chars().all(|c| c.is_ascii_alphabetic()))
        .unwrap_or_default()
        .to_string();
    Ok(StreamingSession {
        token,
        market,
        regions,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_streaming_token_and_its_regions() {
        let session = parse_login(
            r#"{"offeringSettings":{"allowRegionSelection":true,"regions":[
                {"name":"BrazilSouth","baseUri":"https://brs.core.gssv-play-prod.xboxlive.com","isDefault":true},
                {"name":"EastUS","baseUri":"https://eus.core.gssv-play-prod.xboxlive.com","isDefault":false}]},
               "market":"BR","gsToken":"gs-secret","tokenType":"bearer","durationInSeconds":14400}"#,
        )
        .unwrap();
        assert_eq!(session.token.as_str(), "gs-secret");
        assert_eq!(session.market, "BR");
        assert_eq!(session.regions.len(), 2);
        assert_eq!(session.default_region().unwrap().name, "BrazilSouth");
    }

    #[test]
    fn drops_regions_outside_microsofts_streaming_service() {
        let session = parse_login(
            r#"{"offeringSettings":{"regions":[
                {"name":"Evil","baseUri":"https://gssv-play-prod.xboxlive.com.evil.example","isDefault":true},
                {"name":"Plain","baseUri":"http://wus.core.gssv-play-prod.xboxlive.com","isDefault":false},
                {"name":"WestUS","baseUri":"https://wus.core.gssv-play-prod.xboxlive.com","isDefault":false}]},
               "market":"US","gsToken":"t","durationInSeconds":60}"#,
        )
        .unwrap();
        let names: Vec<_> = session.regions.iter().map(|r| r.name.as_str()).collect();
        assert_eq!(names, ["WestUS"]);
        // With no default left, the first trusted region is used.
        assert_eq!(session.default_region().unwrap().name, "WestUS");
    }

    #[test]
    fn a_login_without_a_token_or_regions_is_an_error() {
        assert!(parse_login(r#"{"offeringSettings":{"regions":[]},"gsToken":"t"}"#).is_err());
        assert!(parse_login(
            r#"{"offeringSettings":{"regions":[{"name":"W","baseUri":"https://w.core.gssv-play-prod.xboxlive.com"}]}}"#
        )
        .is_err());
        assert!(parse_login("not json").is_err());
    }

    #[test]
    fn asks_the_cloud_offerings_in_greenlights_order() {
        assert_eq!(CLOUD_OFFERINGS, ["xgpuweb", "xgpuwebf2p"]);
        assert_eq!(
            login_url("xgpuweb"),
            "https://xgpuweb.gssv-play-prod.xboxlive.com/v2/login/user"
        );
        assert_eq!(GSSV_RELYING_PARTY, "http://gssv.xboxlive.com/");
    }
}
