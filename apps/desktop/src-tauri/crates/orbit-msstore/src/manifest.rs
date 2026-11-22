//! Bounded parser for GDK `MicrosoftGame.config` manifests.
//!
//! Enforces a strict 256 KiB byte limit and validates every declared executable path
//! as a clean relative Windows/POSIX path (no `..`, no drive letters, no leading slash,
//! no control characters).

use std::fs::File;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

use quick_xml::events::Event;
use quick_xml::Reader;
use serde::{Deserialize, Serialize};

use crate::{MsStoreError, Result};

/// Maximum size accepted for `MicrosoftGame.config` (256 KiB).
pub const MAX_MANIFEST_BYTES: usize = 256 * 1024;
const MAX_EXECUTABLES: usize = 32;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameExecutable {
    pub id: Option<String>,
    /// Validated relative path using `/` separators (e.g. `Binaries/Win64/Game.exe`).
    pub relative_path: String,
    pub target_device_family: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MicrosoftGameConfig {
    pub identity_name: Option<String>,
    pub publisher: Option<String>,
    pub version: Option<String>,
    pub display_name: Option<String>,
    pub title_id: Option<String>,
    pub msa_app_id: Option<String>,
    pub store_id: Option<String>,
    pub executables: Vec<GameExecutable>,
}

impl MicrosoftGameConfig {
    /// Reads and parses `MicrosoftGame.config` from disk with a strict 256 KiB cap.
    pub fn from_file(path: &Path) -> Result<Self> {
        let file = File::open(path)?;
        let mut bytes = Vec::new();
        file.take(MAX_MANIFEST_BYTES as u64 + 1)
            .read_to_end(&mut bytes)?;
        if bytes.len() > MAX_MANIFEST_BYTES {
            return Err(MsStoreError::InvalidPath(
                "MicrosoftGame.config exceeds the 256 KiB limit".into(),
            ));
        }
        let xml = String::from_utf8(bytes)
            .map_err(|_| MsStoreError::Protocol("MicrosoftGame.config is not valid UTF-8".into()))?;
        Self::parse(&xml)
    }

    /// Parses XML bytes of `MicrosoftGame.config`. Complexity: O(xml.len()).
    pub fn parse(xml: &str) -> Result<Self> {
        if xml.len() > MAX_MANIFEST_BYTES {
            return Err(MsStoreError::InvalidPath(
                "MicrosoftGame.config exceeds the 256 KiB limit".into(),
            ));
        }
        let mut reader = Reader::from_str(xml);
        reader.config_mut().trim_text(true);
        let mut buf = Vec::new();

        let mut config = MicrosoftGameConfig {
            identity_name: None,
            publisher: None,
            version: None,
            display_name: None,
            title_id: None,
            msa_app_id: None,
            store_id: None,
            executables: Vec::new(),
        };

        let mut current_tag = String::new();
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Empty(ref e)) | Ok(Event::Start(ref e)) => {
                    let tag = std::str::from_utf8(e.name().as_ref())
                        .unwrap_or_default()
                        .to_string();
                    match tag.as_str() {
                        "Identity" => {
                            for attr in e.attributes().flatten() {
                                let k = std::str::from_utf8(attr.key.as_ref()).unwrap_or_default();
                                let v = attr.unescape_value().ok().map(|s| s.trim().to_string());
                                match (k, v) {
                                    ("Name", Some(v)) if !v.is_empty() => config.identity_name = Some(v),
                                    ("Publisher", Some(v)) if !v.is_empty() => config.publisher = Some(v),
                                    ("Version", Some(v)) if !v.is_empty() => config.version = Some(v),
                                    _ => {}
                                }
                            }
                        }
                        "ShellVisuals" => {
                            for attr in e.attributes().flatten() {
                                let k = std::str::from_utf8(attr.key.as_ref()).unwrap_or_default();
                                if k == "DefaultDisplayName" {
                                    if let Ok(v) = attr.unescape_value() {
                                        let trimmed = v.trim();
                                        if !trimmed.is_empty() {
                                            config.display_name = Some(trimmed.to_string());
                                        }
                                    }
                                }
                            }
                        }
                        "Executable" if config.executables.len() < MAX_EXECUTABLES => {
                            let mut id = None;
                            let mut name = None;
                            let mut family = None;
                            for attr in e.attributes().flatten() {
                                let k = std::str::from_utf8(attr.key.as_ref()).unwrap_or_default();
                                let v = attr.unescape_value().ok().map(|s| s.trim().to_string());
                                match (k, v) {
                                    ("Id", Some(v)) if !v.is_empty() => id = Some(v),
                                    ("Name", Some(v)) if !v.is_empty() => name = Some(v),
                                    ("TargetDeviceFamily", Some(v)) if !v.is_empty() => family = Some(v),
                                    _ => {}
                                }
                            }
                            if let Some(raw_name) = name {
                                let clean = sanitize_relative_path(&raw_name)?;
                                config.executables.push(GameExecutable {
                                    id,
                                    relative_path: clean,
                                    target_device_family: family,
                                });
                            }
                        }
                        _ => {}
                    }
                    current_tag = tag;
                }
                Ok(Event::Text(e)) => {
                    if let Ok(text) = e.unescape() {
                        let trimmed = text.trim();
                        if !trimmed.is_empty() {
                            match current_tag.as_str() {
                                "TitleId" if config.title_id.is_none() => {
                                    config.title_id = Some(trimmed.to_string());
                                }
                                "MSAAppId" if config.msa_app_id.is_none() => {
                                    config.msa_app_id = Some(trimmed.to_string());
                                }
                                "StoreId" if config.store_id.is_none() => {
                                    config.store_id = Some(trimmed.to_ascii_uppercase());
                                }
                                _ => {}
                            }
                        }
                    }
                }
                Ok(Event::End(_)) => current_tag.clear(),
                Ok(Event::Eof) => break,
                Err(err) => {
                    return Err(MsStoreError::Protocol(format!(
                        "Malformed MicrosoftGame.config XML: {err}"
                    )))
                }
                _ => {}
            }
            buf.clear();
        }

        Ok(config)
    }

    /// Selects the primary PC Windows executable from `ExecutableList`, preferring
    /// entries targeting `PC` (or untargeted `.exe` entries).
    pub fn primary_executable(&self) -> Option<&GameExecutable> {
        self.executables
            .iter()
            .find(|exe| {
                exe.target_device_family
                    .as_deref()
                    .is_some_and(|fam| fam.eq_ignore_ascii_case("PC"))
                    && exe.relative_path.to_ascii_lowercase().ends_with(".exe")
            })
            .or_else(|| {
                self.executables
                    .iter()
                    .find(|exe| exe.relative_path.to_ascii_lowercase().ends_with(".exe"))
            })
            .or_else(|| self.executables.first())
    }
}

