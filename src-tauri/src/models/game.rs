use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum GameProvider {
    Astris,
    Steam,
    Gamehub,
    Native,
    Manual,
}

impl GameProvider {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Astris => "astris",
            Self::Steam => "steam",
            Self::Gamehub => "gamehub",
            Self::Native => "native",
            Self::Manual => "manual",
        }
    }

    pub fn parse(value: &str) -> Self {
        match value {
            "astris" => Self::Astris,
            "steam" => Self::Steam,
            "gamehub" => Self::Gamehub,
            "native" => Self::Native,
            _ => Self::Manual,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum GamePlatform {
    NintendoSwitch,
    Macos,
    Windows,
    Linux,
    Unknown,
}

impl GamePlatform {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::NintendoSwitch => "nintendo-switch",
            Self::Macos => "macos",
            Self::Windows => "windows",
            Self::Linux => "linux",
            Self::Unknown => "unknown",
        }
    }

    pub fn parse(value: &str) -> Self {
        match value {
            "nintendo-switch" => Self::NintendoSwitch,
            "macos" => Self::Macos,
            "windows" => Self::Windows,
            "linux" => Self::Linux,
            _ => Self::Unknown,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum LaunchConfiguration {
    OpenFile {
        #[serde(rename = "filePath")]
        file_path: String,
        #[serde(rename = "applicationPath")]
        application_path: Option<String>,
    },
    OpenApplication {
        #[serde(rename = "applicationPath")]
        application_path: String,
        arguments: Option<Vec<String>>,
    },
    OpenUrl {
        url: String,
    },
    Steam {
        #[serde(rename = "appId")]
        app_id: String,
    },
    CustomCommand {
        executable: String,
        arguments: Vec<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GameArtwork {
    pub cover: Option<String>,
    pub hero: Option<String>,
    pub logo: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Achievement {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub unlocked: bool,
    pub unlocked_at: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    pub id: String,
    pub title: String,
    pub sort_title: String,
    pub description: Option<String>,
    pub provider: GameProvider,
    pub platform: GamePlatform,
    pub source_id: Option<String>,
    pub launch_config: LaunchConfiguration,
    pub artwork: GameArtwork,
    pub favorite: bool,
    pub hidden: bool,
    pub date_added: String,
    pub last_played_at: Option<String>,
    pub total_playtime_seconds: i64,
    pub install_size_bytes: Option<i64>,
    pub achievements: Vec<Achievement>,
}

/// Normalized importer output before persistence.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedGame {
    pub stable_key: String,
    pub title: String,
    pub sort_title: String,
    pub description: Option<String>,
    pub provider: GameProvider,
    pub platform: GamePlatform,
    pub source_id: Option<String>,
    pub launch_config: LaunchConfiguration,
    pub artwork: GameArtwork,
    pub total_playtime_seconds: i64,
    pub install_size_bytes: Option<i64>,
    pub achievements: Vec<Achievement>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GameOverrides {
    pub title: Option<String>,
    pub description: Option<String>,
    pub cover: Option<String>,
    pub hero: Option<String>,
    pub logo: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateGameRequest {
    pub title: String,
    pub description: Option<String>,
    pub provider: GameProvider,
    pub platform: GamePlatform,
    pub launch_config: LaunchConfiguration,
    pub artwork: Option<GameArtwork>,
    pub install_size_bytes: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateGameRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub artwork: Option<GameArtwork>,
    pub launch_config: Option<LaunchConfiguration>,
    pub install_size_bytes: Option<i64>,
}
