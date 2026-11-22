//! Per-session private Unix domain socket IPC server for LGPL-2.1 `xgameruntime.dll`.
//!
//! Speaks the Xodus framing protocol (`XML_MAGIC = 0x58445358`, `PROTO_MAGIC = 0x58445350`)
//! over a private mode `0600` socket inside the game container (`<container>/xodus.sock`)
//! rather than a world-readable `/tmp/xodus.sock`. Always replies with structured errors
//! instead of panicking, and removes the socket file on `Drop`.

use std::io::{Read, Write};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

use orbit_msstore::soap::{extract_xml_text, xml_escape};

pub const XML_MAGIC: u32 = 0x5844_5358; // "XDSX"
pub const PROTO_MAGIC: u32 = 0x5844_5350; // "XDSP"

pub const MSG_PING: u16 = 1;
pub const MSG_PONG: u16 = 2;
pub const MSG_MSA_TOKEN_REQUEST: u16 = 3;
pub const MSG_MSA_TOKEN_RESPONSE: u16 = 4;
pub const MSG_XUSER_INFO_REQUEST: u16 = 5;
pub const MSG_XUSER_INFO_RESPONSE: u16 = 6;
pub const MSG_XSTORE_LICENSE_REQUEST: u16 = 7;
pub const MSG_XSTORE_LICENSE_RESPONSE: u16 = 8;

/// Maximum payload length accepted on a single IPC frame (64 KiB).
const MAX_FRAME_LEN: usize = 64 * 1024;

/// Pluggable host callbacks served by the IPC bridge for one game session.
pub trait IpcBackend: Send + Sync + 'static {
    fn request_msa_token(&self, target: &str, policy: &str) -> Result<String, String>;
    fn user_profile(&self) -> (String, String);
    fn request_store_license(&self, product_id: &str) -> Result<String, String>;
}

/// Production backend backed by Orbit's `msstore_auth` and `orbit_msstore::catalog`.
pub struct OrbitMsStoreIpcBackend {
    pub session_dir: PathBuf,
    pub product_id: String,
    pub gamertag: String,
    pub xuid: String,
}

impl IpcBackend for OrbitMsStoreIpcBackend {
    fn request_msa_token(&self, target: &str, policy: &str) -> Result<String, String> {
        let token =
            crate::services::msstore_auth::exchange_user_token(&self.session_dir, target, policy)?;
        Ok(token.to_string())
    }

    fn user_profile(&self) -> (String, String) {
        (self.gamertag.clone(), self.xuid.clone())
    }

    fn request_store_license(&self, product_id: &str) -> Result<String, String> {
        let pid = if product_id.is_empty() {
            self.product_id.as_str()
        } else {
            product_id
        };
        let device_tok = crate::services::msstore_auth::device_ms_token(&self.session_dir)?;
        let user_tok = crate::services::msstore_auth::exchange_user_token(
            &self.session_dir,
            "www.microsoft.com",
            "MBI_SSL",
        )?;
        orbit_msstore::catalog::acquire_runtime_license_token(pid, &device_tok, &user_tok)
            .map_err(|e| e.to_string())
    }
}

/// Running per-session IPC server. Cleaned up automatically on `Drop`.
pub struct MsStoreIpcServer {
    socket_path: PathBuf,
    private_temp_dir: Option<PathBuf>,
    stop: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}

/// macOS `sockaddr_un.sun_path` is strictly 104 bytes; keep well under it.
const MAX_UNIX_SOCKET_PATH_BYTES: usize = 96;

impl MsStoreIpcServer {
    /// Binds a private mode `0600` Unix socket inside `container_dir` (`xodus.sock`),
    /// falling back to a private mode `0700` directory under `/tmp` when `container_dir`
    /// would exceed macOS's 104-byte `SUN_LEN` socket path limit.
    pub fn start(container_dir: &Path, backend: Arc<dyn IpcBackend>) -> Result<Self, String> {
        let candidate = container_dir.join("xodus.sock");
        let (socket_path, private_temp_dir) =
            if candidate.as_os_str().len() <= MAX_UNIX_SOCKET_PATH_BYTES {
                std::fs::create_dir_all(container_dir)
                    .map_err(|e| format!("Could not prepare IPC container dir: {e}"))?;
                (candidate, None)
            } else {
                let short_id = &uuid::Uuid::new_v4().simple().to_string()[..12];
                let temp_dir = PathBuf::from(format!("/tmp/orbit-ms-{short_id}"));
                if temp_dir
                    .symlink_metadata()
                    .is_ok_and(|meta| meta.file_type().is_symlink())
                {
                    return Err("Refusing to bind IPC socket inside a symlinked directory".into());
                }
                std::fs::create_dir_all(&temp_dir)
                    .map_err(|e| format!("Could not create private IPC dir: {e}"))?;
                std::fs::set_permissions(&temp_dir, std::fs::Permissions::from_mode(0o700))
                    .map_err(|e| format!("Could not lock private IPC dir permissions: {e}"))?;
                (temp_dir.join("x.sock"), Some(temp_dir))
            };
        if socket_path
            .symlink_metadata()
            .is_ok_and(|meta| meta.file_type().is_symlink())
        {
            return Err("Refusing to bind IPC socket over a symlink".into());
        }
        let _ = std::fs::remove_file(&socket_path);
        let listener = UnixListener::bind(&socket_path)
            .map_err(|e| format!("Could not bind Microsoft Store IPC socket: {e}"))?;
        std::fs::set_permissions(&socket_path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("Could not lock IPC socket permissions: {e}"))?;
        listener
            .set_nonblocking(true)
            .map_err(|e| format!("Could not configure IPC socket: {e}"))?;

        let stop = Arc::new(AtomicBool::new(false));
        let stop_flag = Arc::clone(&stop);
        let worker = thread::spawn(move || accept_loop(listener, backend, stop_flag));

        Ok(Self {
            socket_path,
            private_temp_dir,
            stop,
            worker: Some(worker),
        })
    }

