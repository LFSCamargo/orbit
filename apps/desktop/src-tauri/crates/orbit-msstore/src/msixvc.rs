//! Streaming MSIXVC / XVD container reader, IEEE 1619-2007 XTS-AES-128 page cipher,
//! SHA-256 Merkle hash-tree integrity verification, and on-the-fly extraction.
//!
//! Key security & storage properties:
//! - Streams ranges directly from Microsoft's CDN into final files without duplicating
//!   the multi-GB `.msixvc` image on disk.
//! - Verifies every page against the XVD SHA-256 hash tree when data integrity is enabled.
//! - Keeps `keep_encrypted == true` executables encrypted on disk alongside
//!   `.orbit-msixvc-header.bin` (which stores only header + region + file metadata, never CIKs).
//! - Decrypts `keep_encrypted` executables on demand into a caller-supplied writer
//!   (Orbit's ephemeral macOS RAM disk) via [`decrypt_encrypted_file`].

use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use aes::Aes128;
use cipher::{BlockDecrypt, BlockEncrypt, KeyInit};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::manifest::{safe_join_under, sanitize_relative_path};
use crate::{is_allowed_cdn_url, MsStoreError, Result};

pub const PAGE_SIZE: usize = 4096;
pub const HASH_ENTRY_LENGTH: usize = 24;
pub const HASH_ENTRIES_IN_PAGE: usize = 170;
pub const XVD_MAGIC: &[u8; 8] = b"msft-xvd";
pub const HEADER_CACHE_FILE: &str = ".orbit-msixvc-header.bin";
pub const SEGMENT_MANIFEST_FILE: &str = ".orbit-msixvc-files.json";

/// Volume flags from XVD header offset `0x208`.
pub const XVD_FLAG_ENCRYPTION_DISABLED: u32 = 1 << 1;
pub const XVD_FLAG_DATA_INTEGRITY_DISABLED: u32 = 1 << 2;
pub const XVD_FLAG_REGION_ID_IN_XTS: u32 = 1 << 6;

const MAX_EXTRACTED_FILES: usize = 100_000;
const STREAM_CHUNK_PAGES: usize = 256; // 1 MiB per HTTP range chunk

/// Parsed XVD / MSIXVC 4096-byte header.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct XvdHeader {
    pub volume_flags: u32,
    pub format_version: u32,
    pub file_time_created: u64,
    pub drive_size: u64,
    pub vduid: [u8; 16],
    pub uduid: [u8; 16],
    pub top_hash_block_hash: [u8; 32],
    pub xvd_type: u32,
    pub xvd_content_type: u32,
    pub embedded_xvd_length: u32,
    pub user_data_length: u32,
    pub xvc_data_length: u32,
    pub dynamic_header_length: u32,
    pub block_size: u32,
    pub mutable_page_count: u32,
}

impl XvdHeader {
    pub fn parse(page: &[u8]) -> Result<Self> {
        if page.len() < PAGE_SIZE {
            return Err(MsStoreError::UnsupportedFormat(
                "XVD header shorter than 4096 bytes".into(),
            ));
        }
        if &page[0x200..0x208] != XVD_MAGIC {
            return Err(MsStoreError::UnsupportedFormat(
                "Missing msft-xvd magic in package header".into(),
            ));
        }
        let u32_at = |off: usize| -> u32 {
            u32::from_le_bytes([page[off], page[off + 1], page[off + 2], page[off + 3]])
        };
        let u64_at = |off: usize| -> u64 {
            u64::from_le_bytes([
                page[off],
                page[off + 1],
                page[off + 2],
                page[off + 3],
                page[off + 4],
                page[off + 5],
                page[off + 6],
                page[off + 7],
            ])
        };
        let mut vduid = [0u8; 16];
        vduid.copy_from_slice(&page[0x220..0x230]);
        let mut uduid = [0u8; 16];
        uduid.copy_from_slice(&page[0x230..0x240]);
        let mut top_hash_block_hash = [0u8; 32];
        top_hash_block_hash.copy_from_slice(&page[0x240..0x260]);

        let drive_size = u64_at(0x218);
        if drive_size % PAGE_SIZE as u64 != 0 {
            return Err(MsStoreError::UnsupportedFormat(
                "XVD drive_size is not page-aligned".into(),
            ));
        }

        Ok(Self {
            volume_flags: u32_at(0x208),
            format_version: u32_at(0x20C),
            file_time_created: u64_at(0x210),
            drive_size,
            vduid,
            uduid,
            top_hash_block_hash,
            xvd_type: u32_at(0x280),
            xvd_content_type: u32_at(0x284),
            embedded_xvd_length: u32_at(0x288),
            user_data_length: u32_at(0x28C),
            xvc_data_length: u32_at(0x290),
            dynamic_header_length: u32_at(0x294),
            block_size: u32_at(0x298),
            mutable_page_count: u32_at(0x3E4),
        })
    }

