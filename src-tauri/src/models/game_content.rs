use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameContentSummary {
    pub game_id: String,
    pub version_label: Option<String>,
    pub version_detail: Option<String>,
    pub dlc_count: u32,
    pub update_count: u32,
    pub dlc_names: Vec<String>,
    pub has_base: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeContentInventory {
    pub summaries: Vec<GameContentSummary>,
}
