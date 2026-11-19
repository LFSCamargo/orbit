//! In-container Steam presence. M1 must prove LoadLibrary of steamclient64.dll
//! before the agent path is selected; until then Play uses silent steam.exe.
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SteamPresence {
    /// steamclient64.dll is present; the Wine LoadLibrary spike can run.
    AgentCandidate,
    /// Official silent steam.exe in the container.
    SilentClient,
    Missing,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "cmd", rename_all = "camelCase")]
pub enum AgentRequest {
    Init { app_id: String },
    Shutdown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum AgentReply {
    Ready { steam_id: String },
    Failed { reason: String },
}

pub fn presence(steam_root: &Path) -> SteamPresence {
    let exe = steam_root.join("steam.exe");
    if !exe.is_file() {
        return SteamPresence::Missing;
    }
    if steam_root.join("steamclient64.dll").is_file() {
        SteamPresence::AgentCandidate
    } else {
        SteamPresence::SilentClient
    }
}

/// Agent hosting is opt-in until the Wine LoadLibrary spike is proven.
pub fn select_presence(found: SteamPresence, agent_enabled: bool) -> SteamPresence {
    match found {
        SteamPresence::AgentCandidate if agent_enabled => SteamPresence::AgentCandidate,
        SteamPresence::AgentCandidate => SteamPresence::SilentClient,
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn prefers_silent_steam_until_the_agent_spike_is_enabled() {
        let root = std::env::temp_dir().join(format!(
            "orbit-steam-agent-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        assert_eq!(presence(&root), SteamPresence::Missing);
        fs::write(root.join("steam.exe"), b"MZ").unwrap();
        assert_eq!(presence(&root), SteamPresence::SilentClient);
        fs::write(root.join("steamclient64.dll"), b"MZ").unwrap();
        assert_eq!(presence(&root), SteamPresence::AgentCandidate);
        assert_eq!(
            select_presence(SteamPresence::AgentCandidate, false),
            SteamPresence::SilentClient
        );
        assert_eq!(
            select_presence(SteamPresence::AgentCandidate, true),
            SteamPresence::AgentCandidate
        );
        let request = serde_json::to_string(&AgentRequest::Init {
            app_id: "480".into(),
        })
        .unwrap();
        assert!(request.contains("init"));
        let reply: AgentReply =
            serde_json::from_str(r#"{"status":"failed","reason":"LoadLibrary"}"#).unwrap();
        assert!(matches!(reply, AgentReply::Failed { .. }));
        let _ = fs::remove_dir_all(root);
    }
}
