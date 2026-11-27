//! APFS transparent compression for one file: the data goes LZFSE-compressed
//! into the resource fork, a `com.apple.decmpfs` header (type 12) says so, and
//! the `UF_COMPRESSED` flag makes macOS decompress it on every read. Programs,
//! games and Wine read the file exactly as before; a write makes macOS store
//! that file uncompressed again.
//!
//! Nothing is changed in place. The compressed copy is built beside the file
//! (`.name.orbit-afsc`), read back through the kernel and compared byte for
//! byte with the original, and only then renamed over it, keeping mode,
//! flags, times and extended attributes. Any doubt (hard links, another
//! owner, an existing resource fork, a file that changed meanwhile, poor
//! savings) leaves the file untouched. Compression uses Apple's
//! `libcompression`, so no third-party codec ships with Orbit.
use std::ffi::{CStr, CString};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::os::fd::AsRawFd;
use std::os::macos::fs::MetadataExt as MacMetadataExt;
use std::os::unix::ffi::OsStrExt;
use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
use std::path::{Path, PathBuf};

/// decmpfs compresses in 64 KiB blocks.
const BLOCK: usize = 0x10000;
const DECMPFS: &CStr = c"com.apple.decmpfs";
const RESOURCE_FORK: &CStr = c"com.apple.ResourceFork";
const MAGIC: &[u8; 4] = b"fpmc";
/// LZFSE blocks in the resource fork.
const LZFSE_RESOURCE_FORK: u32 = 12;
const COMPRESSION_LZFSE: u32 = 0x801;
/// Smaller files save nothing on 4 KiB allocation blocks.
pub const MIN_SIZE: u64 = 16 * 1024;
/// Resource-fork offsets are 32-bit.
const MAX_SIZE: u64 = 3 * 1024 * 1024 * 1024;
/// A file is kept compressed only when it saves at least 5%.
const KEEP_RATIO: f64 = 0.95;
pub const TEMP_SUFFIX: &str = ".orbit-afsc";
const XATTR_LIST_LIMIT: usize = 64 * 1024;
const XATTR_VALUE_LIMIT: usize = 16 * 1024 * 1024;

#[link(name = "compression")]
extern "C" {
    fn compression_encode_scratch_buffer_size(algorithm: u32) -> usize;
    fn compression_encode_buffer(
        dst: *mut u8,
        dst_size: usize,
        src: *const u8,
        src_size: usize,
        scratch: *mut libc::c_void,
        algorithm: u32,
    ) -> usize;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    /// Bytes allocated on disk before and after.
    Changed {
        before: u64,
        after: u64,
    },
    Skipped,
}

pub fn is_compressed(meta: &fs::Metadata) -> bool {
    meta.st_flags() & libc::UF_COMPRESSED != 0
}

/// Bytes the file takes on disk (compressed files count their resource fork).
pub fn allocated(meta: &fs::Metadata) -> u64 {
    meta.blocks() * 512
}

/// LZFSE encoder with its scratch buffer, one per worker thread.
pub struct Encoder {
    scratch: Vec<u8>,
    out: Vec<u8>,
}

impl Default for Encoder {
    fn default() -> Self {
        // SAFETY: a pure query of libcompression.
        let size = unsafe { compression_encode_scratch_buffer_size(COMPRESSION_LZFSE) };
        Self {
            scratch: vec![0; size.max(1)],
            out: vec![0; BLOCK + 4096],
        }
    }
}

impl Encoder {
    /// One compressed block, or None when libcompression could not encode it.
    pub fn block(&mut self, src: &[u8]) -> Option<&[u8]> {
        if src.is_empty() || src.len() > BLOCK {
            return None;
        }
        // SAFETY: `out` holds `out.len()` writable bytes, `src` is a valid slice
        // and `scratch` is the size libcompression asked for.
        let written = unsafe {
            compression_encode_buffer(
                self.out.as_mut_ptr(),
                self.out.len(),
                src.as_ptr(),
                src.len(),
                self.scratch.as_mut_ptr().cast(),
                COMPRESSION_LZFSE,
            )
        };
        (written > 0).then(|| &self.out[..written])
    }
}

