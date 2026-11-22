# Orbit updates

Orbit updates itself from the newest release on
[`LFSCamargo/orbit`](https://github.com/LFSCamargo/orbit/releases). Orbit Wine
releases are published with `--latest=false`, so `releases/latest` is always
the app.

## Flow

1. `services/app_update.rs` checks 30 s after start, then every 6 h, while
   **Settings → General → Update Orbit automatically** is on (`autoUpdateApp`
   in `app-preferences-v1`, on by default). **Check now** runs even when it is
   off. No background check or download starts while a game or cloud stream
   plays (`launching/game_activity.rs`).
2. `tauri-plugin-updater` reads
   `https://github.com/LFSCamargo/orbit/releases/latest/download/latest.json`,
   compares its semver with the running build, downloads the `.app.tar.gz`
   and checks its minisign signature against the public key in
   `tauri.conf.json` (`plugins.updater.pubkey`). A bad signature is refused and
   the archive is not kept.
3. The verified archive waits in memory. The UI announces it once (a toast,
   held back until a running game ends) and offers **Restart to update** in
   the Home menu (idle menu only) and Settings → General.
4. Restart installs it (the plugin swaps the `.app`, asking for an
   administrator password only when the app's folder is not writable) and
   relaunches. Restart is refused while a game runs. Quitting Orbit also
   installs a ready update, but only when no password prompt would appear.

Only the `.app` bundle is replaced. `~/Library/Application Support/Orbit/`
(library, settings, Steam sign-in, prefixes) is never touched.

A copy that cannot update itself reports why and links the GitHub release:
debug builds, apps run from a disk image or translocated by Gatekeeper (move
Orbit to Applications), and builds whose `tauri.conf.json` has no
`plugins.updater.pubkey`. Without that key the updater plugin is not
registered at all (`app_update::configured`), so local builds and forks start
normally instead of failing.

State reaches the UI as the `app-update` event and
`app_update_status`: `idle | checking | upToDate | downloading | ready |
unsupported | failed` (`types/appUpdate.ts`, `stores/appUpdate.store.ts`).

## Release artifacts

`scripts/release-macos.sh` with `TAURI_SIGNING_PRIVATE_KEY` set (CI) ships,
besides the `.dmg`:

- `Orbit-<v>-aarch64.app.tar.gz`: Tauri's signed updater archive.
- `Orbit-<v>-aarch64.app.tar.gz.sig`: its signature.
- `latest.json`, written by `scripts/updater-manifest.mjs`:

```json
{
  "version": "2.2.0",
  "notes": "…from .github/release-notes/2.2.0.md, else \"Orbit 2.2.0\"",
  "pub_date": "2026-11-21T12:00:00.000Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "<contents of the .sig>",
      "url": "https://github.com/LFSCamargo/orbit/releases/download/v2.2.0/Orbit-2.2.0-aarch64.app.tar.gz"
    }
  }
}
```

Without the key (local `yarn release:macos --install`), updater artifacts are
skipped and the archive is a plain `tar` of the app, as before. The release
workflow fails when the key secret is missing or `latest.json` / `.sig` were
not produced.

## Signing key

- Generate once: `yarn workspace @orbit/desktop tauri signer generate -w ~/.tauri/orbit-updater.key`.
- GitHub secrets: `TAURI_SIGNING_PRIVATE_KEY` (the key file's contents) and
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- The public key (`~/.tauri/orbit-updater.key.pub`) goes in
  `tauri.conf.json → plugins.updater.pubkey`. The private key is never
  committed.
- `requireSignedVersion` stays off: Tauri CLI 2.11 signs without recording
  the version in the signature's trusted comment, so requiring it would
  refuse every update. Once the CLI records it, turn it on in
  `plugins.updater`: it stops a tampered `latest.json` from pairing a new
  version number with an older signed archive (a downgrade). Until then that
  needs control of the release's `latest.json` on GitHub.
- Losing the private key, or rotating it, means installed copies refuse every
  new update: users install the next release manually once.

The first release with the updater must be installed by hand; versions before
it cannot update themselves.

## Testing locally

A debug build honours `ORBIT_UPDATE_ENDPOINT` (release builds ignore it):

1. Generate a throwaway key; put its public key in `tauri.conf.json`
   temporarily, with `"dangerousInsecureTransportProtocol": true` so the
   updater accepts the plain-http local server. Never commit either.
2. Build the newer version with `TAURI_SIGNING_PRIVATE_KEY` set and serve its
   `release/<v>/` with `python3 -m http.server 8765`, after pointing
   `latest.json`'s `url` at `http://127.0.0.1:8765/…`.
3. Run the older build with
   `ORBIT_UPDATE_ENDPOINT=http://127.0.0.1:8765/latest.json`, then check
   progress, the ready toast, Restart, and that Application Support is
   unchanged. A tampered archive must be refused.
