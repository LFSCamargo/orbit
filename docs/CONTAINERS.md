# Orbit Wine containers

Windows games run in Orbit-owned Wine prefixes: one slim **base** per Wine install
(`bases/<wine-key>/prefix`), then a per-game clone with read-only `drive_c/windows`
system directories (`system32`, `syswow64`, `winsxs`, `resources`, `Microsoft.NET`,
`globalization`) leaf-symlinked from that base. Graphics PE files are copied (never linked) into
`drive_c/windows/system32`. Valve's Steam client binaries are leaf-symlinked from the signed-in
`steam-windows` prefix (or shared `runtimes/steam-client` cache) and never copied into game containers.

A container keeps the same client version as its source. When its
`package/*.installed` records differ (a container linked from an older client),
the read-only client files are re-linked from `steam-windows`, so `steam.exe`, its DLLs and
`package/` match. Without this, a newer `steam.exe` started against an older
`steamui.dll` stops with "steamui.dll not found", since Orbit holds Steam's
self-updater off. `config/`, `userdata/`, `steamapps/`, logs, caches and sentry
files stay per-container, and disposable caches are pruned.

Code: `apps/desktop/src-tauri/src/runtimes/containers/`.
On disk: `runtimes/containers/bases/<wine-key>/` and
`runtimes/containers/games/<game-id>/`.

## First launch

1. **Container** — clone the slim per-Wine base prefix (`bases/<wine-key>/prefix`)
   and leaf-symlink read-only `drive_c/windows` system folders.
2. **Compatibility** — link GPTK / DXMT / DXVK DLLs into the container and set
   `WINEMSYNC` when the user chose MSync.
3. **Steam** — link Valve's `steam.exe`, DLLs, and assets from `steam-windows`
   (or `runtimes/steam-client`) into the container using symlinks. Source `steam-windows` stays untouched.
4. **Cloud** — clone that title's `userdata/<id>/<app>/remote` folder when it
   already exists in `steam-windows`.
5. **Login** — sign the container's silent Steam in using the saved `client`-audience
   token (DPAPI-wrapped per container in `local.vdf` ConnectCache), streaming live
   startup sub-stages on Step 7. If Valve refuses the token, Orbit invalidates the
   rejected session first (`native-session.json`, `steam-windows`, container, and
   `steam-sync`), force-stops Steam immediately without waiting for `-shutdown`, and
   asks for **Settings → Steam**. There is no resident shared Steam client.
6. **Start** — launch the game executable in the container with `SteamAppId`.

Downloads use SteamCMD into `runtimes/containers/games/steam-{appId}/install/`
only when Orbit's SteamCMD config already has a saved login. Installed games
are recognized from library folders, that container directory, and older
`steam-windows/games/` copies without `steam.exe`. A library folder that lost
its `appmanifest_<id>.acf` is still found: the signed-in client's
`appcache/appinfo.vdf` names the install folder (`crates/orbit-steam` `appinfo`),
matched exactly, then ignoring case and repeated spaces. "Scan installed games" imports
such installs too, using the owned catalog. Play clones the Wine prefix
beside the install. `steam-windows` is a login seed and SteamCMD cache, never
a wipe, and is not a live `steam.exe` session.

## Wine

CrossOver-class Wine (MSync + macdrv Metal views + D3DMetal) is required for
GPTK titles. `scripts/wine/build.sh` builds it from the pinned CrossOver 26.3.0
sources into `runtimes/components/orbit-wine/<version>/`; Play uses the newest
one that passes `runtimes/wine_capabilities.rs`, and otherwise falls back to the
Steam sign-in Wine. For D3DMetal Orbit exports GPTK's `libd3dshared.dylib` as
`CX_APPLEGPTK_LIBD3DSHARED_PATH`, the framework as `D3DMETAL_FRAMEWORK_PATH`,
and its libraries as `WINEDLLPATH_PREPEND` (Orbit Wine patch) so they win over
Wine's builtins. For DLSS (Super Resolution and Frame Generation via MetalFX), Orbit copies
Apple's opt-in `nvngx-on-metalfx.dll` as `nvngx.dll` plus `nvapi64.dll` into
system32 and stages both `x86_64-windows/nvngx.dll` and a symlinked
`x86_64-unix/nvngx.so` (pointing to canonical `libd3dshared.dylib`) under the
prefix's `.orbit/d3dmetal-dlss` DLL path so Wine initializes the builtin Unix
call table cleanly. Orbit lets D3DMetal manage NVIDIA (`0x10de`/`0x2684`) vs AMD
Compatibility Mode identity from `D3DM_ENABLE_METALFX` rather than forcing
`D3DM_VENDOR_ID` unconditionally. With DLSS enabled, launch also sets the
prefix's `NGXCore\FullPath` to `C:\windows\system32` for NGX discovery. The
shared GPTK component is never renamed or modified.
Everything on a container's wineserver shares one sync mode
(`WINEMSYNC=1` exactly when the Wine has MSync); a mismatch makes the game exit 1.
The Steam login is DPAPI-wrapped with the container's own Wine on each Play,
because a blob from another Wine build does not unwrap. A Wine change keeps the
prefix (saves included) and detaches system DLL links that leave it, since
Wine's prefix update writes through them. GPTK packages remain user-imported.

