//! What a Steam refresh token is good for, read from its JWT claims. The
//! signature is not checked: Steam does that. Orbit only refuses to hand a
//! website token to a game container, where Steam rejects it as
//! "Invalid Password".
use serde::Deserialize;

#[derive(Deserialize)]
struct Claims {
    #[serde(default)]
    aud: Vec<String>,
    #[serde(default)]
    sub: String,
}

/// A token Valve's client issued for `steam_id`: its audience includes
/// `client`. QR and website sign-ins only carry `web`.
pub fn is_client_token(token: &str, steam_id: &str) -> bool {
    let Some(claims) = claims(token) else {
        return false;
    };
    claims.sub == steam_id && claims.aud.iter().any(|aud| aud == "client")
}

fn claims(token: &str) -> Option<Claims> {
    if token.len() > 4096 {
        return None;
    }
    let mut parts = token.split('.');
    let (_, payload, _) = (parts.next()?, parts.next()?, parts.next()?);
    if parts.next().is_some() {
        return None;
    }
    serde_json::from_slice(&base64url(payload)?).ok()
}

fn base64url(text: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(text.len() * 3 / 4);
    let mut buffer = 0u32;
    let mut bits = 0;
    for byte in text.trim_end_matches('=').bytes() {
        let value = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'-' | b'+' => 62,
            b'_' | b'/' => 63,
            _ => return None,
        };
        buffer = (buffer << 6) | u32::from(value);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buffer >> bits) as u8);
        }
    }
    Some(out)
}

#[cfg(test)]
pub(crate) fn sample(aud: &[&str], sub: &str) -> String {
    fn encode(bytes: &[u8]) -> String {
        const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        let mut out = String::new();
        for chunk in bytes.chunks(3) {
            let n = chunk.iter().fold(0u32, |acc, b| (acc << 8) | u32::from(*b))
                << (8 * (3 - chunk.len()));
            for index in 0..=chunk.len() {
                out.push(ALPHABET[((n >> (18 - 6 * index)) & 63) as usize] as char);
            }
        }
        out
    }
    let payload = serde_json::json!({ "aud": aud, "sub": sub }).to_string();
    format!("eyJhbGciOiJFZERTQSJ9.{}.c2ln", encode(payload.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_client_token_for_this_account_can_log_a_container_on() {
        let id = "76561198000000000";
        assert!(is_client_token(
            &sample(&["client", "web", "renew", "derive"], id),
            id
        ));
        // Regression: a QR sign-in token was saved as a client login and every
        // container logon failed with "Invalid Password".
        assert!(!is_client_token(
            &sample(&["web", "renew", "derive"], id),
            id
        ));
        assert!(!is_client_token(
            &sample(&["client"], "76561198000000001"),
            id
        ));
        assert!(!is_client_token("not-a-jwt", id));
        assert!(!is_client_token("a.!!!.c", id));
    }
}
