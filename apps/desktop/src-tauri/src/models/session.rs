use serde::{Deserialize, Serialize};

use super::GameProvider;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SessionStopReason {
    ProcessExited,
    UserStopped,
    LaunchFailed,
    Unknown,
}

impl SessionStopReason {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::ProcessExited => "process-exited",
            Self::UserStopped => "user-stopped",
            Self::LaunchFailed => "launch-failed",
            Self::Unknown => "unknown",
        }
    }

    pub fn parse(value: &str) -> Self {
        match value {
            "process-exited" => Self::ProcessExited,
            "user-stopped" => Self::UserStopped,
            "launch-failed" => Self::LaunchFailed,
            _ => Self::Unknown,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameSession {
    pub id: String,
    pub game_id: String,
    pub provider: GameProvider,
    pub pid: Option<u32>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub exit_code: Option<i32>,
    pub stop_reason: Option<SessionStopReason>,
    pub duration_seconds: Option<i64>,
}
