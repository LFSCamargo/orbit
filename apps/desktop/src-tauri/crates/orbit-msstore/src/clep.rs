//! CLEP (Client Licensing Enforcement Protocol) hardware challenge obfuscation,
//! device hardware identity gathering, and AES-128-CBC zero-IV unpacking for
//! `ClepSignState`, `ClepHmacState`, and `EncryptedDeviceKey` blobs.

use aes::Aes128;
use cbc::Decryptor;
use cipher::{block_padding::NoPadding, BlockDecryptMut, KeyIvInit};
use num_bigint_dig::{BigUint, ModInverse};
use num_integer::Integer;
use rand::RngCore;
use rsa::RsaPrivateKey;
use zeroize::Zeroizing;

use crate::{MsStoreError, Result};

/// Fixed binary length of CLEP V2 and V4 challenge payloads.
pub const CLEP_BLOB_LEN: usize = 2048;

const MAGIC: u64 = 0x2418_1621_4139_3243;
const MAGIC_LO: u32 = (MAGIC & 0xFFFF_FFFF) as u32;
const MAGIC_HI: u32 = (MAGIC >> 32) as u32;
const MAGIC_01: u32 = ((MAGIC >> 48) & 0xFFFF) as u32;
const MAGIC_02: u32 = ((MAGIC >> 32) & 0xFFFF) as u32;
const MAGIC_03: u32 = ((MAGIC >> 16) & 0xFFFF) as u32;
const MAGIC_04: u32 = (MAGIC & 0xFFFF) as u32;

const BCRYPT_RSAPRIVATE_MAGIC: u32 = 0x3241_5352; // "RSA2"
const BCRYPT_RSAFULLPRIVATE_MAGIC: u32 = 0x3341_5352; // "RSA3"

/// Hardware identity fields fed into CLEP V2/V4 device provisioning.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HardwareFingerprint {
    pub smbios: Vec<u8>,
    pub disk_serial: Vec<u8>,
}

impl HardwareFingerprint {
    /// Collects SMBIOS bytes from the host Mac (falling back to deterministic
    /// random bytes only when SMBIOS cannot be read in a sandboxed environment).
    pub fn collect_local() -> Self {
        let mut smbios = read_smbios_bytes().unwrap_or_default();
        if smbios.is_empty() {
            smbios = vec![0u8; 64];
            rand::thread_rng().fill_bytes(&mut smbios);
        }
        smbios.truncate(256);

        let disk_serial = b"ORBIT-MACOS-APPLE-SILICON".to_vec();
        Self {
            smbios,
            disk_serial,
        }
    }
}

fn read_smbios_bytes() -> Option<Vec<u8>> {
    #[cfg(target_os = "macos")]
    {
        let model = std::process::Command::new("/usr/sbin/sysctl")
            .args(["-n", "hw.model"])
            .output()
            .ok()
            .filter(|out| out.status.success())
            .map(|out| out.stdout)
            .unwrap_or_default();
        let mut out = b"APPLE-SILICON:".to_vec();
        out.extend_from_slice(&model);
        out.truncate(256);
        if out.len() > 14 {
            return Some(out);
        }
    }
    None
}

#[inline]
const fn round_0(x: u32) -> u32 {
    MAGIC_04
        .wrapping_mul(x.wrapping_sub(MAGIC_HI).rotate_right(18))
        .wrapping_sub(x.rotate_right(9))
}

#[inline]
const fn round_1(x: u32) -> u32 {
    MAGIC_04
        .wrapping_mul((x ^ MAGIC_HI).rotate_right(22))
        .wrapping_sub(x.rotate_right(8))
}

#[inline]
const fn round_2(x: u32) -> u32 {
    MAGIC_04.wrapping_mul(x.rotate_right(15) ^ MAGIC_01)
}

#[inline]
const fn round_3(x: u32) -> u32 {
    (x >> 9).wrapping_add(MAGIC_02.wrapping_mul((x ^ MAGIC_03).rotate_left(3)))
}

#[inline]
const fn round_4(x: u32) -> u32 {
    x.rotate_right(28) ^ MAGIC_03.wrapping_mul((x ^ MAGIC_HI).rotate_right(9))
}

#[inline]
const fn round_5(x: u32) -> u32 {
    x.rotate_right(12)
        .wrapping_add(MAGIC_04.wrapping_mul(x.wrapping_sub(MAGIC_HI).rotate_right(14)))
}

