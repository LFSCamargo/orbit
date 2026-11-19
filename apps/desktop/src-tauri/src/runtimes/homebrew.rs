//! Homebrew integration for components whose upstream requires Apple's license
//! flow (Game Porting Toolkit). Orbit never redistributes Apple packages; it
//! invokes the user's existing Homebrew installation to fetch Apple's official
//! formula and then registers the resulting Wine build and D3DMetal payload.
use super::components::{self, InstalledComponent};
use super::detection::probe;
use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::atomic::AtomicBool,
    time::Duration,
};

const HOMEBREW_APPLE_TAP: &str = "apple/apple";

/// A GPTK formula available through a Homebrew tap.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GptkFormula {
    pub tap: String,
    pub name: String,
    pub version: String,
    pub full_name: String,
}

fn brew_executable() -> Option<PathBuf> {
    for candidate in [
        "/opt/homebrew/bin/brew",
        "/usr/local/bin/brew",
        "/opt/homebrew/opt/homebrew/bin/brew",
    ] {
        let path = PathBuf::from(candidate);
        if path.is_file() {
            return Some(path);
        }
    }
    std::env::var_os("PATH").and_then(|path| {
        std::env::split_paths(&path)
            .map(|dir| dir.join("brew"))
            .find(|p| p.is_file())
    })
}

pub fn available() -> bool {
    brew_executable().is_some()
}

fn run_brew(args: &[&str], timeout: Duration) -> Result<String> {
    let brew = brew_executable().context("Homebrew is not installed")?;
    let cancel = AtomicBool::new(false);
    let mut child = Command::new(&brew)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .with_context(|| format!("Cannot start Homebrew: {}", brew.display()))?;

    let status = super::process::wait_bounded(&mut child, timeout, &cancel)
        .context("Homebrew command timed out or was cancelled")?;

    let mut stdout = String::new();
    if let Some(mut pipe) = child.stdout {
        let _ = std::io::Read::read_to_string(&mut pipe, &mut stdout);
    }
    let mut stderr = String::new();
    if let Some(mut pipe) = child.stderr {
        let _ = std::io::Read::read_to_string(&mut pipe, &mut stderr);
    }

    if !status.success() {
        bail!("Homebrew failed: {stderr}")
    }
    Ok(stdout)
}

fn tap_exists(tap: &str) -> Result<bool> {
    let output = run_brew(&["tap"], Duration::from_secs(30))?;
    Ok(output.lines().any(|line| line.trim() == tap))
}

fn ensure_tap(tap: &str) -> Result<()> {
    if !tap_exists(tap)? {
        run_brew(&["tap", tap], Duration::from_secs(120))?;
    }
    Ok(())
}

fn formula_installed(full_name: &str) -> bool {
    let name = full_name.split('/').last().unwrap_or(full_name);
    run_brew(&["list", "--formula", name], Duration::from_secs(30))
        .map(|output| output.lines().any(|line| line.trim() == name))
        .unwrap_or(false)
}

#[derive(Debug, Deserialize)]
struct BrewInfo {
    name: String,
    #[serde(rename = "full_name")]
    full_name: String,
    #[serde(default)]
    versions: BrewVersions,
    #[serde(default)]
    tap: String,
}

#[derive(Debug, Deserialize, Default)]
struct BrewVersions {
    #[serde(default)]
    stable: Option<String>,
}

/// List known GPTK Homebrew formulae, querying `brew info` for exact versions
/// when Homebrew is present.
pub fn gptk_formulae() -> Vec<GptkFormula> {
    let mut formulae = Vec::new();
    if !cfg!(target_os = "macos") || !available() {
        return formulae;
    }

    for full_name in ["apple/apple/game-porting-toolkit"] {
        if let Ok(info) = query_formula_info(full_name) {
            formulae.push(GptkFormula {
                tap: info.tap,
                name: info.name,
                version: info.versions.stable.unwrap_or_else(|| "unknown".into()),
                full_name: info.full_name,
            });
        } else {
            // Fallback label when brew is unavailable or the formula is not yet tapped.
            let name = full_name.split('/').last().unwrap_or(full_name).to_string();
            formulae.push(GptkFormula {
                tap: HOMEBREW_APPLE_TAP.into(),
                name: name.clone(),
                version: "Apple official".into(),
                full_name: full_name.into(),
            });
        }
    }
    formulae
}

