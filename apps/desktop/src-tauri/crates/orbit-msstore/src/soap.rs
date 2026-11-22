//! WS-Trust SOAP protocol helpers for Microsoft device provisioning
//! (`deviceaddcredential.srf`) and Security Token Service (`RST2.srf`) exchanges,
//! including NIST SP 800-108 CTR-mode HMAC-SHA256 key derivation, XMLDSig signing,
//! and AES-256-CBC PKCS7 `<CipherValue>` decryption.

use aes::Aes256;
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use cbc::Decryptor;
use chrono::{Duration, Utc};
use cipher::{block_padding::Pkcs7, BlockDecryptMut, KeyIvInit};
use hmac::{Hmac, Mac};
use quick_xml::events::Event;
use quick_xml::Reader;
use rsa::pkcs1v15::SigningKey;
use rsa::signature::{SignatureEncoding, Signer};
use rsa::RsaPrivateKey;
use sha2::{Digest, Sha256};
use uuid::Uuid;
use zeroize::Zeroizing;

use crate::{MsStoreError, Result};

pub const DEVICE_ADD_CREDENTIAL_URL: &str =
    "https://login.live.com/ppsecure/deviceaddcredential.srf";
pub const RST2_URL: &str = "https://login.live.com/RST2.srf";
pub const INLINE_LOGIN_URL: &str = "https://login.live.com/InlineLogin.srf";

/// Standard Windows TokenBroker / Store client identifiers used in `RST2.srf`.
pub const USER_LOGIN_CLIENT_ID: &str = "000000004424da1f";
pub const STORE_CLIENT_ID: &str = "{d6d5a677-0872-4ab0-9442-bb792fce85c5}";
pub const DEVICE_RPS_CLIENT_ID: &str = "{28C08266-F973-4AE6-FFE4-409B249F138F}";

type HmacSha256 = Hmac<Sha256>;

/// NIST SP 800-108 counter-mode KDF using HMAC-SHA256 (`SP800108_CTR_HMAC_SHA256_DOUBLEDERIVED`).
///
/// Format per counter `i = 1..`: `BE32(i) || label_utf8 || 0x00 || context || BE32(key_len_bits)`.
/// Complexity: O(ceil(key_len_bytes / 32)).
pub fn sp800_108_kdf_sha256(
    secret: &[u8],
    label: &str,
    context: &[u8],
    key_len_bytes: usize,
) -> Result<Zeroizing<Vec<u8>>> {
    if key_len_bytes == 0 || key_len_bytes > 1024 {
        return Err(MsStoreError::Crypto(
            "Requested SP800-108 key length is out of bounds".into(),
        ));
    }
    let key_len_bits = (key_len_bytes as u32)
        .checked_mul(8)
        .ok_or_else(|| MsStoreError::Crypto("Key bit length overflow".into()))?;
    let mut derived = Zeroizing::new(Vec::with_capacity(key_len_bytes));
    let mut counter: u32 = 1;
    while derived.len() < key_len_bytes {
        let mut mac = HmacSha256::new_from_slice(secret)
            .map_err(|_| MsStoreError::Crypto("HMAC-SHA256 init failed".into()))?;
        mac.update(&counter.to_be_bytes());
        mac.update(label.as_bytes());
        mac.update(&[0u8]);
        mac.update(context);
        mac.update(&key_len_bits.to_be_bytes());
        let block = mac.finalize().into_bytes();
        let remaining = key_len_bytes - derived.len();
        derived.extend_from_slice(&block[..remaining.min(block.len())]);
        counter = counter
            .checked_add(1)
            .ok_or_else(|| MsStoreError::Crypto("KDF counter overflow".into()))?;
    }
    Ok(derived)
}