### Distribution

Orbit Wine is published as GitHub releases of this repository, tagged
`orbit-wine-v<version>` and never marked latest. It is built locally on a Mac
with `scripts/wine/build.sh`, packaged with `scripts/wine/package.sh` and published with
`gh release` (see `scripts/wine/README.md`):
`orbit-wine-<version>.tar.zst` (`<version>/Orbit Wine.app`), the matching
sources and patches (LGPL), and `orbit-wine.json` (version, url, size, SHA-256,
sources). Onboarding's Setup installs it (`runtimes/orbit_wine.rs`): it reads
the newest release from the GitHub API, accepts only this repository's release
downloads with a SHA-256 under GitHub's 2 GB asset limit, streams the archive to
disk while hashing, unpacks it with the component store's safe extractor into
`components/orbit-wine/<version>/`, rejects a build that fails the
CrossOver-class probe, registers the bundle with LaunchServices, then prepares
the base container (`containers::prepare_base`) so a game's first Play only
clones it.

Orbit Wine is installed as `Orbit Wine.app` (games category) so macOS Game Mode
boosts the game: every Wine process runs from `Contents/MacOS/wine`.

## One Steam client

`services/steam_resident.rs` keeps at most one Orbit Steam running. A game's
container keeps its Steam logged on after the game exits, so relaunching it
skips Steam's startup (seconds instead of ~40 s). Starting another container's
Steam stops the others (and the Settings sign-in client unless its window is
open), and quitting Orbit stops all of them except the one a still-running game
uses. Wine hides a process's environment, so Windows processes are matched by a
working directory inside the prefix and the wineserver by its `WINEPREFIX`.
`steam.exe -shutdown` is only sent to a client that is running; sent to none, it
started Steam.

## Steam play options

Before a container's Steam starts, `services/steam_play_config.rs` writes its
own `userdata/<account>/config/localconfig.vdf` (Steam rewrites it on exit, and
the Mac Steam client is never touched): `EnableGameOverlay` from Settings →
Steam → "Steam overlay in games" (off by default; it hooks every frame),
`EnableShaderBackgroundProcessing` 0, and per game `UseSteamControllerConfig`
(2 on, 0 off) from "Steam Input for controllers" (off by default: under Wine
and Rosetta it translates every controller report inside Steam and stutters
games; winebus already gives the game the pad as XInput). A file Orbit
cannot round-trip, or one over 256 KB, is left alone.

While a container game plays, `services/steam_helper_priority.rs` moves that
container's `steamwebhelper` processes (Steam's Chromium, matched by
`WINEPREFIX=` in their environment and by the executable name
`steamwebhelper.exe` or `steamwebhelper-orbit-original.exe`) to macOS
background priority (`setpriority(PRIO_DARWIN_PROCESS, PRIO_DARWIN_BG)`:
efficiency cores, throttled I/O). Under Wine and Rosetta the helper wakes on
saves, achievements and cloud sync, and its bursts dropped frames.
`steam.exe` (the game's Steamworks peer, called through `steam_api64.dll`
every frame) and the wineserver keep their priority: `steam.exe` at
background priority stalled those calls and controller input lagged. The
hidden-client library also covers the renamed original browser helper so it
cannot claim a second Dock entry. The session monitor sweeps 2 s and 10 s after
start, then once a minute for a restarted helper; the session's end restores
normal priority for the resident client.

## Controllers in games

Games see controllers through Wine's `winebus`. On macOS its IOHID backend
only passes a HID gamepad through when SDL is off, so a Wine built without SDL
drops every generic Bluetooth or USB controller, and XInput (most Steam games)
sees nothing. Steam Input cannot help: the container's Steam reads controllers
through the same `winebus`. Orbit Wine is therefore built with SDL
(`scripts/wine/build.sh`, SDL2 2.32.8 headers against the Gcenx bundle's
x86_64 `libSDL2`). SDL maps each controller it knows to an XInput gamepad
(`WINEXINPUT\...&IG_00`) and the raw HID copy is suppressed, so one
controller shows up once.

`runtimes/wine_capabilities.rs` reports `controllers` when `winebus.so` has the
SDL backend, and Play prefers such an Orbit Wine over a newer one without it.

