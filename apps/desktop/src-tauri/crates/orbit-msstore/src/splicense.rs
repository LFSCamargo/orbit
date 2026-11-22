//! `SPLicenseBlock` TLV decoder and RFC 3394 Content Integrity Key (CIK) unwrapper.
//!
//! Microsoft's licensing endpoints return binary `SPLicenseBlock` payloads encoded as
//! an 8-byte header followed by `(block_id: u32 LE, size: u32 LE, data: [u8; size])`
//! TLV records. All offsets and lengths are checked against the buffer bounds before
//! slicing so a malformed response cannot panic or over-allocate.

use aes_kw::KekAes128;
use rsa::RsaPrivateKey;
use uuid::Uuid;
use zeroize::Zeroizing;

use crate::clep::{unpack_clep_sign_state, unpack_encrypted_device_key};
use crate::{MsStoreError, Result};

/// Maximum TLV blocks parsed from a single `SPLicenseBlock`.
const MAX_TLV_BLOCKS: usize = 256;
/// Maximum packed content keys inside one `PackedContentKeys` block.
const MAX_CONTENT_KEYS: usize = 128;

pub const BLOCK_ENCRYPTED_DEVICE_KEY: u32 = 0x0001;
pub const BLOCK_DEVICE_LICENSE_DEVICE_ID: u32 = 0x0002;
pub const BLOCK_DEVICE_LICENSE_EXPIRATION: u32 = 0x001f;
pub const BLOCK_LICENSE_EXPIRATION: u32 = 0x0020;
pub const BLOCK_LICENSE_INFORMATION: u32 = 0x00c9;
pub const BLOCK_PACKED_CONTENT_KEYS: u32 = 0x00ca;
pub const BLOCK_LICENSE_ID: u32 = 0x00cb;
pub const BLOCK_SIGNATURE: u32 = 0x00cc;
pub const BLOCK_LICENSE_ENTRY_IDS: u32 = 0x00cd;
pub const BLOCK_PACKAGE_FULL_NAME: u32 = 0x00ce;
pub const BLOCK_HARDWARE_ID: u32 = 0x00d0;
pub const BLOCK_LICENSE_DEVICE_ID: u32 = 0x00d2;
pub const BLOCK_POLLING_TIME: u32 = 0x00d3;
pub const BLOCK_CLEP_SIGN_STATE: u32 = 0x012d;

/// One TLV entry from an `SPLicenseBlock`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TlvBlock {
    pub block_id: u32,
    pub data: Vec<u8>,
}

/// An AES-128 Key-Wrapped 32-byte Content Integrity Key (CIK) paired with its key UUID.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PackedContentKey {
    pub key_id: Uuid,
    pub wrapped_key: [u8; 40],
}

impl PackedContentKey {
    /// Unwraps the 40-byte RFC 3394 wrapped CIK using the 16-byte device key.
    pub fn unpack(&self, device_key: &[u8; 16]) -> Result<Zeroizing<[u8; 32]>> {
        let kek = KekAes128::from(*device_key);
        let mut out = Zeroizing::new([0u8; 32]);
        kek.unwrap(&self.wrapped_key, out.as_mut_slice())
            .map_err(|_| MsStoreError::Crypto("RFC 3394 CIK unwrap failed (wrong device key)".into()))?;
        Ok(out)
    }
}

/// Parsed fields of a Microsoft `SPLicenseBlock`.
#[derive(Debug, Clone)]
pub struct SpLicense {
    pub blocks: Vec<TlvBlock>,
    pub package_full_name: Option<String>,
    pub license_id: Option<Uuid>,
    pub device_id: Option<Uuid>,
    pub packed_content_keys: Vec<PackedContentKey>,
    pub encrypted_device_key_blob: Option<Vec<u8>>,
    pub clep_sign_state_blob: Option<Vec<u8>>,
}