/// Decrypts a WS-Security `<xenc:CipherValue>` payload: first 16 bytes are the IV,
/// remainder is AES-256-CBC PKCS#7 ciphertext.
pub fn decrypt_cipher_value(
    aes_key: &[u8; 32],
    cipher_value_b64: &str,
) -> Result<Zeroizing<Vec<u8>>> {
    let raw = B64
        .decode(cipher_value_b64.trim())
        .map_err(|e| MsStoreError::Crypto(format!("Invalid base64 CipherValue: {e}")))?;
    if raw.len() < 32 || (raw.len() - 16) % 16 != 0 {
        return Err(MsStoreError::Crypto(
            "CipherValue length is invalid for AES-256-CBC".into(),
        ));
    }
    let iv = &raw[..16];
    let mut buf = Zeroizing::new(raw[16..].to_vec());
    let plain = Decryptor::<Aes256>::new_from_slices(aes_key, iv)
        .map_err(|e| MsStoreError::Crypto(format!("AES-256 init failed: {e}")))?
        .decrypt_padded_mut::<Pkcs7>(buf.as_mut_slice())
        .map_err(|_| MsStoreError::Crypto("AES-256-CBC PKCS7 unpadding failed".into()))?;
    Ok(Zeroizing::new(plain.to_vec()))
}

/// Computes `base64(SHA-256(bytes))` used for XMLDSig `<DigestValue>`.
pub fn sha256_b64(data: &[u8]) -> String {
    B64.encode(Sha256::digest(data))
}

/// Signs canonical XML `<SignedInfo>` with RSA PKCS#1 v1.5 SHA-256.
pub fn sign_xml_rsa_sha256(key: &RsaPrivateKey, signed_info_xml: &str) -> String {
    let signing_key = SigningKey::<Sha256>::new(key.clone());
    let sig = signing_key.sign(signed_info_xml.as_bytes());
    B64.encode(sig.to_bytes())
}

/// Signs canonical XML `<SignedInfo>` with HMAC-SHA256.
pub fn sign_xml_hmac_sha256(secret: &[u8], signed_info_xml: &str) -> Result<String> {
    let mut mac = HmacSha256::new_from_slice(secret)
        .map_err(|_| MsStoreError::Crypto("HMAC-SHA256 init failed".into()))?;
    mac.update(signed_info_xml.as_bytes());
    Ok(B64.encode(mac.finalize().into_bytes()))
}

/// Escapes XML text content cleanly so untrusted tokens or identifiers cannot inject tags.
pub fn xml_escape(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(ch),
        }
    }
    out
}

/// Builds the `deviceaddcredential.srf` XML request body to register a virtual Windows
/// device identity with Microsoft's Live account service.
pub fn build_device_add_credential_request(
    device_name: &str,
    password: &str,
    clep_v2_b64: &str,
) -> String {
    format!(
        r#"<?xml version="1.0" encoding="utf-8"?><DeviceAddRequest><ClientInfo name="Orbit" version="1.0"/><Authentication><Membername>{}</Membername><Password>{}</Password></Authentication><ClepChallenge>{}</ClepChallenge></DeviceAddRequest>"#,
        xml_escape(device_name),
        xml_escape(password),
        xml_escape(clep_v2_b64)
    )
}

/// Result extracted from a `deviceaddcredential.srf` XML response.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeviceCredentialResponse {
    pub puid: String,
    pub device_license_b64: Option<String>,
}

/// Parses a `deviceaddcredential.srf` XML response.
pub fn parse_device_add_credential_response(xml: &str) -> Result<DeviceCredentialResponse> {
    let puid = extract_xml_text(xml, "puid")
        .or_else(|| extract_xml_text(xml, "PUID"))
        .ok_or_else(|| MsStoreError::Protocol("deviceaddcredential response missing PUID".into()))?;
    let device_license_b64 = extract_xml_text(xml, "DeviceLicense")
        .or_else(|| extract_xml_text(xml, "SPLicenseBlock"));
    Ok(DeviceCredentialResponse {
        puid,
        device_license_b64,
    })
}

