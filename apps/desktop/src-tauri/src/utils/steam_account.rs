//! Read a Steam account name and owned app IDs from local Valve files.
//! Token values and passwords are never returned.

use std::fs;
use std::io::Read;
use std::path::Path;

const STEAM_ID_OFFSET: u64 = 76_5611_9796_0265_728;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SteamAccount {
    pub name: String,
    pub steam_id: String,
}

pub fn most_recent_account(content: &str) -> Option<SteamAccount> {
    let mut current_id: Option<String> = None;
    let mut current_name: Option<String> = None;
    let mut most_recent = false;
    let mut auto_login = false;
    let mut timestamp = 0u64;
    let mut best: Option<RankedAccount> = None;
    for line in content.lines().take(20_000) {
        let line = line.trim();
        if let Some(id) = quoted_steam_id(line) {
            best = prefer(
                best,
                current_id,
                current_name,
                most_recent,
                auto_login,
                timestamp,
            );
            current_id = Some(id);
            current_name = None;
            most_recent = false;
            auto_login = false;
            timestamp = 0;
            continue;
        }
        if let Some(name) = quoted_field(line, "AccountName") {
            if valid_account_name(&name) {
                current_name = Some(name);
            }
            continue;
        }
        if quoted_field(line, "MostRecent").as_deref() == Some("1") {
            most_recent = true;
        }
        if quoted_field(line, "AutoLogin").as_deref() == Some("1") {
            auto_login = true;
        }
        if let Some(value) = quoted_field(line, "timestamp") {
            timestamp = value.parse().unwrap_or(0);
        }
    }
    prefer(
        best,
        current_id,
        current_name,
        most_recent,
        auto_login,
        timestamp,
    )
    .map(|ranked| ranked.account)
}

struct RankedAccount {
    rank: u8,
    timestamp: u64,
    account: SteamAccount,
}

fn prefer(
    best: Option<RankedAccount>,
    steam_id: Option<String>,
    name: Option<String>,
    most_recent: bool,
    auto_login: bool,
    timestamp: u64,
) -> Option<RankedAccount> {
    let (Some(steam_id), Some(name)) = (steam_id, name) else {
        return best;
    };
    let rank = if most_recent {
        2
    } else if auto_login {
        1
    } else {
        0
    };
    let candidate = RankedAccount {
        rank,
        timestamp,
        account: SteamAccount { name, steam_id },
    };
    Some(match best {
        Some(current)
            if (current.rank, current.timestamp) >= (candidate.rank, candidate.timestamp) =>
        {
            current
        }
        _ => candidate,
    })
}