    pub fn is_encrypted(&self) -> bool {
        (self.volume_flags & XVD_FLAG_ENCRYPTION_DISABLED) == 0
    }

    pub fn has_data_integrity(&self) -> bool {
        (self.volume_flags & XVD_FLAG_DATA_INTEGRITY_DISABLED) == 0
    }

    pub fn uses_region_id_in_xts(&self) -> bool {
        (self.volume_flags & XVD_FLAG_REGION_ID_IN_XTS) != 0
    }

    pub fn drive_page_count(&self) -> u64 {
        self.drive_size / PAGE_SIZE as u64
    }

    pub fn embedded_xvd_pages(&self) -> u64 {
        u64::from(self.embedded_xvd_length).div_ceil(PAGE_SIZE as u64)
    }

    pub fn user_data_pages(&self) -> u64 {
        u64::from(self.user_data_length).div_ceil(PAGE_SIZE as u64)
    }

    pub fn xvc_info_pages(&self) -> u64 {
        u64::from(self.xvc_data_length).div_ceil(PAGE_SIZE as u64)
    }

    pub fn dynamic_header_pages(&self) -> u64 {
        u64::from(self.dynamic_header_length).div_ceil(PAGE_SIZE as u64)
    }

    /// Number of pages covered by the XVD Merkle hash tree.
    pub fn hashed_page_count(&self) -> u64 {
        self.user_data_pages()
            + self.xvc_info_pages()
            + self.dynamic_header_pages()
            + self.drive_page_count()
    }

    /// Total number of hash-tree pages (0 when data integrity is disabled).
    pub fn hash_tree_page_count(&self) -> u64 {
        if !self.has_data_integrity() {
            return 0;
        }
        hash_tree_levels(self.hashed_page_count())
            .into_iter()
            .sum()
    }

    /// Byte offset where the hash tree begins.
    pub fn hash_tree_offset(&self) -> u64 {
        (1 + self.embedded_xvd_pages() + u64::from(self.mutable_page_count)) * PAGE_SIZE as u64
    }

    /// Byte offset where the User Data / XVC Info / Drive Data region starts.
    pub fn user_data_offset(&self) -> u64 {
        self.hash_tree_offset() + self.hash_tree_page_count() * PAGE_SIZE as u64
    }

    /// Byte offset where XVC Info begins.
    pub fn xvc_info_offset(&self) -> u64 {
        self.user_data_offset() + self.user_data_pages() * PAGE_SIZE as u64
    }

    /// Byte offset where the main drive payload begins.
    pub fn data_offset(&self) -> u64 {
        self.xvc_info_offset()
            + (self.xvc_info_pages() + self.dynamic_header_pages()) * PAGE_SIZE as u64
    }
}

/// Computes the page count at each Merkle tree level (from leaf level up to root)
/// for `data_pages` using fanout [`HASH_ENTRIES_IN_PAGE`] = 170.
pub fn hash_tree_levels(data_pages: u64) -> Vec<u64> {
    if data_pages == 0 {
        return Vec::new();
    }
    let mut levels = Vec::new();
    let mut current = data_pages.div_ceil(HASH_ENTRIES_IN_PAGE as u64);
    levels.push(current);
    while current > 1 {
        current = current.div_ceil(HASH_ENTRIES_IN_PAGE as u64);
        levels.push(current);
    }
    levels
}

/// Truncated 24-byte SHA-256 page hash used in XVD hash-tree leaf entries.
pub fn xvd_page_hash(page: &[u8]) -> [u8; HASH_ENTRY_LENGTH] {
    let digest = Sha256::digest(page);
    let mut truncated = [0u8; HASH_ENTRY_LENGTH];
    truncated.copy_from_slice(&digest[..HASH_ENTRY_LENGTH]);
    truncated
}

/// Verifies a 4096-byte page against its expected 24-byte truncated SHA-256 entry.
pub fn verify_page_hash(page: &[u8], expected: &[u8; HASH_ENTRY_LENGTH]) -> Result<()> {
    let actual = xvd_page_hash(page);
    if actual != *expected {
        return Err(MsStoreError::IntegrityMismatch(
            "XVD page SHA-256 hash does not match hash tree".into(),
        ));
    }
    Ok(())
}