#[inline]
const fn round_6(x: u32) -> u32 {
    x.rotate_right(11) ^ MAGIC_01.wrapping_mul((x ^ MAGIC_02).rotate_left(2))
}

#[inline]
const fn round_7(x: u32) -> u32 {
    x.wrapping_sub(MAGIC_LO).wrapping_sub(MAGIC_02)
}

#[inline]
const fn round_8(x: u32) -> u32 {
    MAGIC_03
        .wrapping_mul((x ^ MAGIC_01).rotate_left(2))
        .wrapping_sub(x.rotate_right(18))
}

#[inline]
const fn whiten(x: u32) -> u32 {
    MAGIC_03
        .wrapping_mul(x.wrapping_add(MAGIC_HI).rotate_right(10))
        .wrapping_sub(x.rotate_right(29))
}

const fn run_rounds_forward(a: u32, b: u32) -> (u32, u32) {
    let (a, b) = (b ^ round_1(a), a);
    let (a, b) = (b ^ round_2(a), a);
    let (a, b) = (b ^ round_3(a), a);
    let (a, b) = (b ^ round_4(a), a);
    let (a, b) = (b ^ round_5(a), a);
    let (a, b) = (b ^ round_6(a), a);
    let (a, b) = (b ^ round_7(a), a);
    (b ^ round_8(a), a)
}

const fn run_rounds_inverse(a: u32, b: u32) -> (u32, u32) {
    let (a, b) = (b, a ^ round_8(b));
    let (a, b) = (b, a ^ round_7(b));
    let (a, b) = (b, a ^ round_6(b));
    let (a, b) = (b, a ^ round_5(b));
    let (a, b) = (b, a ^ round_4(b));
    let (a, b) = (b, a ^ round_3(b));
    let (a, b) = (b, a ^ round_2(b));
    (b, a ^ round_1(b))
}

const fn initial_state() -> u32 {
    let k0 = !(MAGIC_03.wrapping_mul(MAGIC_HI.rotate_right(10)));
    let (_, k8) = run_rounds_forward(0, k0);
    k8
}

const INITIAL_STATE: u32 = initial_state();

/// Builds an unencrypted 2048-byte CLEP V2 hardware challenge payload.
pub fn build_clep_v2(
    fingerprint: &HardwareFingerprint,
    escrowed_device_key: &[u8],
) -> [u8; CLEP_BLOB_LEN] {
    let mut out = [0u8; CLEP_BLOB_LEN];
    out[0..4].copy_from_slice(&2u32.to_le_bytes());
    copy_capped(&mut out[4..260], &fingerprint.smbios);
    copy_capped(&mut out[260..324], &fingerprint.disk_serial);
    // offset 324..328 = always_0 (0), offset 328 = always_1 (1)
    out[328] = 1;
    // offset 329..1260 = unused_tpm (931 bytes), offset 1260 = is_windows_to_go (0)
    copy_capped(&mut out[1261..1409], escrowed_device_key);
    out
}

/// Builds an unencrypted 2048-byte CLEP V4 hardware challenge payload.
pub fn build_clep_v4(
    fingerprint: &HardwareFingerprint,
    escrowed_device_key: &[u8],
) -> [u8; CLEP_BLOB_LEN] {
    let mut out = [0u8; CLEP_BLOB_LEN];
    out[0..4].copy_from_slice(&4u32.to_le_bytes());
    copy_capped(&mut out[4..260], &fingerprint.smbios);
    copy_capped(&mut out[260..324], &fingerprint.disk_serial);
    // offset 324 = tpm_status (0)
    // offset 325..1226 = TPM SRK areas & cert (901 bytes, zeroed without TPM)
    // offset 1226 = is_windows_to_go (0)
    // offset 1227..1231 = debugger_enabled (0)
    // offset 1231..1235 = debugger_not_present (1)
    out[1231..1235].copy_from_slice(&1u32.to_le_bytes());
    copy_capped(&mut out[1235..1383], escrowed_device_key);
    out
}

fn copy_capped(dst: &mut [u8], src: &[u8]) {
    let len = dst.len().min(src.len());
    dst[..len].copy_from_slice(&src[..len]);
}