pub fn valid_account_name(name: &str) -> bool {
    let mut chars = name.chars();
    let count = chars.clone().count();
    (2..=32).contains(&count) && chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// Steam userdata folders use the 32-bit account id, not the 64-bit id.
pub fn userdata_account_id(steam_id: &str) -> Option<String> {
    let id: u64 = steam_id.parse().ok()?;
    Some(id.checked_sub(STEAM_ID_OFFSET)?.to_string())
}

/// True when the latest connection state is `[Logged On` with a real SteamID.
/// `[Logged Off] [U:1:280673132]` is still signed out — a leftover ID is not ready.
pub fn connection_logged_on(log: &str) -> bool {
    match latest_connection_state(log) {
        Some(ConnectionState::LoggedOn(id)) => id != "0" && id.chars().all(|c| c.is_ascii_digit()),
        _ => false,
    }
}

fn latest_connection_state(log: &str) -> Option<ConnectionState> {
    let mut last = None;
    for line in log.lines() {
        if let Some(state) = connection_state_in(line) {
            last = Some(state);
        }
    }
    last
}

enum ConnectionState {
    LoggedOn(String),
    Connecting,
    LoggedOff,
}

fn connection_state_in(line: &str) -> Option<ConnectionState> {
    let id = account_id_in(line).unwrap_or("0");
    if line.contains("[Logged Off") {
        Some(ConnectionState::LoggedOff)
    } else if line.contains("[Logged On") {
        Some(ConnectionState::LoggedOn(id.to_string()))
    } else if line.contains("[Logging On") || line.contains("[Connecting") {
        Some(ConnectionState::Connecting)
    } else {
        None
    }
}

fn account_id_in(line: &str) -> Option<&str> {
    let start = line.find("[U:1:")? + 5;
    let body = line.get(start..)?;
    let end = body.find(']')?;
    body.get(..end)
}

/// App IDs inside the `apptickets` block only. Ticket blobs are ignored.
pub fn owned_app_ids(content: &str) -> Vec<String> {
    block_app_ids(content, "\"apptickets\"")
}

/// Digit keys from every `apps` block. Playtime records fill gaps when tickets
/// are incomplete; values inside those blocks are ignored.
pub fn library_app_ids(content: &str) -> Vec<String> {
    block_app_ids(content, "\"apps\"")
}

pub fn local_library_ids(content: &str) -> Vec<String> {
    let mut ids = owned_app_ids(content);
    ids.extend(library_app_ids(content));
    ids.sort();
    ids.dedup();
    ids
}

fn block_app_ids(content: &str, marker: &str) -> Vec<String> {
    let mut ids = Vec::new();
    let mut search = 0;
    while ids.len() < 2_000 {
        let Some(rel) = content[search..].find(marker) else {
            break;
        };
        let start = search + rel;
        collect_block_ids(content, start, &mut ids);
        search = start + marker.len();
    }
    ids.sort();
    ids.dedup();
    ids
}

fn collect_block_ids(content: &str, start: usize, ids: &mut Vec<String>) {
    let mut depth = 0;
    let mut seen_brace = false;
    let bytes = content[start..].as_bytes();
    let mut index = 0;
    while index < bytes.len() && ids.len() < 2_000 {
        let byte = bytes[index];
        if byte == b'{' {
            depth += 1;
            seen_brace = true;
            index += 1;
            continue;
        }
        if byte == b'}' {
            if depth == 0 {
                break;
            }
            depth -= 1;
            if seen_brace && depth == 0 {
                break;
            }
            index += 1;
            continue;
        }
        if seen_brace && depth == 1 && byte == b'"' {
            let end = content[start + index + 1..]
                .find('"')
                .map(|offset| start + index + 1 + offset);
            if let Some(end) = end {
                let key = &content[start + index + 1..end];
                if !key.is_empty()
                    && key.chars().all(|c| c.is_ascii_digit())
                    && key.len() <= 10
                    && key != "0"
                    && key != "228980"
                {
                    ids.push(key.to_string());
                }
                index = end - start + 1;
                continue;
            }
        }
        index += 1;
    }
}

fn quoted_steam_id(line: &str) -> Option<String> {
    let rest = line.trim().strip_prefix('"')?;
    let end = rest.find('"')?;
    let id = &rest[..end];
    if id.len() == 17 && id.chars().all(|c| c.is_ascii_digit()) {
        Some(id.to_string())
    } else {
        None
    }
}

/// Flip AutoLogin and MostRecent so a later silent Steam start can reuse the session.
pub fn enable_auto_login(content: &str) -> Option<String> {
    if content.len() > 8 * 1024 * 1024 {
        return None;
    }
    let has_auto = content
        .lines()
        .any(|line| quoted_field(line.trim(), "AutoLogin").is_some());
    let auto_on = content
        .lines()
        .any(|line| quoted_field(line.trim(), "AutoLogin").as_deref() == Some("1"));
    let has_recent = content
        .lines()
        .any(|line| quoted_field(line.trim(), "MostRecent").is_some());
    let recent_on = content
        .lines()
        .any(|line| quoted_field(line.trim(), "MostRecent").as_deref() == Some("1"));
    if has_auto && auto_on && has_recent && recent_on {
        return None;
    }
    let mut out = String::with_capacity(content.len() + 64);
    let mut inserted = false;
    for line in content.lines() {
        if quoted_field(line.trim(), "AutoLogin").is_some() {
            out.push_str(&leading_ws(line));
            out.push_str("\"AutoLogin\"\t\t\"1\"");
        } else if quoted_field(line.trim(), "MostRecent").is_some() {
            out.push_str(&leading_ws(line));
            out.push_str("\"MostRecent\"\t\t\"1\"");
        } else {
            out.push_str(line);
        }
        out.push('\n');
        if !inserted && quoted_field(line.trim(), "AccountName").is_some() {
            if !has_auto {
                out.push_str(&leading_ws(line));
                out.push_str("\"AutoLogin\"\t\t\"1\"\n");
            }
            if !has_recent {
                out.push_str(&leading_ws(line));
                out.push_str("\"MostRecent\"\t\t\"1\"\n");
            }
            inserted = true;
        }
    }
    Some(out)
}

/// True when Steam has written the files a later silent start needs to log on.
/// Values inside `config.vdf` are never returned.
pub fn saved_client_session(steam_root: &Path) -> bool {
    has_ssfn(steam_root) || has_connect_cache_key(&steam_root.join("config/config.vdf"))
}

fn has_ssfn(steam_root: &Path) -> bool {
    let Ok(entries) = fs::read_dir(steam_root) else {
        return false;
    };
    entries.flatten().take(256).any(|entry| {
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            return false;
        };
        name.starts_with("ssfn")
            && name.len() <= 64
            && name.chars().all(|c| c.is_ascii_alphanumeric())
            && entry
                .file_type()
                .is_ok_and(|kind| kind.is_file() && !kind.is_symlink())
    })
}