impl SpLicense {
    /// Decodes a binary `SPLicenseBlock`. Complexity: O(bytes).
    pub fn parse(raw: &[u8]) -> Result<Self> {
        if raw.len() < 8 {
            return Err(MsStoreError::Protocol(
                "SPLicenseBlock shorter than 8-byte header".into(),
            ));
        }
        let data_offset = u32::from_le_bytes([raw[4], raw[5], raw[6], raw[7]]) as usize;
        // Standard SPLicenseBlock has a 4-byte version/magic + 4-byte header size (often 8)
        // or 4-byte payload offset; support both `data_offset == 0` (immediate TLVs after 8 bytes)
        // and explicit offset >= 8.
        let mut pos = if data_offset >= 8 && data_offset <= raw.len() {
            data_offset
        } else {
            8
        };

        let mut blocks = Vec::new();
        while pos + 8 <= raw.len() && blocks.len() < MAX_TLV_BLOCKS {
            let block_id = u32::from_le_bytes([raw[pos], raw[pos + 1], raw[pos + 2], raw[pos + 3]]);
            let size = u32::from_le_bytes([
                raw[pos + 4],
                raw[pos + 5],
                raw[pos + 6],
                raw[pos + 7],
            ]) as usize;
            pos += 8;
            let end = pos
                .checked_add(size)
                .ok_or_else(|| MsStoreError::Protocol("SPLicense TLV size overflow".into()))?;
            if end > raw.len() {
                return Err(MsStoreError::Protocol(format!(
                    "SPLicense TLV block 0x{block_id:x} truncated (needed {size} bytes, {} remain)",
                    raw.len() - pos
                )));
            }
            blocks.push(TlvBlock {
                block_id,
                data: raw[pos..end].to_vec(),
            });
            pos = end;
        }

        let mut package_full_name = None;
        let mut license_id = None;
        let mut device_id = None;
        let mut packed_content_keys = Vec::new();
        let mut encrypted_device_key_blob = None;
        let mut clep_sign_state_blob = None;

        for block in &blocks {
            match block.block_id {
                BLOCK_ENCRYPTED_DEVICE_KEY => {
                    encrypted_device_key_blob = Some(block.data.clone());
                }
                BLOCK_CLEP_SIGN_STATE => {
                    clep_sign_state_blob = Some(block.data.clone());
                }
                BLOCK_PACKAGE_FULL_NAME => {
                    package_full_name = decode_utf16le_trimmed(&block.data);
                }
                BLOCK_LICENSE_ID if block.data.len() >= 16 => {
                    license_id = Some(uuid_from_le_slice(&block.data[..16]));
                }
                BLOCK_DEVICE_LICENSE_DEVICE_ID | BLOCK_LICENSE_DEVICE_ID
                    if block.data.len() >= 16 =>
                {
                    device_id = Some(uuid_from_le_slice(&block.data[..16]));
                }
                BLOCK_PACKED_CONTENT_KEYS => {
                    packed_content_keys.extend(parse_packed_content_keys(&block.data)?);
                }
                _ => {}
            }
        }

        Ok(Self {
            blocks,
            package_full_name,
            license_id,
            device_id,
            packed_content_keys,
            encrypted_device_key_blob,
            clep_sign_state_blob,
        })
    }

    /// Unpacks the 16-byte device key if this is a device license (`block_id = 0x1`).
    pub fn device_key(&self) -> Result<Zeroizing<[u8; 16]>> {
        let blob = self
            .encrypted_device_key_blob
            .as_deref()
            .ok_or_else(|| MsStoreError::Protocol("Device license missing EncryptedDeviceKey".into()))?;
        unpack_encrypted_device_key(blob)
    }

    /// Unpacks the CLEP RSA signing key if present (`block_id = 0x12d`).
    pub fn clep_sign_key(&self) -> Result<RsaPrivateKey> {
        let blob = self
            .clep_sign_state_blob
            .as_deref()
            .ok_or_else(|| MsStoreError::Protocol("Device license missing ClepSignState".into()))?;
        unpack_clep_sign_state(blob)
    }

    /// Unwraps all packed CIKs in this content license using `device_key`.
    pub fn unpack_content_keys(
        &self,
        device_key: &[u8; 16],
    ) -> Result<Vec<(Uuid, Zeroizing<[u8; 32]>)>> {
        if self.packed_content_keys.is_empty() {
            return Err(MsStoreError::NotEntitled);
        }
        let mut keys = Vec::with_capacity(self.packed_content_keys.len());
        for packed in &self.packed_content_keys {
            keys.push((packed.key_id, packed.unpack(device_key)?));
        }
        Ok(keys)
    }
}

