//! Repair Installation: Steam re-checks every file of a game it installed and
//! downloads anything missing or changed, then Orbit runs the game's install
//! scripts again (see `install_upkeep`). The game's appmanifest is marked
//! "update required" with `FullValidateAfterNextUpdate`, and the title goes
//! through the normal download queue, which shows the progress. When the
//! person's own Steam for Mac is open, it validates the game itself instead.
use std::fs;
use std::path::{Path, PathBuf};

use regex::Regex;

use crate::database::GameRepository;
use crate::services::steam_client_download::{self, parse_state};
use crate::services::steam_download::valid_app_id;

const MANIFEST_LIMIT: u64 = 256 * 1024;
/// Steam's UpdateRequired | FullyInstalled.
const VALIDATE_FLAGS: u64 = 6;
const FULL_VALIDATE: &str = "FullValidateAfterNextUpdate";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RepairStart {
    /// Queued as a download; the queue shows verification progress.
    Queued,
    /// Steam for Mac, open on screen, is validating the files itself.
    InSteam,
}

fn set_number(text: &str, key: &str, value: u64) -> Option<String> {
    let re = Regex::new(&format!(r#"("{key}"\s+")\d+(")"#)).ok()?;
    re.is_match(text).then(|| {
        re.replace(text, format!("${{1}}{value}${{2}}"))
            .into_owned()
    })
}

/// The manifest asking Steam to validate every file on its next run, or None
/// when it is not a manifest of an installed game.
pub fn validation_manifest(text: &str) -> Option<String> {
    let state = parse_state(text);
    if state.flags & 4 == 0 {
        return None;
    }
    let text = set_number(text, "StateFlags", VALIDATE_FLAGS)?;
    let text = set_number(&text, "UpdateResult", 0).unwrap_or(text);
    match set_number(&text, FULL_VALIDATE, 1) {
        Some(updated) => Some(updated),
        None => {
            let re = Regex::new(r#"("StateFlags"\s+"\d+"[^\n]*\n)"#).ok()?;
            Some(
                re.replace(&text, format!("${{1}}\t\"{FULL_VALIDATE}\"\t\t\"1\"\n"))
                    .into_owned(),
            )
        }
    }
}

fn mark(manifest: &Path) -> Result<(), String> {
    let meta = fs::symlink_metadata(manifest)
        .map_err(|_| "Orbit can only repair games it installed with Steam.".to_string())?;
    if !meta.is_file() || meta.len() > MANIFEST_LIMIT {
        return Err("Steam's record of this game cannot be read.".into());
    }
    let text = fs::read_to_string(manifest).map_err(|err| err.to_string())?;
    let updated = validation_manifest(&text)
        .ok_or("This game is not fully installed yet. Finish its download first.")?;
    fs::write(manifest, updated).map_err(|err| err.to_string())
}

fn mac_manifest(app_id: &str) -> Option<PathBuf> {
    crate::services::steam_mac_client::steam_root().map(|root| {
        root.join("steamapps")
            .join(format!("appmanifest_{app_id}.acf"))
    })
}

/// Starts a repair. The caller enqueues the title when this returns `Queued`.
pub fn request(repo: &GameRepository, app_id: &str) -> Result<RepairStart, String> {
    if !valid_app_id(app_id) {
        return Err("Steam app id must be a number".into());
    }
    if crate::services::steam_mac_download::wants_native(repo, app_id) {
        use crate::services::steam_mac_client as client;
        if client::running() && !client::running_hidden() {
            client::open_url(&format!("steam://validate/{app_id}"))?;
            return Ok(RepairStart::InSteam);
        }
        let manifest = mac_manifest(app_id).ok_or("Orbit cannot find your home folder")?;
        mark(&manifest)?;
        return Ok(RepairStart::Queued);
    }
    let manifest =
        steam_client_download::game_steamapps(app_id)?.join(format!("appmanifest_{app_id}.acf"));
    mark(&manifest)?;
    Ok(RepairStart::Queued)
}

#[cfg(test)]
mod tests {
    use super::*;

    const INSTALLED: &str = "\"AppState\"\n{\n\t\"appid\"\t\t\"2322010\"\n\t\"StateFlags\"\t\t\"4\"\n\t\"installdir\"\t\t\"God of War Ragnarök\"\n\t\"UpdateResult\"\t\t\"12\"\n}\n";

    #[test]
    fn an_installed_manifest_is_marked_for_a_full_validation() {
        let marked = validation_manifest(INSTALLED).unwrap();
        assert!(marked.contains("\"StateFlags\"\t\t\"6\""));
        assert!(marked.contains("\"FullValidateAfterNextUpdate\"\t\t\"1\""));
        assert!(marked.contains("\"UpdateResult\"\t\t\"0\""));
        assert!(marked.contains("God of War Ragnarök"));
        assert!(
            !parse_state(&marked).installed(),
            "the download queue must not skip it"
        );
        let again = validation_manifest(&marked.replace("\"6\"", "\"4\"")).unwrap();
        assert_eq!(again.matches(FULL_VALIDATE).count(), 1);
    }

    #[test]
    fn unfinished_or_unreadable_manifests_are_refused() {
        assert_eq!(
            validation_manifest(&INSTALLED.replace("\"4\"", "\"1026\"")),
            None
        );
        assert_eq!(validation_manifest("not a manifest"), None);
        let dir = std::env::temp_dir().join(format!("orbit-repair-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        assert!(mark(&dir.join("appmanifest_1.acf")).is_err());
        let manifest = dir.join("appmanifest_2322010.acf");
        fs::write(&manifest, INSTALLED).unwrap();
        mark(&manifest).unwrap();
        assert!(fs::read_to_string(&manifest)
            .unwrap()
            .contains(FULL_VALIDATE));
        let _ = fs::remove_dir_all(dir);
    }
}
