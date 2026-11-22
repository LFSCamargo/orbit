//! Clean-room Microsoft Store / Xbox PC (GDK / MSIXVC) protocol crate for Orbit.
//!
//! Owns CLEP device challenge codecs, WS-Trust (`deviceaddcredential.srf` / `RST2.srf`)
//! authentication envelopes, `SPLicenseBlock` TLV parsing and RFC 3394 CIK unwrapping,
//! PC Game Pass & owned-entitlement catalog parsers, `MicrosoftGame.config` parsing,
//! and streaming MSIXVC / XVD XTS-AES-128 extraction.
//!
//! Zero Tauri or SQLite dependencies so every cryptographic, wire-format, and security
//! invariant can be tested deterministically offline.

pub mod catalog;
pub mod clep;
pub mod manifest;
pub mod msixvc;
pub mod soap;
pub mod splicense;

use thiserror::Error;

/// Maximum response body read from Microsoft JSON / XML control-plane endpoints.
pub const MAX_CONTROL_RESPONSE_BYTES: usize = 4 * 1024 * 1024;

#[derive(Debug, Error)]
pub enum MsStoreError {
    #[error("This Microsoft account does not own this title or hold an active PC Game Pass entitlement")]
    NotEntitled,

    #[error("Your Microsoft Store session expired. Sign in again in Settings")]
    AuthExpired,

    #[error("Unsupported package format: {0}")]
    UnsupportedFormat(String),

    #[error("Package integrity check failed: {0}")]
    IntegrityMismatch(String),

    #[error("Invalid or unsafe path: {0}")]
    InvalidPath(String),

    #[error("Disallowed host or URL: {0}")]
    DisallowedUrl(String),

    #[error("Cryptographic operation failed: {0}")]
    Crypto(String),

    #[error("Protocol error: {0}")]
    Protocol(String),

    #[error("Network request failed: {0}")]
    Network(String),

    #[error("Download cancelled")]
    Cancelled,

    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
}

pub type Result<T> = std::result::Result<T, MsStoreError>;

/// Microsoft Store product IDs are 12 ASCII alphanumeric characters (e.g. `9P8LR42PTRGJ`).
pub fn valid_product_id(id: &str) -> bool {
    id.len() == 12 && id.bytes().all(|b| b.is_ascii_alphanumeric())
}

/// MSIXVC Content IDs are standard UUIDs (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).
pub fn valid_content_id(id: &str) -> bool {
    uuid::Uuid::parse_str(id.trim()).is_ok()
}

/// Strictly validates HTTPS Microsoft Store / Xbox CDN download URLs.
/// Rejects HTTP, credentials in URLs, non-Microsoft hosts, and control characters.
pub fn is_allowed_cdn_url(url: &str) -> bool {
    let Some(host) = parse_https_host(url) else {
        return false;
    };
    host == "microsoft.com"
        || host.ends_with(".dl.delivery.mp.microsoft.com")
        || host.ends_with(".delivery.mp.microsoft.com")
        || host.ends_with(".assets1.xboxlive.com")
        || host.ends_with(".assets2.xboxlive.com")
        || host.ends_with(".xboxlive.com")
        || host.ends_with(".microsoft.com")
        || host.ends_with(".msedge.net")
        || host.ends_with(".akamaihd.net")
}

/// Strictly validates navigation URLs inside Orbit's Microsoft Store TokenBroker login webview.
/// Only HTTPS Microsoft authentication domains are permitted.
pub fn is_allowed_login_url(url: &str) -> bool {
    let Some(host) = parse_https_host(url) else {
        return false;
    };
    const EXACT: &[&str] = &[
        "login.live.com",
        "login.microsoftonline.com",
        "account.live.com",
        "account.microsoft.com",
        "signup.live.com",
        "msftauth.net",
        "msauth.net",
    ];
    const SUFFIXES: &[&str] = &[
        ".login.live.com",
        ".login.microsoftonline.com",
        ".account.live.com",
        ".msftauth.net",
        ".msauth.net",
        ".microsoftonline-p.com",
        ".live.com",
    ];
    EXACT.contains(&host.as_str()) || SUFFIXES.iter().any(|suffix| host.ends_with(suffix))
}

fn parse_https_host(url: &str) -> Option<String> {
    let trimmed = url.trim();
    if trimmed.is_empty()
        || trimmed.len() > 4096
        || trimmed.chars().any(char::is_control)
        || !trimmed.starts_with("https://")
    {
        return None;
    }
    let after_scheme = &trimmed["https://".len()..];
    let authority = after_scheme
        .split(['/', '?', '#'])
        .next()
        .filter(|part| !part.is_empty())?;
    if authority.contains('@') {
        return None;
    }
    let host = match authority.split_once(':') {
        Some((h, port)) => {
            if port.is_empty() || !port.bytes().all(|b| b.is_ascii_digit()) {
                return None;
            }
            h
        }
        None => authority,
    };
    if host.is_empty()
        || !host
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-')
    {
        return None;
    }
    Some(host.to_ascii_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_product_and_content_ids() {
        assert!(valid_product_id("9P8LR42PTRGJ"));
        assert!(!valid_product_id("../etc/pass"));
        assert!(!valid_product_id("short"));
        assert!(valid_content_id("12345678-1234-1234-1234-123456789abc"));
        assert!(!valid_content_id("not-a-uuid"));
    }

    #[test]
    fn enforces_strict_cdn_and_login_host_allowlists() {
        assert!(is_allowed_cdn_url(
            "https://xvcf1.xboxlive.com/Z/abc/package.msixvc"
        ));
        assert!(is_allowed_cdn_url(
            "https://tlu.dl.delivery.mp.microsoft.com/filestreamingservice/files/123"
        ));
        assert!(!is_allowed_cdn_url(
            "http://xvcf1.xboxlive.com/Z/abc/package.msixvc"
        ));
        assert!(!is_allowed_cdn_url("https://evil.example/package.msixvc"));
        assert!(!is_allowed_cdn_url(
            "https://user@xvcf1.xboxlive.com/package.msixvc"
        ));
        assert!(!is_allowed_cdn_url(
            "https://xvcf1.xboxlive.com.evil.example/package.msixvc"
        ));

        assert!(is_allowed_login_url(
            "https://login.live.com/InlineLogin.srf?id=292543"
        ));
        assert!(is_allowed_login_url(
            "https://login.microsoftonline.com/common/oauth2"
        ));
        assert!(is_allowed_login_url("https://logincdn.msauth.net/shared/1"));
        assert!(!is_allowed_login_url("https://evil.example/phish"));
        assert!(!is_allowed_login_url("http://login.live.com/InlineLogin.srf"));
        assert!(!is_allowed_login_url("javascript:alert(1)"));
    }
}