/// The decmpfs header: magic, type, uncompressed size, little-endian.
pub fn decmpfs_header(uncompressed: u64) -> [u8; 16] {
    let mut header = [0u8; 16];
    header[..4].copy_from_slice(MAGIC);
    header[4..8].copy_from_slice(&LZFSE_RESOURCE_FORK.to_le_bytes());
    header[8..].copy_from_slice(&uncompressed.to_le_bytes());
    header
}

/// The resource fork's table: one offset per block plus the end.
pub fn offset_table(offsets: &[u32]) -> Vec<u8> {
    offsets
        .iter()
        .flat_map(|offset| offset.to_le_bytes())
        .collect()
}

fn c_path(path: &Path) -> io::Result<CString> {
    CString::new(path.as_os_str().as_bytes()).map_err(|_| io::ErrorKind::InvalidInput.into())
}

fn check(rc: libc::c_int) -> io::Result<()> {
    if rc == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

fn write_fork(file: &File, data: &[u8], position: u64) -> io::Result<()> {
    let position =
        u32::try_from(position).map_err(|_| io::Error::other("resource fork too large"))?;
    // SAFETY: valid fd, NUL-terminated name, and a readable buffer of data.len() bytes.
    let rc = unsafe {
        libc::fsetxattr(
            file.as_raw_fd(),
            RESOURCE_FORK.as_ptr(),
            data.as_ptr().cast(),
            data.len(),
            position,
            0,
        )
    };
    check(rc)
}

fn set_xattr(file: &File, name: &CStr, value: &[u8]) -> io::Result<()> {
    // SAFETY: valid fd, NUL-terminated name, readable buffer.
    let rc = unsafe {
        libc::fsetxattr(
            file.as_raw_fd(),
            name.as_ptr(),
            value.as_ptr().cast(),
            value.len(),
            0,
            0,
        )
    };
    check(rc)
}

fn has_xattr(path: &CStr, name: &CStr) -> bool {
    // SAFETY: a size query (null buffer) on a NUL-terminated path.
    let size = unsafe {
        libc::getxattr(
            path.as_ptr(),
            name.as_ptr(),
            std::ptr::null_mut(),
            0,
            0,
            libc::XATTR_NOFOLLOW,
        )
    };
    size >= 0
}

/// Copies the source's extended attributes, except compression's own.
fn copy_xattrs(source: &CStr, target: &File) -> io::Result<()> {
    // SAFETY: size query on a NUL-terminated path.
    let size = unsafe {
        libc::listxattr(
            source.as_ptr(),
            std::ptr::null_mut(),
            0,
            libc::XATTR_NOFOLLOW,
        )
    };
    if size <= 0 {
        return Ok(());
    }
    let size = usize::try_from(size).unwrap_or(0).min(XATTR_LIST_LIMIT);
    let mut names = vec![0u8; size];
    // SAFETY: `names` holds `size` writable bytes.
    let got = unsafe {
        libc::listxattr(
            source.as_ptr(),
            names.as_mut_ptr().cast(),
            names.len(),
            libc::XATTR_NOFOLLOW,
        )
    };
    if got < 0 {
        return Err(io::Error::last_os_error());
    }
    names.truncate(usize::try_from(got).unwrap_or(0));
    for raw in names.split(|b| *b == 0).filter(|name| !name.is_empty()) {
        let Ok(name) = CString::new(raw) else {
            continue;
        };
        if name.as_c_str() == DECMPFS || name.as_c_str() == RESOURCE_FORK {
            continue;
        }
        // SAFETY: size query.
        let len = unsafe {
            libc::getxattr(
                source.as_ptr(),
                name.as_ptr(),
                std::ptr::null_mut(),
                0,
                0,
                libc::XATTR_NOFOLLOW,
            )
        };
        if len < 0 {
            continue;
        }
        let len = usize::try_from(len).unwrap_or(0);
        if len > XATTR_VALUE_LIMIT {
            return Err(io::Error::other("extended attribute too large"));
        }
        let mut value = vec![0u8; len];
        // SAFETY: `value` holds `len` writable bytes.
        let read = unsafe {
            libc::getxattr(
                source.as_ptr(),
                name.as_ptr(),
                value.as_mut_ptr().cast(),
                value.len(),
                0,
                libc::XATTR_NOFOLLOW,
            )
        };
        if read < 0 {
            return Err(io::Error::last_os_error());
        }
        value.truncate(usize::try_from(read).unwrap_or(0));
        set_xattr(target, &name, &value)?;
    }
    Ok(())
}

/// Mode, flags and times of `meta` on `file`; `flags` replaces the original ones.
fn finish_metadata(file: &File, meta: &fs::Metadata, flags: u32) -> io::Result<()> {
    let fd = file.as_raw_fd();
    // SAFETY: valid fd; mode is masked to permission bits.
    check(unsafe { libc::fchmod(fd, (meta.mode() & 0o7777) as libc::mode_t) })?;
    // SAFETY: valid fd.
    check(unsafe { libc::fchflags(fd, flags) })?;
    let times = [
        libc::timespec {
            tv_sec: meta.atime(),
            tv_nsec: meta.atime_nsec(),
        },
        libc::timespec {
            tv_sec: meta.mtime(),
            tv_nsec: meta.mtime_nsec(),
        },
    ];
    // SAFETY: valid fd and a two-element timespec array.
    check(unsafe { libc::futimens(fd, times.as_ptr()) })
}

pub fn temp_path(path: &Path) -> Option<PathBuf> {
    let name = path.file_name()?.to_str()?;
    Some(path.with_file_name(format!(".{name}{TEMP_SUFFIX}")))
}

/// Removes the temp file unless the rename consumed it.
struct TempGuard(Option<PathBuf>);

impl Drop for TempGuard {
    fn drop(&mut self) {
        if let Some(path) = self.0.take() {
            let _ = fs::remove_file(path);
        }
    }
}

fn create_temp(path: &Path) -> io::Result<(File, TempGuard)> {
    let temp = temp_path(path).ok_or(io::ErrorKind::InvalidInput)?;
    if fs::symlink_metadata(&temp).is_ok_and(|meta| meta.is_file()) {
        fs::remove_file(&temp)?;
    }
    let file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW)
        .open(&temp)?;
    Ok((file, TempGuard(Some(temp))))
}

