//! Store product info used to plan a Windows install.
use serde::{Deserialize, Serialize};

use crate::session::valid_steam_id;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DepotInfo {
    pub depot_id: u32,
    pub os: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductInfo {
    pub app_id: u32,
    pub name: String,
    pub depots: Vec<DepotInfo>,
}

impl ProductInfo {
    pub fn parse(app_id: u32, name: &str, depots: Vec<DepotInfo>) -> Result<Self, String> {
        if app_id == 0 {
            return Err("Steam app id must be a number".into());
        }
        let name = name.trim();
        if name.is_empty() || name.len() > 256 {
            return Err("Steam product name is missing".into());
        }
        if depots.len() > 64 {
            return Err("Steam product listed too many depots".into());
        }
        Ok(Self {
            app_id,
            name: name.to_string(),
            depots,
        })
    }

    pub fn windows_depots(&self) -> impl Iterator<Item = &DepotInfo> {
        self.depots
            .iter()
            .filter(|depot| depot.os.eq_ignore_ascii_case("windows") || depot.os.is_empty())
    }
}

pub fn parse_app_id(value: &str) -> Result<u32, String> {
    if value.is_empty() || value.len() > 10 || !value.bytes().all(|c| c.is_ascii_digit()) {
        return Err("Steam app id must be a number".into());
    }
    value
        .parse()
        .map_err(|_| "Steam app id must be a number".into())
        .and_then(|id: u32| {
            (id != 0)
                .then_some(id)
                .ok_or("Steam app id must be a number".into())
        })
}

pub fn parse_steam_id(value: &str) -> Result<String, String> {
    if valid_steam_id(value) {
        Ok(value.to_string())
    } else {
        Err("Steam id is missing".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_windows_depots_and_rejects_zero_app_ids() {
        let product = ProductInfo::parse(
            480,
            "Spacewar",
            vec![
                DepotInfo {
                    depot_id: 481,
                    os: "windows".into(),
                },
                DepotInfo {
                    depot_id: 482,
                    os: "macos".into(),
                },
            ],
        )
        .unwrap();
        let windows: Vec<_> = product.windows_depots().map(|d| d.depot_id).collect();
        assert_eq!(windows, vec![481]);
        assert!(ProductInfo::parse(0, "Spacewar", Vec::new()).is_err());
        assert_eq!(parse_app_id("480").unwrap(), 480);
        assert!(parse_app_id("0").is_err());
        assert!(parse_app_id("480;rm").is_err());
    }
}