fn has_connect_cache_key(path: &Path) -> bool {
    const LIMIT: u64 = 8 * 1024 * 1024;
    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };
    if metadata.len() > LIMIT || metadata.file_type().is_symlink() {
        return false;
    }
    let mut content = String::new();
    let Ok(file) = fs::File::open(path) else {
        return false;
    };
    if file.take(LIMIT + 1).read_to_string(&mut content).is_err() || content.len() as u64 > LIMIT {
        return false;
    }
    content.contains("\"ConnectCache\"")
}

pub fn enable_saved_login(loginusers: &Path) {
    const LIMIT: u64 = 8 * 1024 * 1024;
    let Ok(metadata) = fs::metadata(loginusers) else {
        return;
    };
    if metadata.len() > LIMIT {
        return;
    }
    let mut content = String::new();
    let Ok(file) = fs::File::open(loginusers) else {
        return;
    };
    if file.take(LIMIT + 1).read_to_string(&mut content).is_err() || content.len() as u64 > LIMIT {
        return;
    }
    let Some(updated) = enable_auto_login(&content) else {
        return;
    };
    let pending = loginusers.with_extension("orbit-autologin");
    if pending
        .symlink_metadata()
        .is_ok_and(|meta| meta.file_type().is_symlink())
    {
        return;
    }
    let _ = fs::write(&pending, updated).and_then(|_| fs::rename(&pending, loginusers));
}

fn leading_ws(line: &str) -> String {
    line.chars().take_while(|c| c.is_whitespace()).collect()
}

