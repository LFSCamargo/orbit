//! Owned-library rows from a native catalog snapshot.
use serde::{Deserialize, Serialize};

use crate::product::parse_app_id;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnedGame {
    pub app_id: u32,
    pub name: String,
}

impl OwnedGame {
    pub fn parse(app_id: &str, name: &str) -> Result<Self, String> {
        let app_id = parse_app_id(app_id)?;
        let name = name.trim();
        if name.is_empty() || name.len() > 256 {
            return Err("Owned game title is missing".into());
        }
        Ok(Self {
            app_id,
            name: name.to_string(),
        })
    }
}

pub fn from_catalog<'a, I>(rows: I) -> Result<Vec<OwnedGame>, String>
where
    I: IntoIterator<Item = (&'a str, &'a str)>,
{
    let mut games = Vec::new();
    for (index, (app_id, name)) in rows.into_iter().enumerate() {
        if index >= 4_000 {
            return Err("Owned catalog exceeded the supported size".into());
        }
        games.push(OwnedGame::parse(app_id, name)?);
    }
    Ok(games)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_a_bounded_catalog_and_rejects_junk_ids() {
        let games = from_catalog([("480", "Spacewar"), ("1593500", "God of War")]).unwrap();
        assert_eq!(games[0].app_id, 480);
        assert_eq!(games[1].name, "God of War");
        assert!(from_catalog([("nope", "Spacewar")]).is_err());
        assert!(OwnedGame::parse("480", "").is_err());
    }
}