fn parse_packed_content_keys(data: &[u8]) -> Result<Vec<PackedContentKey>> {
    let mut keys = Vec::new();
    let mut pos = 0usize;
    while pos + 4 <= data.len() && keys.len() < MAX_CONTENT_KEYS {
        let id_len = u16::from_le_bytes([data[pos], data[pos + 1]]) as usize;
        let key_len = u16::from_le_bytes([data[pos + 2], data[pos + 3]]) as usize;
        pos += 4;
        if id_len < 16 || key_len != 40 {
            return Err(MsStoreError::Protocol(format!(
                "Invalid PackedContentKey entry sizes (id={id_len}, key={key_len})"
            )));
        }
        let entry_end = pos
            .checked_add(id_len)
            .and_then(|v| v.checked_add(key_len))
            .ok_or_else(|| MsStoreError::Protocol("PackedContentKey size overflow".into()))?;
        if entry_end > data.len() {
            return Err(MsStoreError::Protocol(
                "PackedContentKey entry truncated".into(),
            ));
        }
        let key_id = uuid_from_le_slice(&data[pos..pos + 16]);
        pos += id_len;
        let mut wrapped_key = [0u8; 40];
        wrapped_key.copy_from_slice(&data[pos..pos + 40]);
        pos += 40;
        keys.push(PackedContentKey {
            key_id,
            wrapped_key,
        });
    }
    Ok(keys)
}

fn uuid_from_le_slice(bytes: &[u8]) -> Uuid {
    let mut arr = [0u8; 16];
    arr.copy_from_slice(&bytes[..16]);
    Uuid::from_bytes_le(arr)
}

fn decode_utf16le_trimmed(bytes: &[u8]) -> Option<String> {
    if bytes.len() < 2 {
        return None;
    }
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
        .take_while(|&u| u != 0)
        .collect();
    let decoded = String::from_utf16(&units).ok()?;
    let trimmed = decoded.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build_tlv(blocks: &[(u32, &[u8])]) -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(&1u32.to_le_bytes()); // version
        out.extend_from_slice(&8u32.to_le_bytes()); // offset
        for (id, data) in blocks {
            out.extend_from_slice(&id.to_le_bytes());
            out.extend_from_slice(&(data.len() as u32).to_le_bytes());
            out.extend_from_slice(data);
        }
        out
    }

    #[test]
    fn parses_splicense_and_unwraps_rfc3394_cik() {
        let device_key = [0x11u8; 16];
        let plain_cik = [0xABu8; 32];
        let kek = KekAes128::from(device_key);
        let mut wrapped = [0u8; 40];
        kek.wrap(&plain_cik, &mut wrapped).unwrap();

        let key_uuid = Uuid::parse_str("12345678-1234-5678-9abc-def012345678").unwrap();
        let mut packed_block = Vec::new();
        packed_block.extend_from_slice(&16u16.to_le_bytes());
        packed_block.extend_from_slice(&40u16.to_le_bytes());
        packed_block.extend_from_slice(&key_uuid.to_bytes_le());
        packed_block.extend_from_slice(&wrapped);

        let pkg_name: Vec<u8> = "Contoso.Game_1.0.0.0_x64__8wekyb3d8bbwe\0"
            .encode_utf16()
            .flat_map(u16::to_le_bytes)
            .collect();

        let raw = build_tlv(&[
            (BLOCK_PACKAGE_FULL_NAME, &pkg_name),
            (BLOCK_PACKED_CONTENT_KEYS, &packed_block),
        ]);
        let parsed = SpLicense::parse(&raw).unwrap();
        assert_eq!(
            parsed.package_full_name.as_deref(),
            Some("Contoso.Game_1.0.0.0_x64__8wekyb3d8bbwe")
        );
        let keys = parsed.unpack_content_keys(&device_key).unwrap();
        assert_eq!(keys.len(), 1);
        assert_eq!(keys[0].0, key_uuid);
        assert_eq!(*keys[0].1, plain_cik);

        // Wrong device key must fail cleanly.
        assert!(parsed.unpack_content_keys(&[0x22u8; 16]).is_err());
    }

    #[test]
    fn rejects_truncated_tlv_and_underflowed_packed_keys() {
        let mut truncated = vec![0u8; 16];
        truncated[4..8].copy_from_slice(&8u32.to_le_bytes());
        truncated[8..12].copy_from_slice(&BLOCK_PACKAGE_FULL_NAME.to_le_bytes());
        truncated[12..16].copy_from_slice(&999u32.to_le_bytes());
        assert!(SpLicense::parse(&truncated).is_err());

        // id_len < 16 must fail without underflow.
        let bad_packed = [4u8, 0, 40, 0, 1, 2, 3, 4];
        let raw = build_tlv(&[(BLOCK_PACKED_CONTENT_KEYS, &bad_packed)]);
        assert!(SpLicense::parse(&raw).is_err());
    }
}
