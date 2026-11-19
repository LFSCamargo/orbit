//! Steam Cloud file lists. Live tokens never enter this crate.
use serde::{Deserialize, Serialize};

use crate::product::parse_app_id;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudFile {
    pub path: String,
    pub sha: String,
    pub size: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudListing {
    pub app_id: u32,
    pub files: Vec<CloudFile>,
}

#[derive(Deserialize)]
struct SteamCloudBody {
    #[serde(default)]
    response: SteamCloudResponse,
}

#[derive(Default, Deserialize)]
struct SteamCloudResponse {
    #[serde(default)]
    files: Vec<SteamCloudEntry>,
}

#[derive(Deserialize)]
struct SteamCloudEntry {
    #[serde(default)]
    filename: String,
    #[serde(default)]
    sha: String,
    #[serde(default)]
    size: u64,
}

impl CloudListing {
    pub fn from_json(app_id: &str, bytes: &[u8]) -> Result<Self, String> {
        if bytes.len() > 1024 * 1024 {
            return Err("Steam Cloud listing exceeded the supported size".into());
        }
        let app_id = parse_app_id(app_id)?;
        let body: SteamCloudBody =
            serde_json::from_slice(bytes).map_err(|_| "Steam Cloud listing could not be read")?;
        if body.response.files.len() > 4_096 {
            return Err("Steam Cloud listing exceeded the supported size".into());
        }
        let mut files = Vec::new();
        for entry in body.response.files {
            if entry.filename.is_empty()
                || entry.filename.len() > 512
                || entry.filename.contains('\0')
                || entry.filename.split(['/', '\\']).any(|part| part == "..")
            {
                continue;
            }
            if entry.sha.len() > 128 || !entry.sha.bytes().all(|c| c.is_ascii_hexdigit()) {
                continue;
            }
            files.push(CloudFile {
                path: entry.filename,
                sha: entry.sha,
                size: entry.size,
            });
        }
        Ok(Self { app_id, files })
    }

    pub fn userdata_relative(steam_id3: &str, app_id: u32) -> Result<String, String> {
        if steam_id3.is_empty()
            || steam_id3.len() > 16
            || !steam_id3.bytes().all(|c| c.is_ascii_digit())
        {
            return Err("Steam Cloud account id is missing".into());
        }
        if app_id == 0 {
            return Err("Steam app id must be a number".into());
        }
        Ok(format!(
            "drive_c/Program Files (x86)/Steam/userdata/{steam_id3}/{app_id}/remote"
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_cloud_files_and_drops_traversal() {
        let listing = CloudListing::from_json(
            "480",
            br#"{"response":{"files":[
                {"filename":"save.dat","sha":"abc","size":12},
                {"filename":"../escape","sha":"def","size":1}
            ]}}"#,
        )
        .unwrap();
        assert_eq!(listing.app_id, 480);
        assert_eq!(listing.files.len(), 1);
        assert_eq!(listing.files[0].path, "save.dat");
        assert_eq!(
            CloudListing::userdata_relative("12345", 480).unwrap(),
            "drive_c/Program Files (x86)/Steam/userdata/12345/480/remote"
        );
        assert!(CloudListing::userdata_relative("../x", 480).is_err());
    }
}