/// Same file still there: same inode, size and modification time.
fn unchanged(path: &Path, before: &fs::Metadata) -> bool {
    fs::symlink_metadata(path).is_ok_and(|now| {
        now.ino() == before.ino()
            && now.len() == before.len()
            && now.mtime() == before.mtime()
            && now.mtime_nsec() == before.mtime_nsec()
    })
}

fn same_content(a: &Path, b: &Path) -> io::Result<bool> {
    let (mut a, mut b) = (File::open(a)?, File::open(b)?);
    let (mut left, mut right) = (vec![0u8; 1 << 20], vec![0u8; 1 << 20]);
    loop {
        let n = read_full(&mut a, &mut left)?;
        let m = read_full(&mut b, &mut right)?;
        if n != m || left[..n] != right[..m] {
            return Ok(false);
        }
        if n == 0 {
            return Ok(true);
        }
    }
}

fn read_full(file: &mut File, buf: &mut [u8]) -> io::Result<usize> {
    let mut filled = 0;
    while filled < buf.len() {
        match file.read(&mut buf[filled..]) {
            Ok(0) => break,
            Ok(n) => filled += n,
            Err(err) if err.kind() == io::ErrorKind::Interrupted => {}
            Err(err) => return Err(err),
        }
    }
    Ok(filled)
}

/// Files Orbit may rewrite: regular, single-link, owned by this user.
fn eligible(meta: &fs::Metadata) -> bool {
    // SAFETY: geteuid never fails.
    meta.is_file() && meta.nlink() == 1 && meta.uid() == unsafe { libc::geteuid() }
}

