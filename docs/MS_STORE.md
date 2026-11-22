# Microsoft Store / Xbox PC (GDK / MSIXVC) Pipeline

Orbit integrates **Microsoft Store and PC Game Pass (GDK / MSIXVC)** titles natively into its
macOS Apple Silicon Windows pipeline alongside Steam and Xbox Cloud Gaming.

## Architecture Overview

1. **Clean-Room Protocol Crate (`apps/desktop/src-tauri/crates/orbit-msstore/`)**
   - `clep.rs` — CLEP V2/V4 hardware challenge codec and AES-128-CBC zero-IV unpacking for
     `EncryptedDeviceKey`, `ClepHmacState`, and `ClepSignState` (`RSA2`/`RSA3` BCrypt blobs).
   - `splicense.rs` — bounds-checked `SPLicenseBlock` TLV parser and RFC 3394 AES-128 Key Unwrap
     producing `Zeroizing<[u8; 32]>` Content Integrity Keys (CIKs).
   - `soap.rs` — WS-Trust `deviceaddcredential.srf` / `RST2.srf` envelopes, NIST SP 800-108
     CTR-mode HMAC-SHA256 key derivation, XMLDSig signing, and AES-256-CBC `<CipherValue>` decryption.
   - `catalog.rs` — PC Game Pass SIGL (`fdd9e2a7-f7a0-47ac-b0a5-96a2048d52a0`), DisplayCatalog
     metadata (`ContentId`, `PackageFamilyName`, `InstallSize`), owned consumer collections,
     `packagespc.xboxlive.com/GetBasePackage/{contentId}`, and `licensing.mp.microsoft.com`
     v7.0 content licenses + v8.0 runtime license tokens.
   - `manifest.rs` — bounded (`≤ 256 KiB`) `MicrosoftGame.config` parser with strict relative-path
     traversal validation.
   - `msixvc.rs` — IEEE 1619-2007 XTS-AES-128 page decryption, XVD header + SHA-256 Merkle hash
     tree verification, streaming HTTP Range extraction, `keep_encrypted` preservation on disk,
     and runtime decryption into a caller-provided writer.

2. **Authentication & Security (`services/msstore_auth.rs`)**
   - Keeps Orbit's existing Xbox Cloud Gaming OAuth2 device-code session (`session.json`) untouched.
   - Uses a locked-down Tauri 2 `WebviewWindow` (`InlineLogin.srf`) with strict HTTPS Microsoft host
     allowlisting (`login.live.com`, `login.microsoftonline.com`, `account.live.com`, `msftauth.net`,
     `msauth.net`).
   - Persists `msstore_device.json` and `msstore_session.json` mode `0600` under
     `~/Library/Application Support/Orbit/xbox/`, refuses symlinks, zeroizes secret memory buffers,
     and never logs or returns tokens to the frontend.

3. **Streaming Installation, Queue, Storage & Uninstall**
   - `services/msstore_download.rs` streams ranges directly from allowlisted Microsoft CDN hosts
     into `<runtimes>/containers/games/msstore-<productId>/install/` (This Mac) or
     `<pickedRoot>/Orbit Games/msstore/<productId>/` (external drives).
   - Assets are decrypted on the fly (avoiding 2× disk space duplication), while `keep_encrypted`
     executables remain encrypted on disk alongside `.orbit-msixvc-header.bin` and
     `.orbit-msixvc-files.json` (which never store keys).
   - Shares Orbit's unified FIFO download queue (`services/download_queue.rs` with
     `DownloadProvider::MsStore`), `install_locations.rs`, `install_roots.rs`, `storage.rs`, and
     allowlisted `uninstall::msstore_removal_plan`.

4. **Orbit Wine Launch, Ephemeral RAM Disk & Private IPC (`services/msstore_play.rs`, `services/msstore_ipc.rs`)**
   - `scripts/wine/patches/0003-ntdll-WINE_DLL_FILE_MAP.patch` adds `open_mapped_dll_file` to
     Orbit Wine's `dlls/ntdll/unix/loader.c` (`runtimes/wine_capabilities.rs` probes `msstore_file_map`).
   - LGPL-2.1 `xgameruntime.dll` is managed as `ComponentKind::XgameRuntime` (`"xgameruntime"`)
     and staged into the container's `drive_c/windows/system32/xgameruntime.dll` with
     `WINEDLLOVERRIDES="xgameruntime=n,b"`.
   - At launch, `RamDiskGuard` allocates a bounded ephemeral macOS RAM disk (`hdiutil` + `newfs_hfs`
     - `mount -o nobrowse,noatime,nosuid,nodev`, capped at 2 GiB), decrypts `keep_encrypted` files
       into unlinked temp files on the RAM disk, verifies decrypted `MZ`/`PE\0\0` headers, clears
       `FD_CLOEXEC`, passes descriptors via engine-controlled `WINE_DLL_FILE_MAP`, and guarantees
       `umount -f` + `hdiutil detach -force` on exit or `Drop`.
   - `MsStoreIpcServer` serves Xodus XML/Proto IPC frames (`PING`/`PONG`, `MSA_TOKEN_REQUEST`,
     `XUSER_INFO_REQUEST`, `XSTORE_LICENSE_REQUEST`) over a private mode `0600` per-session Unix
     domain socket (falling back to a private mode `0700` short path under `/tmp` when the
     container path would exceed macOS's 104-byte `SUN_LEN`), cleaning up on `Drop`.

## Compatibility Boundaries

- Targets **GDK `MSIXVC` (v1)** PC titles without kernel-level anti-cheat.
- Legacy UWP (`EAPPX` / `EMSIX`) packages and kernel anti-cheat titles remain unsupported on macOS/Wine.
- GDK runtime API coverage tracks upstream LGPL-2.1 `xgameruntime.dll` updates independently of Orbit Wine.