    pub fn socket_path(&self) -> &Path {
        &self.socket_path
    }
}

impl Drop for MsStoreIpcServer {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        let _ = UnixStream::connect(&self.socket_path);
        if let Some(handle) = self.worker.take() {
            let _ = handle.join();
        }
        let _ = std::fs::remove_file(&self.socket_path);
        if let Some(dir) = self.private_temp_dir.take() {
            let _ = std::fs::remove_dir_all(dir);
        }
    }
}

fn accept_loop(listener: UnixListener, backend: Arc<dyn IpcBackend>, stop: Arc<AtomicBool>) {
    while !stop.load(Ordering::SeqCst) {
        match listener.accept() {
            Ok((stream, _)) => {
                let backend = Arc::clone(&backend);
                let stop_conn = Arc::clone(&stop);
                thread::spawn(move || handle_connection(stream, backend, stop_conn));
            }
            Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(25));
            }
            Err(_) => break,
        }
    }
}

fn handle_connection(mut stream: UnixStream, backend: Arc<dyn IpcBackend>, stop: Arc<AtomicBool>) {
    // macOS/BSD accepted sockets inherit nonblocking mode from the listener.
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));
    while !stop.load(Ordering::SeqCst) {
        let Some((magic, msg_type, payload)) = read_frame(&mut stream) else {
            break;
        };
        let (reply_type, reply_payload) = dispatch_message(magic, msg_type, &payload, &*backend);
        if write_frame(&mut stream, magic, reply_type, &reply_payload).is_err() {
            break;
        }
    }
}

/// Reads one 8-byte header + bounded payload from a Unix stream.
pub fn read_frame<R: Read>(reader: &mut R) -> Option<(u32, u16, Vec<u8>)> {
    let mut header = [0u8; 8];
    reader.read_exact(&mut header).ok()?;
    let magic = u32::from_le_bytes([header[0], header[1], header[2], header[3]]);
    if magic != XML_MAGIC && magic != PROTO_MAGIC {
        return None;
    }
    let msg_type = u16::from_le_bytes([header[4], header[5]]);
    let msg_len = u16::from_le_bytes([header[6], header[7]]) as usize;
    if msg_len > MAX_FRAME_LEN {
        return None;
    }
    let mut payload = vec![0u8; msg_len];
    if msg_len > 0 {
        reader.read_exact(&mut payload).ok()?;
    }
    Some((magic, msg_type, payload))
}

/// Writes one 8-byte header + payload to a Unix stream.
pub fn write_frame<W: Write>(
    writer: &mut W,
    magic: u32,
    msg_type: u16,
    payload: &[u8],
) -> std::io::Result<()> {
    let len = u16::try_from(payload.len())
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "frame too large"))?;
    let mut header = [0u8; 8];
    header[0..4].copy_from_slice(&magic.to_le_bytes());
    header[4..6].copy_from_slice(&msg_type.to_le_bytes());
    header[6..8].copy_from_slice(&len.to_le_bytes());
    writer.write_all(&header)?;
    if !payload.is_empty() {
        writer.write_all(payload)?;
    }
    writer.flush()
}