/// Parsed security token returned by `RST2.srf`.
#[derive(Debug, Clone)]
pub struct Rst2Token {
    pub applies_to: String,
    pub token: Zeroizing<String>,
    pub binary_secret_b64: Option<Zeroizing<String>>,
    pub expires: Option<String>,
}

/// Builds a WS-Trust `RST2.srf` request envelope for either device authentication
/// or user token exchange (`http://Passport.NET/tb`, `www.microsoft.com`, etc.).
pub fn build_rst2_request(
    username: &str,
    password: &str,
    targets: &[(&str, &str)],
    device_da_token: Option<&str>,
) -> String {
    let now = Utc::now();
    let expires = now + Duration::minutes(5);
    let created_str = now.format("%Y-%m-%dT%H:%M:%SZ");
    let expires_str = expires.format("%Y-%m-%dT%H:%M:%SZ");
    let msg_id = Uuid::new_v4();

    let mut rsts = String::new();
    for (idx, (address, policy)) in targets.iter().enumerate() {
        rsts.push_str(&format!(
            r#"<wst:RequestSecurityToken Id="RST{idx}"><wst:RequestType>http://schemas.xmlsoap.org/ws/2005/02/trust/Issue</wst:RequestType><wsp:AppliesTo><wsa:EndpointReference><wsa:Address>{}</wsa:Address></wsa:EndpointReference></wsp:AppliesTo><wsp:PolicyReference URI="{}"/></wst:RequestSecurityToken>"#,
            xml_escape(address),
            xml_escape(policy)
        ));
    }

    let device_token_xml = match device_da_token {
        Some(da) => format!(
            r#"<wsse:BinarySecurityToken Id="DeviceDAToken" ValueType="urn:passport:compact">{}</wsse:BinarySecurityToken>"#,
            xml_escape(da)
        ),
        None => String::new(),
    };

    format!(
        r#"<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd" xmlns:wsa="http://www.w3.org/2005/08/addressing" xmlns:wst="http://schemas.xmlsoap.org/ws/2005/02/trust" xmlns:wsp="http://schemas.xmlsoap.org/ws/2004/09/policy" xmlns:ps="http://schemas.microsoft.com/Passport/SoapServices/PPCRL"><s:Header><wsa:Action s:mustUnderstand="1">http://schemas.xmlsoap.org/ws/2005/02/trust/RST/Issue</wsa:Action><wsa:To s:mustUnderstand="1">{RST2_URL}</wsa:To><wsa:MessageID>urn:uuid:{msg_id}</wsa:MessageID><ps:AuthInfo Id="PPAuthInfo"><ps:HostingApp>{STORE_CLIENT_ID}</ps:HostingApp><ps:BinaryVersion>6</ps:BinaryVersion><ps:UIVersion>1</ps:UIVersion><ps:Cookies/><ps:RequestParams>AQAAAAIAAABsYwQAAAAxMDMz</ps:RequestParams></ps:AuthInfo><wsse:Security><wsse:UsernameToken Id="user"><wsse:Username>{}</wsse:Username><wsse:Password>{}</wsse:Password></wsse:UsernameToken>{device_token_xml}<wsu:Timestamp Id="Timestamp"><wsu:Created>{created_str}</wsu:Created><wsu:Expires>{expires_str}</wsu:Expires></wsu:Timestamp></wsse:Security></s:Header><s:Body><ps:RequestMultipleSecurityTokens Id="RSTS">{rsts}</ps:RequestMultipleSecurityTokens></s:Body></s:Envelope>"#,
        xml_escape(username),
        xml_escape(password)
    )
}