/// Builds the 16-byte XVD XTS-AES-128 tweak for `(data_unit_id, region_id, vduid)`.
pub fn xvd_tweak(data_unit_id: u32, region_id: u32, vduid: &[u8; 16]) -> [u8; 16] {
    let mut tweak = [0u8; 16];
    tweak[0..4].copy_from_slice(&data_unit_id.to_le_bytes());
    tweak[4..8].copy_from_slice(&region_id.to_le_bytes());
    tweak[8..16].copy_from_slice(&vduid[0..8]);
    tweak
}

/// IEEE 1619-2007 XTS-AES-128 encryption / decryption over 16-byte aligned data units.
///
/// Key layout follows IEEE 1619-2007 and Microsoft XVD CIK:
/// - `cik[0..16]`: `Key1` (data cipher key)
/// - `cik[16..32]`: `Key2` (tweak cipher key)
pub struct XtsAes128 {
    data_cipher: Aes128,
    tweak_cipher: Aes128,
}

impl XtsAes128 {
    pub fn new(cik: &[u8; 32]) -> Self {
        let mut k1 = [0u8; 16];
        let mut k2 = [0u8; 16];
        k1.copy_from_slice(&cik[0..16]);
        k2.copy_from_slice(&cik[16..32]);
        Self {
            data_cipher: Aes128::new(&k1.into()),
            tweak_cipher: Aes128::new(&k2.into()),
        }
    }

    /// Encrypts one data unit (must be a non-empty multiple of 16 bytes) in place.
    /// Complexity: O(buf.len() / 16).
    pub fn encrypt_sector_in_place(&self, buf: &mut [u8], tweak_bytes: &[u8; 16]) -> Result<()> {
        if buf.is_empty() || buf.len() % 16 != 0 {
            return Err(MsStoreError::Crypto(
                "XTS data unit must be a multiple of 16 bytes".into(),
            ));
        }
        let mut t = *tweak_bytes;
        self.tweak_cipher.encrypt_block((&mut t).into());
        for chunk in buf.chunks_exact_mut(16) {
            xor_16(chunk, &t);
            self.data_cipher.encrypt_block(chunk.into());
            xor_16(chunk, &t);
            gf_mul_alpha(&mut t);
        }
        Ok(())
    }

    /// Decrypts one data unit (must be a non-empty multiple of 16 bytes) in place.
    /// Complexity: O(buf.len() / 16).
    pub fn decrypt_sector_in_place(&self, buf: &mut [u8], tweak_bytes: &[u8; 16]) -> Result<()> {
        if buf.is_empty() || buf.len() % 16 != 0 {
            return Err(MsStoreError::Crypto(
                "XTS data unit must be a multiple of 16 bytes".into(),
            ));
        }
        let mut t = *tweak_bytes;
        self.tweak_cipher.encrypt_block((&mut t).into());
        for chunk in buf.chunks_exact_mut(16) {
            xor_16(chunk, &t);
            self.data_cipher.decrypt_block(chunk.into());
            xor_16(chunk, &t);
            gf_mul_alpha(&mut t);
        }
        Ok(())
    }

    /// Decrypts one 4096-byte XVD page in place using `(data_unit_id, region_id, vduid)`.
    pub fn decrypt_xvd_page_in_place(
        &self,
        page: &mut [u8; PAGE_SIZE],
        data_unit_id: u32,
        region_id: u32,
        vduid: &[u8; 16],
    ) -> Result<()> {
        let tweak = xvd_tweak(data_unit_id, region_id, vduid);
        self.decrypt_sector_in_place(page, &tweak)
    }

    /// Encrypts one 4096-byte XVD page in place using `(data_unit_id, region_id, vduid)`.
    pub fn encrypt_xvd_page_in_place(
        &self,
        page: &mut [u8; PAGE_SIZE],
        data_unit_id: u32,
        region_id: u32,
        vduid: &[u8; 16],
    ) -> Result<()> {
        let tweak = xvd_tweak(data_unit_id, region_id, vduid);
        self.encrypt_sector_in_place(page, &tweak)
    }
}

#[inline]
fn xor_16(dst: &mut [u8], mask: &[u8; 16]) {
    for (d, m) in dst.iter_mut().zip(mask.iter()) {
        *d ^= *m;
    }
}

