//! Keeps Windows games from crashing at start, before and after it happens.
//!
//! Known games get their fix before every launch, the first one in a new
//! container included: Capcom's RE Engine titles crash in DirectX 12 under
//! D3DMetal (Devil May Cry 5: a null read inside the game), so their own ini
//! is set to DirectX 11, and Steam's overlay, which those games also trip on,
//! stays off. An RE Engine game (found by `re_chunk_000.pak`) that crashes
//! while starting gets DirectX 11 in its own ini on the next launch.
//!
//! The graphics layer is the person's choice and is never changed here: an
//! earlier ladder switched crashing games to DXVK, which broke GPTK setups.
use std::collections::HashMap;
use std::fs;
use std::path::Path;

use parking_lot::Mutex;
use serde_json::json;

use crate::database::GameRepository;
use crate::services::steam_download::valid_app_id;

struct KnownGame {
    app_id: &'static str,
    /// The RE Engine settings file to set to DirectX 11.
    directx11_ini: &'static str,
    /// Steam's overlay crashes this game.
    no_overlay: bool,
}

const KNOWN: [KnownGame; 3] = [
    KnownGame {
        app_id: "601150",
        directx11_ini: "dmc5config.ini",
        no_overlay: true,
    },
    KnownGame {
        app_id: "883710",
        directx11_ini: "re2_config.ini",
        no_overlay: true,
    },
    KnownGame {
        app_id: "952060",
        directx11_ini: "re3_config.ini",
        no_overlay: true,
    },
];

const FALLBACK_KEY: &str = "game-crash-fallbacks-v1";
/// Settings files are a few KB; anything larger is not one.
const CONFIG_LIMIT: u64 = 256 * 1024;
/// Entries read when looking for an RE Engine ini in a game folder.
const SCAN_LIMIT: usize = 256;
/// A non-zero exit sooner than this after start counts as a startup crash.
const STARTUP_SECONDS: i64 = 120;
/// Steam was not ready; Orbit already explains it and graphics are not at fault.
const STEAM_NOT_READY: i32 = 53;
/// Killed by a signal (`ExitStatus::code() == None`): Stop, or Wine torn down.
/// Not a crash the game made while starting.
const SIGNAL_TERMINATED: i32 = -1;

/// How far down the ladder a game is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Fallback {
    None = 0,
    DirectX11 = 1,
}

impl Fallback {
    fn from_step(step: u8) -> Self {
        match step {
            1 => Self::DirectX11,
            _ => Self::None,
        }
    }
}

static STEPS: Mutex<Option<HashMap<String, u8>>> = Mutex::new(None);

fn known(app_id: &str) -> Option<&'static KnownGame> {
    KNOWN.iter().find(|game| game.app_id == app_id)
}

/// Valid entries only. Step 2 (DXVK) from earlier builds is dropped so the
/// game launches with the person's graphics layer again; the bool says
/// whether anything was dropped. O(n), n ≤ 1024.
fn sanitize_steps(steps: HashMap<String, u8>) -> (HashMap<String, u8>, bool) {
    let before = steps.len();
    let kept: HashMap<String, u8> = steps
        .into_iter()
        .filter(|(app_id, step)| valid_app_id(app_id) && *step == Fallback::DirectX11 as u8)
        .take(1024)
        .collect();
    let dropped = kept.len() != before;
    (kept, dropped)
}

/// Loads the recorded fallbacks once at startup.
pub fn restore(repo: &GameRepository) {
    let steps: HashMap<String, u8> = repo
        .get_setting(FALLBACK_KEY)
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default();
    let (steps, dropped) = sanitize_steps(steps);
    if dropped {
        let _ = repo.set_setting(FALLBACK_KEY, &json!(steps));
    }
    *STEPS.lock() = Some(steps);
}

pub fn fallback(app_id: &str) -> Fallback {
    let step = STEPS
        .lock()
        .as_ref()
        .and_then(|steps| steps.get(app_id).copied())
        .unwrap_or(0);
    Fallback::from_step(step)
}

/// Steam's overlay for this game, given the person's preference.
pub fn overlay_allowed(app_id: &str, preferred: bool) -> bool {
    preferred && !known(app_id).is_some_and(|game| game.no_overlay)
}