Known limit: a receiver that reports a vendor HID page instead of a gamepad
(for example the 8BitDo Ultimate 2 2.4 GHz receiver, `2DC8:6013`, usage page
`0xFFA0`) is not a controller to macOS, its GameController framework, or SDL
2.32, so no Wine setting can pass it to a game. Bluetooth works for that pad.

To check what a Wine passes through, run it in a throwaway prefix with
`WINEDEBUG=+hid,+plugplay` and look for `sdl_add_device ... is_gamepad 1` and a
`WINEXINPUT` device per controller. `SDL support not compiled in!` means the
build drops controllers.

**XInput-only USB pads and 2.4 GHz dongles** (8BitDo Ultimate 2C receiver
`2DC8:310A`, EasySMX and other third-party Xbox 360 pads) have only a vendor
interface (class `0xFF`/`0x5D`/`0x01`), no HID one, so IOHID and SDL never
see them. Containers get no USB access. Orbit reads such a pad natively
(`platform/macos/xinput_usb.rs`) and keeps it while a Windows game plays; the
game gets it through the **pad bridge**: Orbit writes the pad into a 64-byte
shared file (`runtimes/controllers/pad-0`, named to Wine as
`ORBIT_PAD_BRIDGE` by `runtimes/controllers.rs`; layout in
`platform/macos/pad_bridge.rs`), and Orbit Wine's SDL
(`scripts/wine/build-sdl2.sh`, `scripts/wine/patches/sdl2`, no libusb) shows
winebus an SDL virtual Xbox 360 gamepad (`045E:028E`) while the file says
connected, so the game sees `WINEXINPUT\...&IG_00` as for a Bluetooth pad.
Orbit connects it only while a game plays, so a resident Steam between games
sees no pad; Guide stays Orbit's Home and is not passed on; the game's rumble
comes back through the file and Orbit sends it to the pad from its own writer
thread (latest speeds win), so a rumble change never delays the next input
read. For the whole local session Orbit holds a latency-critical activity
(`platform/macos/app_nap.rs`), also while the pad is missing, so App Nap never
throttles the minimized app or its reconnect scan, and the reader thread runs
at the user-interactive QoS. A USB scan runs once per second without a pad and
every 100 ms, for the rest of the session, once a game has had the pad. A read
error shorter than 100 ms keeps the held input (a quiet pad reports only
changes); a longer one releases it to neutral. An ordinary read timeout
preserves held input. Orbit skips menu-state decoding during play. A failed
read is retried for up to a second (only an unplug or another owner ends it at
once), and a pad that drops out mid-game stays connected to the game, neutral,
until reconnection or session exit. SDL reopens the file
every second until it exists. `build-sdl2.sh --install` puts this SDL into an
installed Orbit Wine (the replaced copy stays as `libSDL2-2.0.0.dylib.gcenx`).
A libusb SDL inside Wine was tried and removed: it fought Orbit and the
container's Steam for the one interface owner, and that Steam's Steam Input
opened Big Picture. A virtual HID device would need Apple's restricted
`com.apple.developer.hid.virtual.device` entitlement (an ad-hoc signed process
holding it is killed at launch). A macOS game, or Steam for Mac, reads USB pads
itself: Orbit lends the interface for one (`lend_to_game`) until it ends.

Orbit's helper Steams, the background library sync (`steam-sync`) and the
sign-in client (`steam-windows`), start with `WINEDLLOVERRIDES=winebus.sys=d`
(`steam_windows::steam_runtime_command`, `steam_login`): they have no game to
give a pad to, and their Steam Input opened Big Picture on the Guide button.

## Native Steam client

`crates/orbit-steam` holds session, product, owned-library, depot, cloud, and
agent types. `services/steam_native/` reads the saved Windows login, plans
SteamCMD downloads, and maps Steam Cloud files into the container. Passwords
never enter that crate. Depot HTTP download (replacing SteamCMD at runtime) is
the next executor behind the same `DepotPlan`.
## Audio in games

Wine's shared-mode audio buffer is 3 periods (30 ms). Under Rosetta a game's
audio thread often misses a 10 ms deadline, the buffer runs dry, and every
game crackled and distorted. Orbit Wine's `mmdevapi`
(`scripts/wine/patches/0003-mmdevapi-orbit-audio-buffer.patch`) raises the
smallest shared-mode buffer to `ORBIT_AUDIO_BUFFER_MS` (clamped to 10..500;
unset keeps Wine's), and every container process gets 60
(`runtimes/audio.rs`, about 30 ms more latency). A game's own value wins. To
patch an installed Orbit Wine without a full build, rebuild
`dlls/mmdevapi/{x86_64,i386}-windows/mmdevapi.dll` in the build tree and copy
them into `Contents/lib/wine/` (then re-sign the bundle).

