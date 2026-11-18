//! Xbox Cloud Gaming in its own Orbit window (xbox.com/play).
//!
//! The page is remote: the window gets no Tauri capability (capabilities are
//! scoped to `main`), so it cannot call Orbit's commands. Navigation stays on
//! Xbox and Microsoft sign-in hosts; any other link opens in the default
//! browser instead of inside the window.

use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

const LABEL: &str = "xbox-cloud";
const HOME: &str = "https://www.xbox.com/play";
/// xbox.com/play gates on Safari; WKWebView's own user agent omits it.
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

/// Hosts (and their subdomains) the window may load: Xbox, the streaming
/// service and Microsoft account sign-in.
const ALLOWED_HOSTS: &[&str] = &[
    "xbox.com",
    "xboxlive.com",
    "live.com",
    "live.net",
    "microsoft.com",
    "microsoftonline.com",
    "msauth.net",
    "msftauth.net",
    "gfx.ms",
];

/// Whether the Xbox window may navigate to `url` itself.
pub(crate) fn allowed_navigation(url: &Url) -> bool {
    if url.as_str() == "about:blank" {
        return true;
    }
    if url.scheme() != "https" {
        return false;
    }
    let Some(host) = url.host_str() else {
        return false;
    };
    ALLOWED_HOSTS
        .iter()
        .any(|allowed| host == *allowed || host.ends_with(&format!(".{allowed}")))
}

/// Opens the Xbox Cloud Gaming window, or brings it back if it is open.
#[tauri::command]
pub fn open_xbox_cloud(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.unminimize();
        return window.set_focus().map_err(|error| error.to_string());
    }
    let home: Url = HOME.parse().map_err(|error| format!("{error}"))?;
    let opener = app.clone();
    WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::External(home))
        .title("Xbox Cloud Gaming")
        .inner_size(1440.0, 900.0)
        .min_inner_size(960.0, 600.0)
        .maximized(true)
        .user_agent(USER_AGENT)
        .on_navigation(move |url| {
            if allowed_navigation(url) {
                return true;
            }
            if matches!(url.scheme(), "https" | "http") {
                let _ = opener.opener().open_url(url.as_str(), None::<&str>);
            }
            false
        })
        .build()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn allowed(url: &str) -> bool {
        allowed_navigation(&url.parse().unwrap())
    }

    #[test]
    fn stays_on_xbox_and_microsoft_sign_in() {
        assert!(allowed("https://www.xbox.com/en-US/play"));
        assert!(allowed("https://xbox.com/play"));
        assert!(allowed("https://login.live.com/oauth20_authorize.srf"));
        assert!(allowed("https://login.microsoftonline.com/common"));
        assert!(allowed("https://account.microsoft.com/"));
        assert!(allowed(
            "https://wus2.gssv-play-prod.xboxlive.com/v5/sessions"
        ));
        assert!(allowed("about:blank"));
    }

    #[test]
    fn sends_everything_else_to_the_browser() {
        assert!(!allowed("https://example.com/"));
        // A lookalike host is not a subdomain.
        assert!(!allowed("https://notxbox.com/play"));
        assert!(!allowed("https://xbox.com.evil.example/"));
        assert!(!allowed("http://www.xbox.com/play"));
        assert!(!allowed("file:///etc/passwd"));
        assert!(!allowed("javascript:alert(1)"));
    }
}