/// Multiplies a little-endian 128-bit tweak by `x` in GF(2^128) modulo `x^128 + x^7 + x^2 + x + 1`.
#[inline]
fn gf_mul_alpha(tweak: &mut [u8; 16]) {
    let val = u128::from_le_bytes(*tweak);
    let carry = (val >> 127) as u128;
    let next = (val << 1) ^ (carry.wrapping_neg() & 0x87);
    *tweak = next.to_le_bytes();
}

/// Metadata for a single file extracted from an MSIXVC package.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageFileEntry {
    /// Clean relative path inside the install root (`Binaries/Win64/Game.exe`).
    pub relative_path: String,
    /// Exact logical file size in bytes.
    pub size: u64,
    /// Starting byte offset relative to the XVD drive data area (must be page-aligned for encrypted files).
    pub data_offset: u64,
    /// XVC region ID used in XTS tweak when `XVD_FLAG_REGION_ID_IN_XTS` is set.
    pub region_id: u32,
    /// True for protected executables / DLLs kept encrypted on disk and decrypted to RAM at launch.
    pub keep_encrypted: bool,
    /// Optional expected 24-byte page hashes for integrity verification.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub page_hashes: Vec<[u8; HASH_ENTRY_LENGTH]>,
}

/// Persisted metadata saved alongside an installed MS Store game (`.orbit-msixvc-files.json`).
/// Never contains any CIK or user credential!
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledMsixvcManifest {
    pub content_id: String,
    pub vduid: [u8; 16],
    pub encrypted: bool,
    pub uses_region_id_in_xts: bool,
    pub files: Vec<PackageFileEntry>,
}

/// Progress snapshot emitted while streaming an MSIXVC install.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ExtractionProgress {
    pub bytes_written: u64,
    pub total_bytes: u64,
    pub files_completed: usize,
    pub total_files: usize,
}

/// Abstraction over a random-access MSIXVC source (HTTP Range CDN or local test fixture).
pub trait RangeReader {
    fn read_exact_at(&mut self, offset: u64, buf: &mut [u8]) -> Result<()>;
}

/// Local file or in-memory slice range reader (used for tests and local package verification).
pub struct SliceRangeReader<'a>(pub &'a [u8]);

impl RangeReader for SliceRangeReader<'_> {
    fn read_exact_at(&mut self, offset: u64, buf: &mut [u8]) -> Result<()> {
        let start = usize::try_from(offset)
            .map_err(|_| MsStoreError::Protocol("Offset overflow".into()))?;
        let end = start
            .checked_add(buf.len())
            .ok_or_else(|| MsStoreError::Protocol("Range overflow".into()))?;
        if end > self.0.len() {
            return Err(MsStoreError::Protocol(format!(
                "Read out of bounds: {start}..{end} > {}",
                self.0.len()
            )));
        }
        buf.copy_from_slice(&self.0[start..end]);
        Ok(())
    }
}

/// HTTP Range reader against a strictly allowlisted Microsoft CDN URL.
pub struct HttpRangeReader {
    client: reqwest::blocking::Client,
    url: String,
}

impl HttpRangeReader {
    pub fn new(url: &str) -> Result<Self> {
        if !is_allowed_cdn_url(url) {
            return Err(MsStoreError::DisallowedUrl(format!(
                "Refusing to download from untrusted host: {url}"
            )));
        }
        let client = reqwest::blocking::Client::builder()
            .user_agent("Orbit")
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(120))
            .build()
            .map_err(|e| MsStoreError::Network(format!("HTTP client init failed: {e}")))?;
        Ok(Self {
            client,
            url: url.to_string(),
        })
    }
}

impl RangeReader for HttpRangeReader {
    fn read_exact_at(&mut self, offset: u64, buf: &mut [u8]) -> Result<()> {
        if buf.is_empty() {
            return Ok(());
        }
        let end = offset
            .checked_add(buf.len() as u64 - 1)
            .ok_or_else(|| MsStoreError::Protocol("HTTP range end overflow".into()))?;
        let range = format!("bytes={offset}-{end}");
        let mut response = self
            .client
            .get(&self.url)
            .header("Range", range)
            .send()
            .map_err(|e| MsStoreError::Network(format!("HTTP Range request failed: {e}")))?;
        let status = response.status().as_u16();
        if status != 206 && status != 200 {
            return Err(MsStoreError::Network(format!(
                "CDN Range request returned HTTP {status}"
            )));
        }
        response
            .read_exact(buf)
            .map_err(|e| MsStoreError::Network(format!("CDN range stream interrupted: {e}")))?;
        Ok(())
    }
}