/// Compresses one file in place. O(size).
pub fn compress(path: &Path, encoder: &mut Encoder) -> io::Result<Outcome> {
    let meta = fs::symlink_metadata(path)?;
    if !eligible(&meta) || is_compressed(&meta) || meta.len() < MIN_SIZE || meta.len() > MAX_SIZE {
        return Ok(Outcome::Skipped);
    }
    let c_source = c_path(path)?;
    if has_xattr(&c_source, RESOURCE_FORK) {
        return Ok(Outcome::Skipped);
    }
    let mut source = File::open(path)?;
    let (temp, mut guard) = create_temp(path)?;
    let blocks = meta.len().div_ceil(BLOCK as u64);
    let mut position = (blocks + 1) * 4;
    let limit = (meta.len() as f64 * KEEP_RATIO) as u64;
    let mut offsets = Vec::with_capacity(blocks as usize + 1);
    let mut buffer = vec![0u8; BLOCK];
    let mut total = 0u64;
    loop {
        let read = read_full(&mut source, &mut buffer)?;
        if read == 0 {
            break;
        }
        total += read as u64;
        let Some(compressed) = encoder.block(&buffer[..read]) else {
            return Ok(Outcome::Skipped);
        };
        offsets.push(u32::try_from(position).map_err(|_| io::Error::other("too large"))?);
        write_fork(&temp, compressed, position)?;
        position += compressed.len() as u64;
        if position > limit {
            return Ok(Outcome::Skipped);
        }
    }
    if total != meta.len() || offsets.len() as u64 != blocks {
        return Ok(Outcome::Skipped);
    }
    offsets.push(u32::try_from(position).map_err(|_| io::Error::other("too large"))?);
    write_fork(&temp, &offset_table(&offsets), 0)?;
    copy_xattrs(&c_source, &temp)?;
    set_xattr(&temp, DECMPFS, &decmpfs_header(meta.len()))?;
    finish_metadata(&temp, &meta, meta.st_flags() | libc::UF_COMPRESSED)?;
    drop(temp);
    let temp_path = guard.0.clone().ok_or(io::ErrorKind::NotFound)?;
    let written = fs::symlink_metadata(&temp_path)?;
    if !is_compressed(&written) || written.len() != meta.len() || !same_content(path, &temp_path)? {
        return Err(io::Error::other(format!(
            "{} did not verify after compression",
            path.display()
        )));
    }
    if !unchanged(path, &meta) {
        return Ok(Outcome::Skipped);
    }
    fs::rename(&temp_path, path)?;
    guard.0 = None;
    Ok(Outcome::Changed {
        before: allocated(&meta),
        after: allocated(&written),
    })
}