/// Obfuscates a 2048-byte CLEP challenge with an explicit 32-bit IV.
/// Complexity: O(N) single pass over 255 8-byte blocks.
pub fn obfuscate_clep(plaintext: &[u8; CLEP_BLOB_LEN], iv: u32) -> [u8; CLEP_BLOB_LEN] {
    let mut buf = *plaintext;
    let version = u32::from_le_bytes([buf[0], buf[1], buf[2], buf[3]]);
    let mut prev_cipher_lo = version;
    let mut prev_cipher_hi = INITIAL_STATE ^ iv;
    let mut prev_plain_lo = 0u32;
    let mut prev_plain_hi = 0u32;

    buf[4..8].copy_from_slice(&iv.to_le_bytes());

    let mut offset = 8;
    while offset + 8 <= CLEP_BLOB_LEN {
        let plain_lo = u32::from_le_bytes([
            buf[offset],
            buf[offset + 1],
            buf[offset + 2],
            buf[offset + 3],
        ]);
        let plain_hi = u32::from_le_bytes([
            buf[offset + 4],
            buf[offset + 5],
            buf[offset + 6],
            buf[offset + 7],
        ]);

        let r0 = prev_cipher_lo ^ plain_lo;
        let r1 = prev_cipher_hi ^ plain_hi ^ round_0(r0);
        let (r8, r9) = run_rounds_inverse(r0, r1);
        let cipher_hi = r9 ^ prev_plain_hi;
        let cipher_lo = r8 ^ prev_plain_lo ^ whiten(r9);

        buf[offset..offset + 4].copy_from_slice(&cipher_lo.to_le_bytes());
        buf[offset + 4..offset + 8].copy_from_slice(&cipher_hi.to_le_bytes());

        prev_cipher_lo = cipher_lo;
        prev_cipher_hi = cipher_hi;
        prev_plain_lo = plain_lo;
        prev_plain_hi = plain_hi;
        offset += 8;
    }

    buf
}

/// Inverse of [`obfuscate_clep`]; recovers bytes `[8..2048]` and preserves the header version.
pub fn deobfuscate_clep(ciphertext: &[u8; CLEP_BLOB_LEN]) -> [u8; CLEP_BLOB_LEN] {
    let mut buf = *ciphertext;
    let version = u32::from_le_bytes([buf[0], buf[1], buf[2], buf[3]]);
    let iv = u32::from_le_bytes([buf[4], buf[5], buf[6], buf[7]]);
    let mut prev_cipher_lo = version;
    let mut prev_cipher_hi = INITIAL_STATE ^ iv;
    let mut prev_plain_lo = 0u32;
    let mut prev_plain_hi = 0u32;

    let mut offset = 8;
    while offset + 8 <= CLEP_BLOB_LEN {
        let cipher_lo = u32::from_le_bytes([
            buf[offset],
            buf[offset + 1],
            buf[offset + 2],
            buf[offset + 3],
        ]);
        let cipher_hi = u32::from_le_bytes([
            buf[offset + 4],
            buf[offset + 5],
            buf[offset + 6],
            buf[offset + 7],
        ]);

        let r9 = cipher_hi ^ prev_plain_hi;
        let r8 = cipher_lo ^ prev_plain_lo ^ whiten(r9);
        let (r0, r1) = run_rounds_forward(r8, r9);
        let plain_lo = r0 ^ prev_cipher_lo;
        let plain_hi = r1 ^ prev_cipher_hi ^ round_0(r0);

        buf[offset..offset + 4].copy_from_slice(&plain_lo.to_le_bytes());
        buf[offset + 4..offset + 8].copy_from_slice(&plain_hi.to_le_bytes());

        prev_cipher_lo = cipher_lo;
        prev_cipher_hi = cipher_hi;
        prev_plain_lo = plain_lo;
        prev_plain_hi = plain_hi;
        offset += 8;
    }

    buf
}

/// Derives the 16-byte AES-128 key from the 58-word CLEP key schedule.
pub fn clep_schedule_key(ks: &[u32; 58]) -> Zeroizing<[u8; 16]> {
    let words = [
        ks[46] ^ ks[56] ^ 0xE20D_F371 ^ 0xCCB2_2FE6,
        ks[36] ^ ks[47] ^ 0xDF08_0E39,
        ks[40] ^ ks[51] ^ 0x6D09_B2F5 ^ 0x2AE1_7AB9,
        ks[30] ^ ks[41] ^ 0x3728_8CEC,
    ];
    let mut key = Zeroizing::new([0u8; 16]);
    for (i, word) in words.iter().enumerate() {
        key[i * 4..(i + 1) * 4].copy_from_slice(&word.to_le_bytes());
    }
    key
}