/// Streams files described by `entries` out of an MSIXVC container into `install_root`.
///
/// - Assets (`keep_encrypted == false`) are decrypted page-by-page with `cik` and written
///   in plaintext directly to disk.
/// - Protected executables (`keep_encrypted == true`) are written in their original
///   encrypted pages on disk (rounded to `PAGE_SIZE` during decryption) alongside
///   `.orbit-msixvc-header.bin` and `.orbit-msixvc-files.json`.
/// - Every file path is validated against traversal and symlinks before creation.
///
/// Complexity: O(total_bytes / 4096) sequential page reads & writes; O(STREAM_CHUNK_PAGES) RAM.
pub fn extract_streaming<R, F>(
    reader: &mut R,
    header_bytes: &[u8; PAGE_SIZE],
    content_id: &str,
    entries: &[PackageFileEntry],
    cik: &[u8; 32],
    install_root: &Path,
    cancel: &AtomicBool,
    mut on_progress: F,
) -> Result<InstalledMsixvcManifest>
where
    R: RangeReader,
    F: FnMut(ExtractionProgress),
{
    if entries.len() > MAX_EXTRACTED_FILES {
        return Err(MsStoreError::Protocol(format!(
            "Package exceeds maximum file count ({MAX_EXTRACTED_FILES})"
        )));
    }
    let header = XvdHeader::parse(header_bytes)?;
    fs::create_dir_all(install_root)?;
    fs::write(install_root.join(HEADER_CACHE_FILE), header_bytes)?;

    let xts = XtsAes128::new(cik);
    let total_bytes: u64 = entries.iter().map(|e| e.size).sum();
    let total_files = entries.len();
    let mut bytes_written: u64 = 0;

    let mut sanitized_entries = Vec::with_capacity(entries.len());
    for (file_idx, entry) in entries.iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            return Err(MsStoreError::Cancelled);
        }
        let clean_rel = sanitize_relative_path(&entry.relative_path)?;
        let dest = safe_join_under(install_root, &clean_rel)?;
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)?;
        }

        let mut out = File::create(&dest)?;
        let page_count = entry.size.div_ceil(PAGE_SIZE as u64);
        let base_page_index = entry.data_offset / PAGE_SIZE as u64;
        let region_id = if header.uses_region_id_in_xts() {
            entry.region_id
        } else {
            0
        };

        let mut page_offset: u64 = 0;
        let mut remaining_logical = entry.size;

        while page_offset < page_count {
            if cancel.load(Ordering::Relaxed) {
                return Err(MsStoreError::Cancelled);
            }
            let batch_pages = (page_count - page_offset).min(STREAM_CHUNK_PAGES as u64) as usize;
            let mut chunk = vec![0u8; batch_pages * PAGE_SIZE];
            let abs_offset = header.data_offset() + (base_page_index + page_offset) * PAGE_SIZE as u64;
            reader.read_exact_at(abs_offset, &mut chunk)?;

            for p in 0..batch_pages {
                let page_idx_in_file = (page_offset + p as u64) as usize;
                let page_slice = &mut chunk[p * PAGE_SIZE..(p + 1) * PAGE_SIZE];
                if let Some(expected_hash) = entry.page_hashes.get(page_idx_in_file) {
                    verify_page_hash(page_slice, expected_hash)?;
                }

                if entry.keep_encrypted {
                    // Keep full encrypted page on disk so runtime XTS decryption
                    // has intact 4096-byte sectors.
                    out.write_all(page_slice)?;
                    let logical_step = remaining_logical.min(PAGE_SIZE as u64);
                    remaining_logical -= logical_step;
                    bytes_written += logical_step;
                } else {
                    if header.is_encrypted() {
                        let page_arr: &mut [u8; PAGE_SIZE] = page_slice
                            .try_into()
                            .map_err(|_| MsStoreError::Crypto("Page slice size error".into()))?;
                        let data_unit = u32::try_from(base_page_index + page_offset + p as u64)
                            .map_err(|_| MsStoreError::Protocol("XVD page index overflow".into()))?;
                        xts.decrypt_xvd_page_in_place(page_arr, data_unit, region_id, &header.vduid)?;
                    }
                    let write_len = remaining_logical.min(PAGE_SIZE as u64) as usize;
                    out.write_all(&page_slice[..write_len])?;
                    remaining_logical -= write_len as u64;
                    bytes_written += write_len as u64;
                }
            }

            page_offset += batch_pages as u64;
            on_progress(ExtractionProgress {
                bytes_written,
                total_bytes,
                files_completed: file_idx,
                total_files,
            });
        }

        let mut clean_entry = entry.clone();
        clean_entry.relative_path = clean_rel;
        sanitized_entries.push(clean_entry);
        on_progress(ExtractionProgress {
            bytes_written,
            total_bytes,
            files_completed: file_idx + 1,
            total_files,
        });
    }

    let manifest = InstalledMsixvcManifest {
        content_id: content_id.to_ascii_lowercase(),
        vduid: header.vduid,
        encrypted: header.is_encrypted(),
        uses_region_id_in_xts: header.uses_region_id_in_xts(),
        files: sanitized_entries,
    };
    let manifest_bytes = serde_json::to_vec_pretty(&manifest)
        .map_err(|e| MsStoreError::Protocol(format!("Failed serializing install manifest: {e}")))?;
    fs::write(install_root.join(SEGMENT_MANIFEST_FILE), manifest_bytes)?;
    Ok(manifest)
}