/// Stores one compressed file uncompressed again. O(size).
pub fn decompress(path: &Path) -> io::Result<Outcome> {
    let meta = fs::symlink_metadata(path)?;
    if !eligible(&meta) || !is_compressed(&meta) {
        return Ok(Outcome::Skipped);
    }
    let c_source = c_path(path)?;
    let mut source = File::open(path)?;
    let (mut temp, mut guard) = create_temp(path)?;
    let copied = io::copy(&mut source, &mut temp)?;
    temp.flush()?;
    if copied != meta.len() {
        return Err(io::Error::other(format!(
            "{} read short while decompressing",
            path.display()
        )));
    }
    copy_xattrs(&c_source, &temp)?;
    finish_metadata(&temp, &meta, meta.st_flags() & !libc::UF_COMPRESSED)?;
    drop(temp);
    let temp_path = guard.0.clone().ok_or(io::ErrorKind::NotFound)?;
    if !unchanged(path, &meta) {
        return Ok(Outcome::Skipped);
    }
    let written = fs::symlink_metadata(&temp_path)?;
    fs::rename(&temp_path, path)?;
    guard.0 = None;
    Ok(Outcome::Changed {
        before: allocated(&meta),
        after: allocated(&written),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    fn scratch() -> PathBuf {
        // APFS home volume: /tmp may live elsewhere on some setups.
        let base = dirs::home_dir()
            .unwrap()
            .join("Library/Caches/orbit-afsc-tests");
        let dir = base.join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn text(len: usize) -> Vec<u8> {
        b"Orbit game data block 0123456789 "
            .iter()
            .cycle()
            .take(len)
            .copied()
            .collect()
    }

    #[test]
    fn header_and_table_match_the_decmpfs_layout() {
        let header = decmpfs_header(0x0102_0304);
        assert_eq!(&header[..4], b"fpmc");
        assert_eq!(u32::from_le_bytes(header[4..8].try_into().unwrap()), 12);
        assert_eq!(
            u64::from_le_bytes(header[8..].try_into().unwrap()),
            0x0102_0304
        );
        assert_eq!(
            offset_table(&[12, 40, 41]),
            vec![12, 0, 0, 0, 40, 0, 0, 0, 41, 0, 0, 0]
        );
    }

    #[test]
    fn a_compressed_file_reads_back_identically_and_keeps_its_metadata() {
        let dir = scratch();
        let path = dir.join("data.pak");
        let content = text(BLOCK * 3 + 1234);
        fs::write(&path, &content).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o751)).unwrap();
        let before = fs::metadata(&path).unwrap();
        let outcome = compress(&path, &mut Encoder::default()).unwrap();
        let Outcome::Changed { before: was, after } = outcome else {
            panic!("expected compression, got {outcome:?}");
        };
        assert!(after < was);
        let meta = fs::symlink_metadata(&path).unwrap();
        assert!(is_compressed(&meta));
        assert_eq!(meta.len(), content.len() as u64);
        assert_eq!(meta.mode() & 0o7777, 0o751);
        assert_eq!(meta.mtime(), before.mtime());
        assert_eq!(fs::read(&path).unwrap(), content);
        assert!(!temp_path(&path).unwrap().exists());
        // Already compressed: nothing to do.
        assert_eq!(
            compress(&path, &mut Encoder::default()).unwrap(),
            Outcome::Skipped
        );
        assert!(matches!(
            decompress(&path).unwrap(),
            Outcome::Changed { .. }
        ));
        let meta = fs::symlink_metadata(&path).unwrap();
        assert!(!is_compressed(&meta));
        assert_eq!(meta.mode() & 0o7777, 0o751);
        assert_eq!(fs::read(&path).unwrap(), content);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn a_compressed_executable_still_runs() {
        let dir = scratch();
        let path = dir.join("game.sh");
        let mut script = b"#!/bin/sh\necho orbit-ok\n".to_vec();
        script.extend(std::iter::repeat_n(b'#', 64 * 1024));
        script.push(b'\n');
        fs::write(&path, &script).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap();
        assert!(matches!(
            compress(&path, &mut Encoder::default()).unwrap(),
            Outcome::Changed { .. }
        ));
        let output = std::process::Command::new(&path).output().unwrap();
        assert_eq!(String::from_utf8_lossy(&output.stdout).trim(), "orbit-ok");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn small_random_linked_and_symlinked_files_are_left_alone() {
        let dir = scratch();
        let small = dir.join("small.ini");
        fs::write(&small, text(1024)).unwrap();
        assert_eq!(
            compress(&small, &mut Encoder::default()).unwrap(),
            Outcome::Skipped
        );
        // Already-compressed data (like a game's .pak) saves nothing.
        let random = dir.join("random.bin");
        let noise: Vec<u8> = (0..BLOCK * 2).map(|_| rand::random::<u8>()).collect();
        fs::write(&random, &noise).unwrap();
        assert_eq!(
            compress(&random, &mut Encoder::default()).unwrap(),
            Outcome::Skipped
        );
        assert_eq!(fs::read(&random).unwrap(), noise);
        assert!(!temp_path(&random).unwrap().exists());
        let linked = dir.join("linked.bin");
        fs::write(&linked, text(BLOCK * 2)).unwrap();
        fs::hard_link(&linked, dir.join("other-name.bin")).unwrap();
        assert_eq!(
            compress(&linked, &mut Encoder::default()).unwrap(),
            Outcome::Skipped
        );
        let symlink = dir.join("symlink.bin");
        std::os::unix::fs::symlink(&random, &symlink).unwrap();
        assert_eq!(
            compress(&symlink, &mut Encoder::default()).unwrap(),
            Outcome::Skipped
        );
        assert_eq!(decompress(&small).unwrap(), Outcome::Skipped);
        let _ = fs::remove_dir_all(dir);
    }
}