fn read_key_schedule(slice: &[u8]) -> Result<[u32; 58]> {
    if slice.len() != 58 * 4 {
        return Err(MsStoreError::Crypto("CLEP key schedule wrong length".into()));
    }
    let mut ks = [0u32; 58];
    for (idx, chunk) in slice.chunks_exact(4).enumerate() {
        ks[idx] = u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
    }
    Ok(ks)
}

fn aes128_cbc_zero_iv_decrypt(key: &[u8; 16], ciphertext: &[u8]) -> Result<Zeroizing<Vec<u8>>> {
    if ciphertext.is_empty() || ciphertext.len() % 16 != 0 {
        return Err(MsStoreError::Crypto(
            "CLEP encrypted payload is not 16-byte aligned".into(),
        ));
    }
    let mut buf = Zeroizing::new(ciphertext.to_vec());
    let iv = [0u8; 16];
    Decryptor::<Aes128>::new_from_slices(key, &iv)
        .map_err(|e| MsStoreError::Crypto(format!("AES-128 init failed: {e}")))?
        .decrypt_padded_mut::<NoPadding>(buf.as_mut_slice())
        .map_err(|e| MsStoreError::Crypto(format!("AES-128 decrypt failed: {e}")))?;
    Ok(buf)
}

/// Unpacks a 4096-byte `EncryptedDeviceKey` TLV block (`block_id = 0x1`) into the 16-byte Device Key.
pub fn unpack_encrypted_device_key(blob: &[u8]) -> Result<Zeroizing<[u8; 16]>> {
    if blob.len() < 2 + 4 + 232 + 280 + 16 {
        return Err(MsStoreError::Crypto(
            "EncryptedDeviceKey block is truncated".into(),
        ));
    }
    let version = u32::from_le_bytes([blob[2], blob[3], blob[4], blob[5]]);
    if version != 4 {
        return Err(MsStoreError::UnsupportedFormat(format!(
            "Unsupported EncryptedDeviceKey version {version}"
        )));
    }
    let ks = read_key_schedule(&blob[6..6 + 232])?;
    let aes_key = clep_schedule_key(&ks);
    let enc_device_key = &blob[6 + 232 + 280..6 + 232 + 280 + 16];
    let plain = aes128_cbc_zero_iv_decrypt(&aes_key, enc_device_key)?;
    let mut out = Zeroizing::new([0u8; 16]);
    out.copy_from_slice(&plain[..16]);
    Ok(out)
}

/// Unpacks a 4096-byte `ClepHmacState` blob (from `RST2.srf` `<wst:BinarySecret>`)
/// into the 32-byte HMAC-SHA256 signing secret.
pub fn unpack_clep_hmac_state(blob: &[u8]) -> Result<Zeroizing<[u8; 32]>> {
    if blob.len() < 4 + 48 + 232 {
        return Err(MsStoreError::Crypto(
            "ClepHmacState blob is truncated".into(),
        ));
    }
    let version = u32::from_le_bytes([blob[0], blob[1], blob[2], blob[3]]);
    if version != 4 {
        return Err(MsStoreError::UnsupportedFormat(format!(
            "Unsupported ClepHmacState version {version}"
        )));
    }
    let enc_key_data = &blob[4..52];
    let ks = read_key_schedule(&blob[52..52 + 232])?;
    let aes_key = clep_schedule_key(&ks);
    let plain = aes128_cbc_zero_iv_decrypt(&aes_key, enc_key_data)?;
    let mut secret = Zeroizing::new([0u8; 32]);
    secret.copy_from_slice(&plain[12..44]);
    Ok(secret)
}

/// Unpacks a 4096-byte `ClepSignState` TLV block (`block_id = 0x12d`) into an RSA signing key.
pub fn unpack_clep_sign_state(blob: &[u8]) -> Result<RsaPrivateKey> {
    if blob.len() < 4 + 544 + 232 {
        return Err(MsStoreError::Crypto(
            "ClepSignState block is truncated".into(),
        ));
    }
    let version = u32::from_le_bytes([blob[0], blob[1], blob[2], blob[3]]);
    if version != 4 {
        return Err(MsStoreError::UnsupportedFormat(format!(
            "Unsupported ClepSignState version {version}"
        )));
    }
    let enc_key_data = &blob[4..548];
    let ks = read_key_schedule(&blob[548..548 + 232])?;
    let aes_key = clep_schedule_key(&ks);
    let plain = aes128_cbc_zero_iv_decrypt(&aes_key, enc_key_data)?;
    parse_bcrypt_rsa_private(&plain)
}