/// Loads `.orbit-msixvc-files.json` from an installed MS Store game folder.
pub fn load_installed_manifest(install_root: &Path) -> Result<InstalledMsixvcManifest> {
    let path = install_root.join(SEGMENT_MANIFEST_FILE);
    let file = File::open(&path)?;
    let mut bytes = Vec::new();
    file.take(16 * 1024 * 1024 + 1).read_to_end(&mut bytes)?;
    if bytes.len() > 16 * 1024 * 1024 {
        return Err(MsStoreError::Protocol(
            "Installed MSIXVC manifest exceeds size limit".into(),
        ));
    }
    serde_json::from_slice(&bytes)
        .map_err(|e| MsStoreError::Protocol(format!("Corrupt installed MSIXVC manifest: {e}")))
}

/// Decrypts one `keep_encrypted` file from disk into `writer` (typically an unlinked
/// file on Orbit's ephemeral macOS RAM disk) using `cik`, seeking `writer` back to 0.
pub fn decrypt_encrypted_file<W: Write + Seek>(
    install_root: &Path,
    manifest: &InstalledMsixvcManifest,
    entry: &PackageFileEntry,
    cik: &[u8; 32],
    writer: &mut W,
) -> Result<u64> {
    let source_path = safe_join_under(install_root, &entry.relative_path)?;
    let mut src = File::open(&source_path)?;
    let xts = XtsAes128::new(cik);
    let base_page_index = entry.data_offset / PAGE_SIZE as u64;
    let region_id = if manifest.uses_region_id_in_xts {
        entry.region_id
    } else {
        0
    };

    let page_count = entry.size.div_ceil(PAGE_SIZE as u64);
    let mut remaining = entry.size;
    let mut page = [0u8; PAGE_SIZE];

    for p in 0..page_count {
        src.read_exact(&mut page)?;
        if let Some(expected_hash) = entry.page_hashes.get(p as usize) {
            verify_page_hash(&page, expected_hash)?;
        }
        if manifest.encrypted {
            let data_unit = u32::try_from(base_page_index + p)
                .map_err(|_| MsStoreError::Protocol("XVD page index overflow".into()))?;
            xts.decrypt_xvd_page_in_place(&mut page, data_unit, region_id, &manifest.vduid)?;
        }
        let write_len = remaining.min(PAGE_SIZE as u64) as usize;
        writer.write_all(&page[..write_len])?;
        remaining -= write_len as u64;
    }
    writer.flush()?;
    writer.seek(SeekFrom::Start(0))?;
    Ok(entry.size)
}

/// Returns the list of `keep_encrypted` entries in an installed manifest.
pub fn encrypted_entries(manifest: &InstalledMsixvcManifest) -> Vec<&PackageFileEntry> {
    manifest.files.iter().filter(|f| f.keep_encrypted).collect()
}

/// Builds a synthetic XVD header page (used in unit & integration tests).
pub fn build_xvd_header_page(
    drive_size: u64,
    vduid: [u8; 16],
    volume_flags: u32,
) -> [u8; PAGE_SIZE] {
    let mut page = [0u8; PAGE_SIZE];
    page[0x200..0x208].copy_from_slice(XVD_MAGIC);
    page[0x208..0x20C].copy_from_slice(&volume_flags.to_le_bytes());
    page[0x20C..0x210].copy_from_slice(&3u32.to_le_bytes());
    page[0x218..0x220].copy_from_slice(&drive_size.to_le_bytes());
    page[0x220..0x230].copy_from_slice(&vduid);
    page
}