fn query_formula_info(full_name: &str) -> Result<BrewInfo> {
    let output = run_brew(
        &["info", "--json=v2", "--formula", full_name],
        Duration::from_secs(30),
    )?;
    #[derive(Debug, Deserialize)]
    struct InfoResponse {
        formulae: Vec<BrewInfo>,
    }
    let parsed: InfoResponse = serde_json::from_str(&output)
        .with_context(|| format!("Cannot parse brew info for {full_name}"))?;
    parsed
        .formulae
        .into_iter()
        .next()
        .context("brew info returned no formulae")
}

/// Locate the GPTK payload. The Homebrew formula installs a patched Wine build
/// under `Cellar/game-porting-toolkit/<version>`. The D3DMetal libraries are
/// usually inside `lib/external` or directly under `lib`.
fn find_gptk_payload(name: &str) -> Option<PathBuf> {
    let prefixes = [
        PathBuf::from(format!("/opt/homebrew/Cellar/{name}")),
        PathBuf::from(format!("/usr/local/Cellar/{name}")),
    ];
    for prefix in prefixes {
        if !prefix.is_dir() {
            continue;
        }
        let Ok(entries) = std::fs::read_dir(&prefix) else {
            continue;
        };
        for entry in entries.flatten() {
            let version_dir = entry.path();
            for candidate in [
                version_dir.join("lib/external"),
                version_dir.join("lib"),
                version_dir,
            ] {
                if candidate.join("libD3DMetal.dylib").is_file()
                    || candidate.join("d3dmetal.dll").is_file()
                    || candidate.join("wine64").is_file()
                {
                    return Some(candidate);
                }
            }
        }
    }
    None
}

/// Locate the Wine executable installed by the GPTK formula.
fn find_gptk_wine(name: &str) -> Option<PathBuf> {
    let prefixes = [
        PathBuf::from(format!("/opt/homebrew/Cellar/{name}")),
        PathBuf::from(format!("/usr/local/Cellar/{name}")),
    ];
    for prefix in prefixes {
        if !prefix.is_dir() {
            continue;
        }
        let Ok(entries) = std::fs::read_dir(&prefix) else {
            continue;
        };
        for entry in entries.flatten() {
            let wine = entry.path().join("bin/wine64");
            if wine.is_file() {
                return Some(wine);
            }
            let wine32 = entry.path().join("bin/wine");
            if wine32.is_file() {
                return Some(wine32);
            }
        }
    }
    None
}

/// Install a specific Game Porting Toolkit formula via Homebrew and register
/// the resulting payload as a managed component.
pub fn install_gptk<F>(
    root: &Path,
    formula: &GptkFormula,
    mut progress: F,
) -> Result<InstalledComponent>
where
    F: FnMut(&str),
{
    if !cfg!(target_os = "macos") {
        bail!("Game Porting Toolkit is only available on macOS");
    }
    progress("Checking Homebrew…");
    ensure_tap(&formula.tap)?;

    progress(&format!("Installing {}…", formula.full_name));
    run_brew(
        &["install", "--formula", &formula.full_name],
        Duration::from_secs(900),
    )
    .context("Game Porting Toolkit installation failed")?;

    progress("Registering payload…");
    let name = formula.name.as_str();
    let payload = find_gptk_payload(name)
        .context("Game Porting Toolkit was installed but its payload could not be located")?;

    // The formula also provides a Wine build; register it as the managed Wine
    // runtime so the user does not need a separate Wine installation.
    if let Some(wine) = find_gptk_wine(name) {
        let _ = probe(&wine);
    }

    components::register(
        root,
        "gptk".into(),
        format!("{} {}", formula.full_name, formula.version),
        payload,
    )
}

pub fn detect_gptk() -> Option<InstalledComponent> {
    if !cfg!(target_os = "macos") {
        return None;
    }
    for formula in gptk_formulae() {
        if let Some(payload) = find_gptk_payload(&formula.name) {
            return Some(InstalledComponent {
                id: "gptk".into(),
                version: format!("{} {}", formula.full_name, formula.version),
                kind: super::components::ComponentKind::Gptk,
                path: payload.to_string_lossy().into_owned(),
                installed_at: chrono::Utc::now().to_rfc3339(),
            });
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn brew_detection_is_non_fatal_on_non_macos() {
        if cfg!(target_os = "macos") {
            return;
        }
        assert!(!available());
        let formula = GptkFormula {
            tap: HOMEBREW_APPLE_TAP.into(),
            name: "game-porting-toolkit".into(),
            version: "test".into(),
            full_name: "apple/apple/game-porting-toolkit".into(),
        };
        assert!(install_gptk(Path::new("/tmp"), &formula, |_| {}).is_err());
    }
}