fn quoted_field(line: &str, key: &str) -> Option<String> {
    let marker = format!("\"{key}\"");
    let rest = line.trim().strip_prefix(&marker)?.trim_start();
    let value = rest.strip_prefix('"')?.strip_suffix('"')?;
    if value.contains('\n') || value.contains('\0') {
        None
    } else {
        Some(value.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    const LOGIN: &str = r#"
"users"
{
	"76561197960265729"
	{
		"AccountName"		"orbit_player"
		"PersonaName"		"Ignored"
		"MostRecent"		"1"
		"Timestamp"		"1"
	}
	"76561197960265730"
	{
		"AccountName"		"other"
		"MostRecent"		"0"
	}
}
"#;

    #[test]
    fn reads_the_most_recent_account_and_drops_the_persona() {
        let account = most_recent_account(LOGIN).unwrap();
        assert_eq!(account.name, "orbit_player");
        assert_eq!(account.steam_id, "76561197960265729");
        assert_eq!(userdata_account_id(&account.steam_id).as_deref(), Some("1"));
        let rendered = format!("{account:?}");
        assert!(!rendered.contains("Ignored"));
    }

    #[test]
    fn rejects_an_account_name_with_no_steam_id() {
        assert!(most_recent_account("\"AccountName\" \"orbit_player\"").is_none());
    }

    #[test]
    fn connection_log_needs_a_nonzero_account() {
        assert!(!connection_logged_on(
            "[Connecting, 0, 7] [U:1:0] Connect() starting connection\n"
        ));
        assert!(connection_logged_on(
            "[Logged On, 4, 7] [U:1:280673132] RecvMsgClientLogOnResponse() : processing complete\n"
        ));
        assert!(!connection_logged_on(
            "[Logged On, 4, 7] [U:1:280673132] RecvMsgClientLogOnResponse() : processing complete\n[Connecting, 0, 7] [U:1:0] Connect() starting connection\n"
        ));
    }

    #[test]
    fn logged_off_with_a_real_steamid_is_not_ready() {
        assert!(!connection_logged_on(
            "[2026-11-15 21:31:57] [Logged Off, 0, 0] [U:1:280673132] CSteamEngine::CheckForBackupOrRestore() scheduling LogOn()\n"
        ));
        assert!(!connection_logged_on(
            "[Logged On, 4, 7] [U:1:280673132] RecvMsgClientLogOnResponse() : processing complete\n[Logged Off, 0, 0] [U:1:280673132] LogOff()\n"
        ));
        assert!(!connection_logged_on(
            "[Logging On, 4, 7] [U:1:280673132] LogOn()\n"
        ));
    }

    #[test]
    fn reads_an_auto_login_account_when_most_recent_is_absent() {
        let content = r#"
"users"
{
	"76561197960265729"
	{
		"AccountName"		"orbit_player"
		"PersonaName"		"Ignored"
		"AutoLogin"		"1"
		"timestamp"		"10"
	}
}
"#;
        let account = most_recent_account(content).unwrap();
        assert_eq!(account.name, "orbit_player");
        assert!(!format!("{account:?}").contains("Ignored"));
    }

    #[test]
    fn owned_ids_come_only_from_apptickets() {
        let content = r#"
"apps"
{
	"999" { "Playtime" "10" }
}
"apptickets"
{
	"570"		"SECRET-TICKET"
	"10"		"ALSO-SECRET"
	"570"		"SECRET-TICKET"
}
"depots"
{
	"12345678901" "nope"
}
"#;
        assert_eq!(owned_app_ids(content), vec!["10".to_string(), "570".into()]);
        let joined = owned_app_ids(content).join(",");
        assert!(!joined.contains("SECRET"));
        assert!(!joined.contains("12345678901"));
        let local = local_library_ids(content);
        assert!(local.contains(&"10".into()));
        assert!(local.contains(&"999".into()));
        assert!(!local.iter().any(|id| id == "228980"));
    }

    #[test]
    fn enables_auto_login_without_touching_the_account_name() {
        let off = r#"
"users"
{
	"76561197960265729"
	{
		"AccountName"		"orbit_player"
		"RememberPassword"		"1"
		"AutoLogin"		"0"
	}
}
"#;
        let enabled = enable_auto_login(off).unwrap();
        assert!(enabled.contains("\"AutoLogin\"\t\t\"1\""));
        assert!(enabled.contains("\"MostRecent\"\t\t\"1\""));
        assert!(!enabled.contains("\"AutoLogin\"\t\t\"0\""));
        assert!(enabled.contains("orbit_player"));
        assert!(enable_auto_login(&enabled).is_none());
        let missing = r#"
"users"
{
	"76561197960265729"
	{
		"AccountName"		"orbit_player"
		"RememberPassword"		"1"
	}
}
"#;
        let inserted = enable_auto_login(missing).unwrap();
        assert!(inserted.contains("\"AutoLogin\"\t\t\"1\""));
        assert!(inserted.contains("\"MostRecent\"\t\t\"1\""));
        assert!(inserted.contains("orbit_player"));
    }

    #[test]
    fn saved_session_is_ssfn_or_connect_cache_without_reading_secrets() {
        let root = std::env::temp_dir().join(format!("orbit-ssfn-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("config")).unwrap();
        assert!(!saved_client_session(&root));
        fs::write(root.join("ssfn1234567890"), b"sentry").unwrap();
        assert!(saved_client_session(&root));
        fs::remove_file(root.join("ssfn1234567890")).unwrap();
        fs::write(
            root.join("config/config.vdf"),
            "\"InstallConfigStore\"\n{\n\t\"Software\"\n\t{\n\t\t\"Valve\"\n\t\t{\n\t\t\t\"Steam\"\n\t\t\t{\n\t\t\t\t\"ConnectCache\"\n\t\t\t\t{\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n}\n",
        )
        .unwrap();
        assert!(saved_client_session(&root));
        let _ = fs::remove_dir_all(root);
    }
}