/// Path helper returning the cached header file inside an MS Store install root.
pub fn header_cache_path(install_root: &Path) -> PathBuf {
    install_root.join(HEADER_CACHE_FILE)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn hex_decode(s: &str) -> Vec<u8> {
        let clean: String = s.chars().filter(|c| !c.is_whitespace()).collect();
        (0..clean.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&clean[i..i + 2], 16).unwrap())
            .collect()
    }

    #[test]
    fn matches_ieee_1619_2007_xts_aes_128_test_vector_1() {
        // Official IEEE 1619-2007 Annex B Vector 1 (XTS-AES-128):
        // Key1 = 00..00, Key2 = 00..00, Tweak i = 0, Plaintext = 00..00 (32 bytes)
        // Expected Ciphertext: 917cf69ebd68b2ec9b9fe9a3eadda692 cd43d2f59598ed858c02c2652fbf922e
        let cik = [0u8; 32];
        let xts = XtsAes128::new(&cik);
        let tweak = [0u8; 16];
        let mut block = [0u8; 32];
        xts.encrypt_sector_in_place(&mut block, &tweak).unwrap();
        let expected = hex_decode(
            "917cf69ebd68b2ec9b9fe9a3eadda692cd43d2f59598ed858c02c2652fbf922e",
        );
        assert_eq!(block.as_slice(), expected.as_slice());

        xts.decrypt_sector_in_place(&mut block, &tweak).unwrap();
        assert_eq!(block, [0u8; 32]);
    }

    #[test]
    fn matches_ieee_1619_2007_xts_aes_128_test_vector_2() {
        // Official IEEE 1619-2007 Annex B Vector 2:
        // Key1 = 11..11, Key2 = 22..22, i = 0x3333333333 (LE: 33 33 33 33 33 00..00)
        // Plaintext = 44..44 (32 bytes)
        let mut cik = [0u8; 32];
        cik[0..16].fill(0x11);
        cik[16..32].fill(0x22);
        let mut tweak = [0u8; 16];
        tweak[0..5].fill(0x33);
        let mut block = [0x44u8; 32];
        let xts = XtsAes128::new(&cik);
        xts.encrypt_sector_in_place(&mut block, &tweak).unwrap();
        let expected = hex_decode(
            "c454185e6a16936e39334038acef838bfb186fff7480adc4289382ecd6d394f0",
        );
        assert_eq!(block.as_slice(), expected.as_slice());
        xts.decrypt_sector_in_place(&mut block, &tweak).unwrap();
        assert_eq!(block, [0x44u8; 32]);
    }

    #[test]
    fn hash_tree_levels_match_170_fanout() {
        assert_eq!(hash_tree_levels(0), Vec::<u64>::new());
        assert_eq!(hash_tree_levels(1), vec![1]);
        assert_eq!(hash_tree_levels(170), vec![1]);
        assert_eq!(hash_tree_levels(171), vec![2, 1]);
        assert_eq!(hash_tree_levels(170 * 170 + 1), vec![171, 2, 1]);
    }

    #[test]
    fn streaming_extraction_decrypts_assets_preserves_exes_and_decrypts_to_ram() {
        let dir = std::env::temp_dir().join(format!("orbit-msixvc-{}", uuid::Uuid::new_v4()));
        let cik = [0x5Au8; 32];
        let vduid = [0x77u8; 16];
        let xts = XtsAes128::new(&cik);

        // Build a synthetic 2-page XVD image (data integrity flag cleared for simple layout):
        // Page 0: plaintext asset (MicrosoftGame.config)
        // Page 1: protected executable (Game.exe, keep_encrypted = true)
        let asset_plain = b"<Game><TitleId>1234</TitleId></Game>";
        let mut page0 = [0u8; PAGE_SIZE];
        page0[..asset_plain.len()].copy_from_slice(asset_plain);
        xts.encrypt_xvd_page_in_place(&mut page0, 0, 1, &vduid)
            .unwrap();
        let hash0 = xvd_page_hash(&page0);

        let mut exe_plain = vec![0u8; 128];
        exe_plain[0..2].copy_from_slice(b"MZ");
        exe_plain[60..64].copy_from_slice(&64u32.to_le_bytes());
        exe_plain[64..68].copy_from_slice(b"PE\0\0");
        let mut page1 = [0u8; PAGE_SIZE];
        page1[..exe_plain.len()].copy_from_slice(&exe_plain);
        xts.encrypt_xvd_page_in_place(&mut page1, 1, 2, &vduid)
            .unwrap();
        let hash1 = xvd_page_hash(&page1);

        let header_page = build_xvd_header_page(
            (2 * PAGE_SIZE) as u64,
            vduid,
            XVD_FLAG_DATA_INTEGRITY_DISABLED | XVD_FLAG_REGION_ID_IN_XTS,
        );
        let mut image = Vec::with_capacity(3 * PAGE_SIZE);
        image.extend_from_slice(&header_page);
        image.extend_from_slice(&page0);
        image.extend_from_slice(&page1);

        let entries = vec![
            PackageFileEntry {
                relative_path: "MicrosoftGame.config".into(),
                size: asset_plain.len() as u64,
                data_offset: 0,
                region_id: 1,
                keep_encrypted: false,
                page_hashes: vec![hash0],
            },
            PackageFileEntry {
                relative_path: "Binaries\\Game.exe".into(),
                size: exe_plain.len() as u64,
                data_offset: PAGE_SIZE as u64,
                region_id: 2,
                keep_encrypted: true,
                page_hashes: vec![hash1],
            },
        ];

        let mut reader = SliceRangeReader(&image);
        let cancel = AtomicBool::new(false);
        let mut progress_updates = 0usize;
        let manifest = extract_streaming(
            &mut reader,
            &header_page,
            "11111111-2222-3333-4444-555555555555",
            &entries,
            &cik,
            &dir,
            &cancel,
            |_| progress_updates += 1,
        )
        .unwrap();
        assert_eq!(manifest.files.len(), 2);
        assert!(progress_updates >= 2);
        assert_eq!(fs::read(dir.join("MicrosoftGame.config")).unwrap(), asset_plain);

        // Protected executable MUST remain encrypted on disk (not starting with "MZ")!
        let on_disk_exe = fs::read(dir.join("Binaries/Game.exe")).unwrap();
        assert_eq!(on_disk_exe.len(), PAGE_SIZE);
        assert_ne!(&on_disk_exe[..2], b"MZ");

        // Runtime decryption into memory / RAM disk recovers exact PE bytes.
        let loaded = load_installed_manifest(&dir).unwrap();
        let enc_entry = encrypted_entries(&loaded)[0];
        let mut ram_buf = Cursor::new(Vec::new());
        let decrypted_len =
            decrypt_encrypted_file(&dir, &loaded, enc_entry, &cik, &mut ram_buf).unwrap();
        assert_eq!(decrypted_len, exe_plain.len() as u64);
        assert_eq!(ram_buf.into_inner(), exe_plain);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_corrupt_page_hash_and_path_traversal() {
        let dir = std::env::temp_dir().join(format!("orbit-msixvc-bad-{}", uuid::Uuid::new_v4()));
        let cik = [0x11u8; 32];
        let vduid = [0x22u8; 16];
        let header_page = build_xvd_header_page(
            PAGE_SIZE as u64,
            vduid,
            XVD_FLAG_DATA_INTEGRITY_DISABLED,
        );
        let mut image = Vec::with_capacity(2 * PAGE_SIZE);
        image.extend_from_slice(&header_page);
        image.extend_from_slice(&[0xABu8; PAGE_SIZE]);

        let bad_hash = vec![PackageFileEntry {
            relative_path: "ok.bin".into(),
            size: 32,
            data_offset: 0,
            region_id: 0,
            keep_encrypted: false,
            page_hashes: vec![[0u8; HASH_ENTRY_LENGTH]],
        }];
        let cancel = AtomicBool::new(false);
        let err = extract_streaming(
            &mut SliceRangeReader(&image),
            &header_page,
            "11111111-2222-3333-4444-555555555555",
            &bad_hash,
            &cik,
            &dir,
            &cancel,
            |_| {},
        )
        .unwrap_err();
        assert!(matches!(err, MsStoreError::IntegrityMismatch(_)));

        let traversal = vec![PackageFileEntry {
            relative_path: "../escape.exe".into(),
            size: 32,
            data_offset: 0,
            region_id: 0,
            keep_encrypted: false,
            page_hashes: vec![],
        }];
        let err = extract_streaming(
            &mut SliceRangeReader(&image),
            &header_page,
            "11111111-2222-3333-4444-555555555555",
            &traversal,
            &cik,
            &dir,
            &cancel,
            |_| {},
        )
        .unwrap_err();
        assert!(matches!(err, MsStoreError::InvalidPath(_)));

        let _ = fs::remove_dir_all(&dir);
    }
}