/// Validates and normalizes an archive or manifest relative path.
/// Rejects `..`, leading `/` or `\`, drive letters (`C:`), NUL / control bytes, and empty paths.
pub fn sanitize_relative_path(raw: &str) -> Result<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.len() > 1024 || trimmed.chars().any(char::is_control) {
        return Err(MsStoreError::InvalidPath(format!(
            "Empty or control-character path: {raw:?}"
        )));
    }
    if trimmed.starts_with('/') || trimmed.starts_with('\\') {
        return Err(MsStoreError::InvalidPath(format!(
            "Absolute path not permitted: {raw}"
        )));
    }
    let normalized = trimmed.replace('\\', "/");
    if normalized.as_bytes().get(1) == Some(&b':') {
        return Err(MsStoreError::InvalidPath(format!(
            "Drive prefix not permitted: {raw}"
        )));
    }
    let mut parts = Vec::new();
    for component in Path::new(&normalized).components() {
        match component {
            Component::Normal(segment) => {
                let s = segment
                    .to_str()
                    .ok_or_else(|| MsStoreError::InvalidPath("Non-UTF-8 path segment".into()))?;
                if s.is_empty() || s == "." || s == ".." {
                    return Err(MsStoreError::InvalidPath(format!(
                        "Unsafe path segment: {raw}"
                    )));
                }
                parts.push(s);
            }
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(MsStoreError::InvalidPath(format!(
                    "Path traversal rejected: {raw}"
                )));
            }
        }
    }
    if parts.is_empty() {
        return Err(MsStoreError::InvalidPath("Empty relative path".into()));
    }
    Ok(parts.join("/"))
}

/// Resolves a sanitized relative path strictly inside `install_root`, rejecting any
/// existing symlink component along the path.
pub fn safe_join_under(install_root: &Path, relative: &str) -> Result<PathBuf> {
    let clean = sanitize_relative_path(relative)?;
    let mut current = install_root.to_path_buf();
    for segment in clean.split('/') {
        current.push(segment);
        if current
            .symlink_metadata()
            .is_ok_and(|meta| meta.file_type().is_symlink())
        {
            return Err(MsStoreError::InvalidPath(format!(
                "Refusing to traverse symlink at {}",
                current.display()
            )));
        }
    }
    Ok(current)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_microsoft_game_config_and_prefers_pc_exe() {
        let xml = r#"<?xml version="1.0" encoding="utf-8"?>
        <Game configVersion="1">
          <Identity Name="Contoso.SampleGame" Publisher="CN=Contoso" Version="1.2.3.0" />
          <TitleId>12345678</TitleId>
          <MSAAppId>0000000044112233</MSAAppId>
          <StoreId>9P8LR42PTRGJ</StoreId>
          <ShellVisuals DefaultDisplayName="Sample Game" />
          <ExecutableList>
            <Executable Name="Console\GameXbox.exe" Id="Xbox" TargetDeviceFamily="Xbox" />
            <Executable Name="Binaries\Win64\GamePC.exe" Id="PC" TargetDeviceFamily="PC" />
          </ExecutableList>
        </Game>"#;

        let config = MicrosoftGameConfig::parse(xml).unwrap();
        assert_eq!(config.identity_name.as_deref(), Some("Contoso.SampleGame"));
        assert_eq!(config.display_name.as_deref(), Some("Sample Game"));
        assert_eq!(config.title_id.as_deref(), Some("12345678"));
        assert_eq!(config.msa_app_id.as_deref(), Some("0000000044112233"));
        assert_eq!(config.store_id.as_deref(), Some("9P8LR42PTRGJ"));
        assert_eq!(config.executables.len(), 2);
        assert_eq!(
            config.primary_executable().unwrap().relative_path,
            "Binaries/Win64/GamePC.exe"
        );
    }

    #[test]
    fn rejects_traversal_absolute_drive_and_oversized_manifests() {
        assert!(sanitize_relative_path("../evil.exe").is_err());
        assert!(sanitize_relative_path("a\\..\\evil.exe").is_err());
        assert!(sanitize_relative_path("/etc/passwd").is_err());
        assert!(sanitize_relative_path("C:\\Windows\\cmd.exe").is_err());
        assert!(sanitize_relative_path("bad\0name.exe").is_err());
        assert_eq!(
            sanitize_relative_path("Bin\\Game.exe").unwrap(),
            "Bin/Game.exe"
        );

        let oversized = "x".repeat(MAX_MANIFEST_BYTES + 1);
        assert!(MicrosoftGameConfig::parse(&oversized).is_err());
    }
}