fn dispatch_message(
    _magic: u32,
    msg_type: u16,
    payload: &[u8],
    backend: &dyn IpcBackend,
) -> (u16, Vec<u8>) {
    match msg_type {
        MSG_PING => (MSG_PONG, b"<Pong/>".to_vec()),
        MSG_MSA_TOKEN_REQUEST => {
            let xml = std::str::from_utf8(payload).unwrap_or_default();
            let target = extract_xml_text(xml, "Target").unwrap_or_else(|| "www.microsoft.com".into());
            let policy = extract_xml_text(xml, "Policy").unwrap_or_else(|| "MBI_SSL".into());
            let reply = match backend.request_msa_token(&target, &policy) {
                Ok(token) => format!(
                    "<MSATokenResponse><Status>Ok</Status><Token>{}</Token></MSATokenResponse>",
                    xml_escape(&token)
                ),
                Err(err) => format!(
                    "<MSATokenResponse><Status>Error</Status><Error>{}</Error></MSATokenResponse>",
                    xml_escape(&err)
                ),
            };
            (MSG_MSA_TOKEN_RESPONSE, reply.into_bytes())
        }
        MSG_XUSER_INFO_REQUEST => {
            let (gamertag, xuid) = backend.user_profile();
            let reply = format!(
                "<XUserInfoResponse><Gamertag>{}</Gamertag><Xuid>{}</Xuid></XUserInfoResponse>",
                xml_escape(&gamertag),
                xml_escape(&xuid)
            );
            (MSG_XUSER_INFO_RESPONSE, reply.into_bytes())
        }
        MSG_XSTORE_LICENSE_REQUEST => {
            let xml = std::str::from_utf8(payload).unwrap_or_default();
            let product_id = extract_xml_text(xml, "ProductId").unwrap_or_default();
            let reply = match backend.request_store_license(&product_id) {
                Ok(license) => format!(
                    "<XStoreLicenseResponse><Status>Ok</Status><License>{}</License></XStoreLicenseResponse>",
                    xml_escape(&license)
                ),
                Err(err) => format!(
                    "<XStoreLicenseResponse><Status>Error</Status><Error>{}</Error></XStoreLicenseResponse>",
                    xml_escape(&err)
                ),
            };
            (MSG_XSTORE_LICENSE_RESPONSE, reply.into_bytes())
        }
        _ => (
            MSG_PONG,
            b"<Error>Unsupported IPC message type</Error>".to_vec(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FakeBackend {
        fail_token: bool,
    }

    impl IpcBackend for FakeBackend {
        fn request_msa_token(&self, target: &str, _policy: &str) -> Result<String, String> {
            if self.fail_token {
                Err("session expired".into())
            } else {
                Ok(format!("tok-for-{target}"))
            }
        }

        fn user_profile(&self) -> (String, String) {
            ("OrbitPlayer".into(), "2533274800000001".into())
        }

        fn request_store_license(&self, product_id: &str) -> Result<String, String> {
            Ok(format!("lic-{product_id}"))
        }
    }

    #[test]
    fn serves_ping_and_msa_tokens_over_private_0600_socket_and_cleans_up() {
        let dir = std::env::temp_dir().join(format!("orbit-ipc-{}", uuid::Uuid::new_v4()));
        let socket_path = {
            let server = MsStoreIpcServer::start(
                &dir,
                Arc::new(FakeBackend { fail_token: false }),
            )
            .unwrap();
            let path = server.socket_path().to_path_buf();
            let mode = std::fs::metadata(&path).unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o600);

            let mut client = UnixStream::connect(&path).unwrap();
            write_frame(&mut client, XML_MAGIC, MSG_PING, b"").unwrap();
            let (magic, ty, body) = read_frame(&mut client).unwrap();
            assert_eq!(magic, XML_MAGIC);
            assert_eq!(ty, MSG_PONG);
            assert_eq!(body, b"<Pong/>");

            let req = b"<MSATokenRequest><Target>xboxlive.com</Target><Policy>MBI_SSL</Policy></MSATokenRequest>";
            write_frame(&mut client, XML_MAGIC, MSG_MSA_TOKEN_REQUEST, req).unwrap();
            let (_, ty, body) = read_frame(&mut client).unwrap();
            assert_eq!(ty, MSG_MSA_TOKEN_RESPONSE);
            let text = String::from_utf8(body).unwrap();
            assert!(text.contains("tok-for-xboxlive.com"));
            path
        };
        assert!(!socket_path.exists(), "socket must be unlinked on Drop");

        // Error response must never panic the server.
        let server = MsStoreIpcServer::start(&dir, Arc::new(FakeBackend { fail_token: true })).unwrap();
        let mut client = UnixStream::connect(server.socket_path()).unwrap();
        write_frame(
            &mut client,
            XML_MAGIC,
            MSG_MSA_TOKEN_REQUEST,
            b"<MSATokenRequest><Target>www.microsoft.com</Target></MSATokenRequest>",
        )
        .unwrap();
        let (_, ty, body) = read_frame(&mut client).unwrap();
        assert_eq!(ty, MSG_MSA_TOKEN_RESPONSE);
        assert!(String::from_utf8(body).unwrap().contains("session expired"));
        drop(server);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