/// Parses `<wst:RequestSecurityTokenResponse>` blocks from an `RST2.srf` response XML.
pub fn parse_rst2_response(xml: &str) -> Result<Vec<Rst2Token>> {
    if xml.contains("<S:Fault") || xml.contains("<s:Fault") || xml.contains(":Fault>") {
        let reason = extract_xml_text(xml, "Text")
            .or_else(|| extract_xml_text(xml, "faultstring"))
            .unwrap_or_else(|| "Microsoft authentication rejected the request".into());
        if reason.to_ascii_lowercase().contains("expired")
            || reason.contains("800488")
            || reason.contains("PP_E_")
        {
            return Err(MsStoreError::AuthExpired);
        }
        return Err(MsStoreError::Protocol(format!("RST2 fault: {reason}")));
    }

    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut tokens = Vec::new();

    let mut in_rstr = false;
    let mut current_tag = String::new();
    let mut applies_to = String::new();
    let mut token = String::new();
    let mut binary_secret: Option<String> = None;
    let mut expires: Option<String> = None;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let name = local_name(e.name().as_ref());
                if name == "RequestSecurityTokenResponse" {
                    in_rstr = true;
                    applies_to.clear();
                    token.clear();
                    binary_secret = None;
                    expires = None;
                }
                current_tag = name;
            }
            Ok(Event::Text(e)) if in_rstr => {
                let text = e
                    .unescape()
                    .map_err(|err| MsStoreError::Protocol(format!("Invalid XML text: {err}")))?
                    .into_owned();
                if text.is_empty() {
                    continue;
                }
                match current_tag.as_str() {
                    "Address" if applies_to.is_empty() => applies_to = text,
                    "BinarySecurityToken" | "CipherValue" if token.is_empty() => token = text,
                    "BinarySecret" if binary_secret.is_none() => binary_secret = Some(text),
                    "Expires" if expires.is_none() => expires = Some(text),
                    _ => {}
                }
            }
            Ok(Event::End(ref e)) => {
                let name = local_name(e.name().as_ref());
                if name == "RequestSecurityTokenResponse" && in_rstr {
                    in_rstr = false;
                    if !token.is_empty() {
                        tokens.push(Rst2Token {
                            applies_to: applies_to.clone(),
                            token: Zeroizing::new(token.clone()),
                            binary_secret_b64: binary_secret.take().map(Zeroizing::new),
                            expires: expires.take(),
                        });
                    }
                }
                current_tag.clear();
            }
            Ok(Event::Eof) => break,
            Err(err) => {
                return Err(MsStoreError::Protocol(format!(
                    "Malformed RST2 XML response: {err}"
                )))
            }
            _ => {}
        }
        buf.clear();
    }

    Ok(tokens)
}

/// Extracts the inner text of the first XML element whose local name matches `target`.
pub fn extract_xml_text(xml: &str, target: &str) -> Option<String> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut matched = false;
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                matched = local_name(e.name().as_ref()) == target;
            }
            Ok(Event::Text(e)) if matched => {
                if let Ok(text) = e.unescape() {
                    let trimmed = text.trim();
                    if !trimmed.is_empty() {
                        return Some(trimmed.to_string());
                    }
                }
            }
            Ok(Event::End(_)) => matched = false,
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    None
}

