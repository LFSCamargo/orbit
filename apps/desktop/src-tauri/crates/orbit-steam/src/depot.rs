//! Native download plan. The first executor still drives SteamCMD; this type is
//! the contract that replaces ad-hoc argument assembly.
use serde::{Deserialize, Serialize};

use crate::product::parse_app_id;
use crate::session::valid_account_name;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DepotPlan {
    pub account_name: String,
    pub app_id: u32,
    pub install_dir: String,
    pub offline: bool,
    pub verify: bool,
}

impl DepotPlan {
    pub fn parse(
        account_name: &str,
        app_id: &str,
        install_dir: &str,
        offline: bool,
        verify: bool,
    ) -> Result<Self, String> {
        if !valid_account_name(account_name) {
            return Err("Steam account name is missing".into());
        }
        let app_id = parse_app_id(app_id)?;
        if install_dir.is_empty()
            || install_dir.len() > 4096
            || install_dir.contains('\0')
            || install_dir.split(['/', '\\']).any(|part| part == "..")
        {
            return Err("Install directory escapes the Steam session folder".into());
        }
        Ok(Self {
            account_name: account_name.to_string(),
            app_id,
            install_dir: install_dir.to_string(),
            offline,
            verify,
        })
    }

    /// Official headless client arguments. There is no password argument.
    pub fn steamcmd_arguments(&self) -> Vec<String> {
        let mut args = vec![
            "+@ShutdownOnFailedCommand".into(),
            "1".into(),
            "+@sSteamCmdForcePlatformType".into(),
            "windows".into(),
            "+force_install_dir".into(),
            self.install_dir.clone(),
        ];
        if self.offline {
            args.push("+@bClientTryOfflineMode".into());
            args.push("1".into());
        }
        args.extend([
            "+login".into(),
            self.account_name.clone(),
            "+app_update".into(),
            self.app_id.to_string(),
        ]);
        if self.verify {
            args.push("validate".into());
        }
        args.push("+quit".into());
        args
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_headless_windows_update_without_a_password() {
        let plan = DepotPlan::parse("orbit_user", "480", "/tmp/games/480", false, true).unwrap();
        let args = plan.steamcmd_arguments();
        assert!(args.contains(&"+login".into()));
        assert!(args.contains(&"orbit_user".into()));
        assert!(args.contains(&"480".into()));
        assert!(args.contains(&"validate".into()));
        assert!(!args.iter().any(|arg| arg.contains("password")));
        assert!(DepotPlan::parse("orbit_user", "480", "../outside", false, false).is_err());
    }
}
