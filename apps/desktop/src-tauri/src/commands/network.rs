use crate::services::network_monitor::{self, NetworkStats};

/// The latest network sample; later ones arrive as `network-stats` events.
#[tauri::command]
pub fn get_network_stats() -> NetworkStats {
    network_monitor::snapshot()
}