fn local_name(raw: &[u8]) -> String {
    let s = std::str::from_utf8(raw).unwrap_or_default();
    s.rsplit(':').next().unwrap_or(s).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use cbc::Encryptor;
    use cipher::BlockEncryptMut;
    use rsa::pkcs1v15::VerifyingKey;
    use rsa::signature::Verifier;

    #[test]
    fn sp800_108_kdf_is_deterministic_and_supports_multi_block() {
        let k1 = sp800_108_kdf_sha256(b"secret", "WS-SecureConversation", b"nonce-1", 32).unwrap();
        let k2 = sp800_108_kdf_sha256(b"secret", "WS-SecureConversation", b"nonce-1", 32).unwrap();
        let k3 = sp800_108_kdf_sha256(b"secret", "WS-SecureConversation", b"nonce-2", 32).unwrap();
        assert_eq!(*k1, *k2);
        assert_ne!(*k1, *k3);
        let k64 = sp800_108_kdf_sha256(b"secret", "label", b"ctx", 64).unwrap();
        assert_eq!(k64.len(), 64);
        assert!(sp800_108_kdf_sha256(b"secret", "label", b"ctx", 0).is_err());
    }

    #[test]
    fn decrypts_aes256_cbc_cipher_value() {
        let key = [0x33u8; 32];
        let iv = [0x44u8; 16];
        let msg = b"<Token>secret-payload</Token>";
        let mut buf = vec![0u8; msg.len() + 16];
        buf[..msg.len()].copy_from_slice(msg);
        let ct = Encryptor::<Aes256>::new_from_slices(&key, &iv)
            .unwrap()
            .encrypt_padded_mut::<Pkcs7>(&mut buf, msg.len())
            .unwrap();
        let mut combined = iv.to_vec();
        combined.extend_from_slice(ct);
        let plain = decrypt_cipher_value(&key, &B64.encode(&combined)).unwrap();
        assert_eq!(plain.as_slice(), msg);
    }

    #[test]
    fn signs_xml_with_rsa_and_hmac() {
        let mut rng = rand::thread_rng();
        let key = RsaPrivateKey::new(&mut rng, 1024).unwrap();
        let signed_info = "<SignedInfo><DigestValue>abc</DigestValue></SignedInfo>";
        let sig_b64 = sign_xml_rsa_sha256(&key, signed_info);
        let sig_bytes = B64.decode(&sig_b64).unwrap();
        let verifier = VerifyingKey::<Sha256>::new(key.to_public_key());
        let sig = rsa::pkcs1v15::Signature::try_from(sig_bytes.as_slice()).unwrap();
        verifier.verify(signed_info.as_bytes(), &sig).unwrap();

        let hmac_sig = sign_xml_hmac_sha256(b"hmac-key", signed_info).unwrap();
        assert_eq!(hmac_sig.len(), 44);
    }

    #[test]
    fn parses_rst2_tokens_and_faults() {
        let xml = r#"
        <S:Envelope xmlns:S="http://www.w3.org/2003/05/soap-envelope"
                    xmlns:wst="http://schemas.xmlsoap.org/ws/2005/02/trust"
                    xmlns:wsa="http://www.w3.org/2005/08/addressing"
                    xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"
                    xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
          <S:Body>
            <wst:RequestSecurityTokenResponseCollection>
              <wst:RequestSecurityTokenResponse>
                <wsp:AppliesTo xmlns:wsp="http://schemas.xmlsoap.org/ws/2004/09/policy">
                  <wsa:EndpointReference><wsa:Address>www.microsoft.com</wsa:Address></wsa:EndpointReference>
                </wsp:AppliesTo>
                <wst:Lifetime><wsu:Expires>2026-12-01T00:00:00Z</wsu:Expires></wst:Lifetime>
                <wst:RequestedSecurityToken>
                  <wsse:BinarySecurityToken>t=COMPACT_TOKEN</wsse:BinarySecurityToken>
                </wst:RequestedSecurityToken>
                <wst:RequestedProofToken>
                  <wst:BinarySecret>BASE64SECRET</wst:BinarySecret>
                </wst:RequestedProofToken>
              </wst:RequestSecurityTokenResponse>
            </wst:RequestSecurityTokenResponseCollection>
          </S:Body>
        </S:Envelope>"#;
        let tokens = parse_rst2_response(xml).unwrap();
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].applies_to, "www.microsoft.com");
        assert_eq!(tokens[0].token.as_str(), "t=COMPACT_TOKEN");
        assert_eq!(
            tokens[0].binary_secret_b64.as_deref().map(String::as_str),
            Some("BASE64SECRET")
        );

        let fault = r#"<S:Envelope xmlns:S="http://www.w3.org/2003/05/soap-envelope"><S:Body><S:Fault><S:Reason><S:Text>Token expired 80048821</S:Text></S:Reason></S:Fault></S:Body></S:Envelope>"#;
        assert!(matches!(
            parse_rst2_response(fault),
            Err(MsStoreError::AuthExpired)
        ));
    }
}
