//! Steam Cloud listing into a container userdata folder.
use std::path::{Path, PathBuf};

use orbit_steam::CloudListing;

use crate::utils::steam_account::userdata_account_id;

pub fn listing(app_id: &str, body: &[u8]) -> Result<CloudListing, String> {
    CloudListing::from_json(app_id, body)
}

pub fn destination(prefix: &Path, steam_id: &str, app_id: u32) -> Result<PathBuf, String> {
    let account = userdata_account_id(steam_id).ok_or("Steam Cloud account id is missing")?;
    let relative = CloudListing::userdata_relative(&account, app_id)?;
    let path = prefix.join(relative);
    if path
        .components()
        .any(|part| matches!(part, std::path::Component::ParentDir))
    {
        return Err("Steam Cloud path escapes the container".into());
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn maps_cloud_files_into_container_userdata() {
        let listing = listing(
            "480",
            br#"{"response":{"files":[{"filename":"save.dat","sha":"aa","size":2}]}}"#,
        )
        .unwrap();
        assert_eq!(listing.files[0].path, "save.dat");
        let dest = destination(Path::new("/tmp/prefix"), "76561198000000000", 480).unwrap();
        assert!(dest.ends_with("480/remote"));
        assert!(dest.to_string_lossy().contains("userdata"));
    }
}