pub fn is_startup_crash(exit_code: Option<i32>, duration_seconds: i64) -> bool {
    matches!(
        exit_code,
        Some(code) if code != 0 && code != SIGNAL_TERMINATED && code != STEAM_NOT_READY
    ) && duration_seconds < STARTUP_SECONDS
}

pub fn is_re_engine(install_dir: &Path) -> bool {
    install_dir.join("re_chunk_000.pak").is_file()
}

/// The next step after a startup crash, or None when there is nothing left
/// Orbit may change. Only RE Engine games have a step (their own ini).
pub fn next_fallback(current: Fallback, re_engine: bool) -> Option<Fallback> {
    match current {
        Fallback::None if re_engine => Some(Fallback::DirectX11),
        Fallback::None | Fallback::DirectX11 => None,
    }
}

/// Records a startup crash and returns what Orbit will change next launch.
pub fn record_startup_crash(
    repo: &GameRepository,
    app_id: &str,
    install_dir: Option<&Path>,
) -> Option<Fallback> {
    if !valid_app_id(app_id) {
        return None;
    }
    let re_engine = install_dir.is_some_and(is_re_engine);
    let next = next_fallback(fallback(app_id), re_engine)?;
    let mut guard = STEPS.lock();
    let steps = guard.get_or_insert_with(HashMap::new);
    steps.insert(app_id.to_string(), next as u8);
    let _ = repo.set_setting(FALLBACK_KEY, &json!(steps));
    Some(next)
}

/// The ini with `TargetPlatform` set to DirectX 11, or None when it already is.
pub fn with_directx11(text: &str) -> Option<String> {
    let mut found = false;
    let mut changed = false;
    let lines: Vec<String> = text
        .lines()
        .map(|line| match line.split_once('=') {
            Some((key, value)) if key.trim() == "TargetPlatform" => {
                found = true;
                if value.trim() == "DirectX11" {
                    line.to_string()
                } else {
                    changed = true;
                    "TargetPlatform=DirectX11".to_string()
                }
            }
            _ => line.to_string(),
        })
        .collect();
    if !found {
        let mut text = text.to_string();
        if !text.is_empty() && !text.ends_with('\n') {
            text.push('\n');
        }
        return Some(format!("{text}TargetPlatform=DirectX11\n"));
    }
    changed.then(|| lines.join("\n") + "\n")
}

fn read_config(path: &Path) -> Option<String> {
    let meta = fs::symlink_metadata(path).ok()?;
    if !meta.is_file() || meta.len() > CONFIG_LIMIT {
        return None;
    }
    fs::read_to_string(path).ok()
}

/// RE Engine inis the game already wrote: `*.ini` holding `TargetPlatform`.
/// One directory level, at most `SCAN_LIMIT` entries.
fn engine_configs(install_dir: &Path) -> Vec<std::path::PathBuf> {
    let Ok(entries) = fs::read_dir(install_dir) else {
        return Vec::new();
    };
    entries
        .take(SCAN_LIMIT)
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("ini"))
        })
        .filter(|path| read_config(path).is_some_and(|text| text.contains("TargetPlatform")))
        .collect()
}

fn set_directx11(path: &Path, create: bool) {
    let text = match read_config(path) {
        Some(text) => text,
        None if create && fs::symlink_metadata(path).is_err() => String::new(),
        None => return,
    };
    if let Some(updated) = with_directx11(&text) {
        if let Err(err) = fs::write(path, updated) {
            eprintln!(
                "[orbit] could not set DirectX 11 in {}: {err}",
                path.display()
            );
        }
    }
}

