use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SwitchContentKind {
    Base,
    Update,
    Dlc,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwitchRomEntry {
    pub path: String,
    pub file_name: String,
    pub label: String,
    pub title_id: Option<String>,
    pub version: Option<String>,
    pub kind: SwitchContentKind,
    pub size_bytes: Option<i64>,
    pub in_library: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwitchTitleGroup {
    pub group_key: String,
    pub display_title: String,
    pub base_title_id: Option<String>,
    pub linked_game_id: Option<String>,
    pub base: Option<SwitchRomEntry>,
    pub updates: Vec<SwitchRomEntry>,
    pub dlcs: Vec<SwitchRomEntry>,
    pub extras: Vec<SwitchRomEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwitchLibraryScan {
    pub folders: Vec<String>,
    pub groups: Vec<SwitchTitleGroup>,
    pub total_files: usize,
}
