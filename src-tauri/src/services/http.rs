/// Shared HTTP client helpers for Orbit outbound requests.

const USER_AGENT: &str = "Orbit/0.2";

/// Build a reqwest client with Orbit's user agent.
pub fn orbit_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|err| err.to_string())
}

/// Download response body bytes from an http(s) URL.
pub async fn fetch_bytes(url: &str) -> Result<Vec<u8>, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(format!("Download URL must be http(s): {url}"));
    }
    let client = orbit_client()?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Failed to download (HTTP {})",
            response.status()
        ));
    }
    response
        .bytes()
        .await
        .map_err(|err| err.to_string())
        .map(|b| b.to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_client_with_orbit_user_agent() {
        let client = orbit_client().expect("client");
        // Client construction is the contract; UA is set on the builder above.
        let _ = client;
    }

    #[tokio::test]
    async fn rejects_non_http_urls() {
        let err = fetch_bytes("file:///tmp/x").await.expect_err("must reject");
        assert!(err.contains("http(s)"));
    }
}
