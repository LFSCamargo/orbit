//! Read a Steam account name and owned app IDs from local Valve files.
//! Token values and passwords are never returned.

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

/// App IDs inside the `apptickets` block only. Ticket blobs are ignored.
pub fn owned_app_ids(content: &str) -> Vec<String> {
    let Some(start) = content.find("\"apptickets\"") else {
        return Vec::new();
    };
    let mut ids = Vec::new();
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
                if !key.is_empty() && key.chars().all(|c| c.is_ascii_digit()) && key.len() <= 10 {
                    ids.push(key.to_string());
                }
                index = end - start + 1;
                continue;
            }
        }
        index += 1;
    }
    ids.sort();
    ids.dedup();
    ids
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
    }
}