/// Applies this game's fixes in its install folder just before it starts.
/// Failures are logged, never fatal: the game starts with its own settings.
pub fn apply(app_id: &str, install_dir: &Path) {
    if let Some(game) = known(app_id) {
        // Created before the first run, so the game never starts in DX12.
        set_directx11(&install_dir.join(game.directx11_ini), true);
        return;
    }
    if fallback(app_id) >= Fallback::DirectX11 && is_re_engine(install_dir) {
        for path in engine_configs(install_dir) {
            set_directx11(&path, false);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn directx12_is_switched_to_directx11_and_the_rest_is_kept() {
        // Regression: Devil May Cry 5 crashed at start (page fault reading
        // 0x0 in devilmaycry5.exe) with TargetPlatform=DirectX12 on D3DMetal.
        let text = "Capability=DirectX12\nTargetPlatform=DirectX12\nWindowMode=FullScreen\n";
        let updated = with_directx11(text).expect("changed");
        assert!(updated.contains("TargetPlatform=DirectX11"));
        assert!(
            updated.contains("Capability=DirectX12"),
            "only the target changes"
        );
        assert!(updated.contains("WindowMode=FullScreen"));
        assert_eq!(with_directx11(&updated), None);
        assert_eq!(
            with_directx11("").as_deref(),
            Some("TargetPlatform=DirectX11\n")
        );
    }

    #[test]
    fn known_games_are_fixed_before_their_first_run() {
        let dir = std::env::temp_dir().join(format!("orbit-fix-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        apply("570", &dir);
        assert!(
            fs::read_dir(&dir).unwrap().next().is_none(),
            "other games untouched"
        );
        apply("883710", &dir);
        assert_eq!(
            fs::read_to_string(dir.join("re2_config.ini")).unwrap(),
            "TargetPlatform=DirectX11\n"
        );
        assert!(!overlay_allowed("601150", true));
        assert!(overlay_allowed("570", true));
        assert!(!overlay_allowed("570", false));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn a_startup_crash_steps_down_the_ladder() {
        assert!(is_startup_crash(Some(-1_073_741_819), 20));
        assert!(!is_startup_crash(Some(0), 20), "a clean quit");
        assert!(
            !is_startup_crash(Some(-1), 20),
            "a signal kill is not a game crash"
        );
        assert!(
            !is_startup_crash(Some(53), 5),
            "Steam not ready has its own message"
        );
        assert!(!is_startup_crash(Some(1), 3_600), "played for an hour");
        assert!(!is_startup_crash(None, 5));
        assert_eq!(
            next_fallback(Fallback::None, true),
            Some(Fallback::DirectX11)
        );
        assert_eq!(
            next_fallback(Fallback::None, false),
            None,
            "the graphics layer is never changed behind the person's back"
        );
        assert_eq!(next_fallback(Fallback::DirectX11, true), None);
    }

    #[test]
    fn an_unknown_re_engine_game_gets_directx11_after_a_crash() {
        let repo = GameRepository::open_in_memory().unwrap();
        let dir = std::env::temp_dir().join(format!("orbit-fix-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("re_chunk_000.pak"), b"pak").unwrap();
        fs::write(dir.join("game_config.ini"), "TargetPlatform=DirectX12\n").unwrap();
        fs::write(dir.join("other.ini"), "Volume=10\n").unwrap();
        apply("1196590", &dir);
        assert!(
            fs::read_to_string(dir.join("game_config.ini"))
                .unwrap()
                .contains("DirectX12"),
            "nothing changes before a crash"
        );
        assert_eq!(
            record_startup_crash(&repo, "1196590", Some(&dir)),
            Some(Fallback::DirectX11)
        );
        apply("1196590", &dir);
        assert!(fs::read_to_string(dir.join("game_config.ini"))
            .unwrap()
            .contains("DirectX11"));
        assert_eq!(
            fs::read_to_string(dir.join("other.ini")).unwrap(),
            "Volume=10\n"
        );
        assert_eq!(record_startup_crash(&repo, "1196590", Some(&dir)), None);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn restore_drops_legacy_dxvk_fallbacks() {
        let repo = GameRepository::open_in_memory().unwrap();
        repo.set_setting(
            FALLBACK_KEY,
            &json!({
                "1593500": 2,
                "1196590": 1
            }),
        )
        .unwrap();
        restore(&repo);
        assert_eq!(fallback("1593500"), Fallback::None);
        assert_eq!(fallback("1196590"), Fallback::DirectX11);
        let stored: HashMap<String, u8> =
            serde_json::from_value(repo.get_setting(FALLBACK_KEY).unwrap().unwrap()).unwrap();
        assert!(!stored.contains_key("1593500"));
        assert_eq!(stored.get("1196590"), Some(&1));
    }
}