/// Parses a Windows `BCRYPT_RSAPRIVATE_BLOB` (`RSA2`) or `BCRYPT_RSAFULLPRIVATE_BLOB` (`RSA3`).
pub fn parse_bcrypt_rsa_private(blob: &[u8]) -> Result<RsaPrivateKey> {
    if blob.len() < 24 {
        return Err(MsStoreError::Crypto(
            "BCrypt RSA blob shorter than 24-byte header".into(),
        ));
    }
    let read_u32 = |off: usize| -> u32 {
        u32::from_le_bytes([blob[off], blob[off + 1], blob[off + 2], blob[off + 3]])
    };
    let magic = read_u32(0);
    if magic != BCRYPT_RSAPRIVATE_MAGIC && magic != BCRYPT_RSAFULLPRIVATE_MAGIC {
        return Err(MsStoreError::Crypto(format!(
            "Unexpected BCrypt RSA magic: 0x{magic:08x}"
        )));
    }
    let cb_pub_exp = read_u32(8) as usize;
    let cb_mod = read_u32(12) as usize;
    let cb_p1 = read_u32(16) as usize;
    let cb_p2 = read_u32(20) as usize;
    if cb_pub_exp == 0 || cb_mod == 0 || cb_p1 == 0 || cb_p2 == 0 {
        return Err(MsStoreError::Crypto(
            "BCrypt RSA header has zero-sized component".into(),
        ));
    }
    let needed = 24usize
        .checked_add(cb_pub_exp)
        .and_then(|v| v.checked_add(cb_mod))
        .and_then(|v| v.checked_add(cb_p1))
        .and_then(|v| v.checked_add(cb_p2))
        .ok_or_else(|| MsStoreError::Crypto("BCrypt RSA header overflow".into()))?;
    if blob.len() < needed {
        return Err(MsStoreError::Crypto("BCrypt RSA blob is truncated".into()));
    }

    let mut pos = 24;
    let e = BigUint::from_bytes_be(&blob[pos..pos + cb_pub_exp]);
    pos += cb_pub_exp;
    let n = BigUint::from_bytes_be(&blob[pos..pos + cb_mod]);
    pos += cb_mod;
    let p = BigUint::from_bytes_be(&blob[pos..pos + cb_p1]);
    pos += cb_p1;
    let q = BigUint::from_bytes_be(&blob[pos..pos + cb_p2]);

    let one = BigUint::from(1u32);
    if p <= one || q <= one {
        return Err(MsStoreError::Crypto("Invalid RSA prime factors".into()));
    }
    let lambda = (&p - &one).lcm(&(&q - &one));
    let d_signed = e
        .clone()
        .mod_inverse(&lambda)
        .ok_or_else(|| MsStoreError::Crypto("RSA exponent is not invertible mod lambda".into()))?;
    let d = d_signed
        .to_biguint()
        .ok_or_else(|| MsStoreError::Crypto("RSA private exponent sign invalid".into()))?;

    RsaPrivateKey::from_components(n, e, d, vec![p, q])
        .map_err(|err| MsStoreError::Crypto(format!("Invalid RSA key components: {err}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use cbc::Encryptor;
    use cipher::BlockEncryptMut;
    use rsa::traits::{PrivateKeyParts, PublicKeyParts};

    fn aes128_cbc_zero_iv_encrypt(key: &[u8; 16], plain: &[u8]) -> Vec<u8> {
        let mut buf = plain.to_vec();
        Encryptor::<Aes128>::new_from_slices(key, &[0u8; 16])
            .unwrap()
            .encrypt_padded_mut::<NoPadding>(&mut buf, plain.len())
            .unwrap();
        buf
    }

    #[test]
    fn clep_v2_and_v4_obfuscation_round_trips() {
        let fp = HardwareFingerprint {
            smbios: b"TEST-SMBIOS-APPLE-SILICON".to_vec(),
            disk_serial: b"DISK-SERIAL-001".to_vec(),
        };
        let v2 = build_clep_v2(&fp, b"escrowed-device-key-bytes");
        let enc_v2 = obfuscate_clep(&v2, 0x1234_5678);
        assert_ne!(&enc_v2[8..64], &v2[8..64]);
        let dec_v2 = deobfuscate_clep(&enc_v2);
        assert_eq!(&dec_v2[8..], &v2[8..]);
        assert_eq!(&dec_v2[0..4], &2u32.to_le_bytes());

        let v4 = build_clep_v4(&fp, b"escrowed-v4-key");
        let enc_v4 = obfuscate_clep(&v4, 0xDEAD_BEEF);
        let dec_v4 = deobfuscate_clep(&enc_v4);
        assert_eq!(&dec_v4[8..], &v4[8..]);
        assert_eq!(&dec_v4[0..4], &4u32.to_le_bytes());
    }

    #[test]
    fn unpacks_encrypted_device_key_and_hmac_state() {
        let mut ks = [0u32; 58];
        for (i, w) in ks.iter_mut().enumerate() {
            *w = (i as u32).wrapping_mul(0x1357_9BDF) ^ 0xA5A5_5A5A;
        }
        let aes_key = clep_schedule_key(&ks);
        let ks_bytes: Vec<u8> = ks.iter().flat_map(|w| w.to_le_bytes()).collect();

        // EncryptedDeviceKey
        let expected_device_key = [0x42u8; 16];
        let enc_dev = aes128_cbc_zero_iv_encrypt(&aes_key, &expected_device_key);
        let mut dev_blob = vec![0u8; 4096];
        dev_blob[0..2].copy_from_slice(&16u16.to_le_bytes());
        dev_blob[2..6].copy_from_slice(&4u32.to_le_bytes());
        dev_blob[6..6 + 232].copy_from_slice(&ks_bytes);
        dev_blob[6 + 232 + 280..6 + 232 + 280 + 16].copy_from_slice(&enc_dev);
        assert_eq!(*unpack_encrypted_device_key(&dev_blob).unwrap(), expected_device_key);

        // ClepHmacState
        let mut plain_hmac = [0u8; 48];
        let expected_hmac = [0x99u8; 32];
        plain_hmac[12..44].copy_from_slice(&expected_hmac);
        let enc_hmac = aes128_cbc_zero_iv_encrypt(&aes_key, &plain_hmac);
        let mut hmac_blob = vec![0u8; 4096];
        hmac_blob[0..4].copy_from_slice(&4u32.to_le_bytes());
        hmac_blob[4..52].copy_from_slice(&enc_hmac);
        hmac_blob[52..52 + 232].copy_from_slice(&ks_bytes);
        assert_eq!(*unpack_clep_hmac_state(&hmac_blob).unwrap(), expected_hmac);
    }

    #[test]
    fn unpacks_clep_sign_state_bcrypt_rsa2_key() {
        let mut rng = rand::thread_rng();
        let key = RsaPrivateKey::new(&mut rng, 1024).unwrap();
        let e = key.e().to_bytes_be();
        let n = key.n().to_bytes_be();
        let p = key.primes()[0].to_bytes_be();
        let q = key.primes()[1].to_bytes_be();

        let mut bcrypt = vec![0u8; 544];
        bcrypt[0..4].copy_from_slice(&BCRYPT_RSAPRIVATE_MAGIC.to_le_bytes());
        bcrypt[4..8].copy_from_slice(&1024u32.to_le_bytes());
        bcrypt[8..12].copy_from_slice(&(e.len() as u32).to_le_bytes());
        bcrypt[12..16].copy_from_slice(&(n.len() as u32).to_le_bytes());
        bcrypt[16..20].copy_from_slice(&(p.len() as u32).to_le_bytes());
        bcrypt[20..24].copy_from_slice(&(q.len() as u32).to_le_bytes());
        let mut pos = 24;
        bcrypt[pos..pos + e.len()].copy_from_slice(&e);
        pos += e.len();
        bcrypt[pos..pos + n.len()].copy_from_slice(&n);
        pos += n.len();
        bcrypt[pos..pos + p.len()].copy_from_slice(&p);
        pos += p.len();
        bcrypt[pos..pos + q.len()].copy_from_slice(&q);

        let ks = [0x1122_3344u32; 58];
        let aes_key = clep_schedule_key(&ks);
        let enc_key = aes128_cbc_zero_iv_encrypt(&aes_key, &bcrypt);
        let ks_bytes: Vec<u8> = ks.iter().flat_map(|w| w.to_le_bytes()).collect();

        let mut sign_blob = vec![0u8; 4096];
        sign_blob[0..4].copy_from_slice(&4u32.to_le_bytes());
        sign_blob[4..548].copy_from_slice(&enc_key);
        sign_blob[548..548 + 232].copy_from_slice(&ks_bytes);

        let recovered = unpack_clep_sign_state(&sign_blob).unwrap();
        assert_eq!(recovered.n(), key.n());
        assert_eq!(recovered.e(), key.e());
    }
}
