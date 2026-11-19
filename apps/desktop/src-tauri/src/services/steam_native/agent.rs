//! How a container's Steam files are described. Play does not use this to
//! decide: a saved refresh token always starts the in-container agent
//! (`container_steam`). This flag only labels a container that already has
//! both `steam.exe` and `steamclient64.dll`.
use std::path::Path;

use orbit_steam::{select_presence, SteamPresence};

use crate::runtimes::containers::steam::steam_root;

pub fn presence(prefix: &Path) -> SteamPresence {
    orbit_steam::agent::presence(&steam_root(prefix))
}

pub fn selected(prefix: &Path) -> SteamPresence {
    select_presence(presence(prefix), agent_enabled())
}

/// The agent cannot host steamclient yet (`steamclient64.dll` only connects to
/// a running IPC master), so Play uses it only when this is set.
pub(crate) fn agent_enabled() -> bool {
    std::env::var_os("ORBIT_STEAM_AGENT").is_some_and(|value| value == "1")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn silent_steam_is_the_production_default() {
        let root = std::env::temp_dir().join(format!("orbit-agent-prod-{}", uuid::Uuid::new_v4()));
        let steam = steam_root(&root);
        fs::create_dir_all(&steam).unwrap();
        fs::write(steam.join("steam.exe"), b"MZ").unwrap();
        fs::write(steam.join("steamclient64.dll"), b"MZ").unwrap();
        assert_eq!(presence(&root), SteamPresence::AgentCandidate);
        assert_eq!(
            select_presence(SteamPresence::AgentCandidate, false),
            SteamPresence::SilentClient
        );
        let _ = fs::remove_dir_all(root);
    }
}
