//! Steam status phases for Settings. There is no resident steam.exe keep-alive.
//! A saved login is enough to seed per-game containers.

use parking_lot::Mutex;

static LAST_ERROR: Mutex<Option<String>> = Mutex::new(None);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SteamClientPhase {
    Stopped,
    Starting,
    Connecting,
    Ready,
    Failed,
}

impl SteamClientPhase {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Stopped => "stopped",
            Self::Starting => "starting",
            Self::Connecting => "connecting",
            Self::Ready => "ready",
            Self::Failed => "failed",
        }
    }
}

pub fn phase(
    signed_in: bool,
    steam_installed: bool,
    client_running: bool,
    client_logged_in: bool,
    last_error: Option<&str>,
) -> SteamClientPhase {
    if last_error.is_some() && !client_running && !client_logged_in {
        SteamClientPhase::Failed
    } else if client_logged_in || (signed_in && steam_installed && !client_running) {
        SteamClientPhase::Ready
    } else if client_running {
        SteamClientPhase::Connecting
    } else if signed_in && steam_installed {
        SteamClientPhase::Starting
    } else {
        SteamClientPhase::Stopped
    }
}

pub fn caption(phase: SteamClientPhase, last_error: Option<&str>) -> String {
    match phase {
        SteamClientPhase::Stopped => String::new(),
        SteamClientPhase::Starting => "Waiting for Steam…".into(),
        SteamClientPhase::Connecting => "Waiting for Steam to sign in…".into(),
        SteamClientPhase::Ready => "Steam is ready".into(),
        SteamClientPhase::Failed => last_error
            .unwrap_or("Windows Steam could not start")
            .to_string(),
    }
}

pub fn describe(
    signed_in: bool,
    steam_installed: bool,
    client_running: bool,
    client_logged_in: bool,
) -> (String, String) {
    let error = LAST_ERROR.lock().clone();
    let phase = phase(
        signed_in,
        steam_installed,
        client_running,
        client_logged_in,
        error.as_deref(),
    );
    (phase.as_str().into(), caption(phase, error.as_deref()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ready_when_the_saved_login_exists() {
        assert_eq!(phase(true, true, true, true, None), SteamClientPhase::Ready);
        assert_eq!(
            phase(true, true, true, false, None),
            SteamClientPhase::Connecting
        );
        assert_eq!(
            phase(true, true, false, false, None),
            SteamClientPhase::Ready
        );
        assert_eq!(
            phase(false, true, false, false, None),
            SteamClientPhase::Stopped
        );
        assert_eq!(
            phase(true, true, false, false, Some("no wine")),
            SteamClientPhase::Failed
        );
        assert_eq!(
            caption(SteamClientPhase::Connecting, None),
            "Waiting for Steam to sign in…"
        );
        assert_eq!(caption(SteamClientPhase::Ready, None), "Steam is ready");
    }
}
