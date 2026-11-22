# Orbit Wine containers

Windows games run in Orbit-owned Wine prefixes: one **base** per Wine install,
then a cheap **per-game clone**. Graphics PE files are copied (never linked) into
`drive_c/windows/system32`. Valve's Steam client is seeded from the signed-in
`steam-windows` prefix and is never deleted.

A container keeps the same client version as that seed. When its
`package/*.installed` records differ (a container cloned from an older client),
the client files are copied again from the seed, so `steam.exe`, its DLLs and
`package/` match. Without this, a newer `steam.exe` started against an older
`steamui.dll` stops with "steamui.dll not found", since Orbit holds Steam's
self-updater off. `config/`, `userdata/`, `steamapps/`, logs, caches and sentry
files stay.

Code: `apps/desktop/src-tauri/src/runtimes/containers/`.
On disk: `runtimes/containers/bases/<wine-key>/` and
`runtimes/containers/games/<game-id>/`.

## First launch

1. **Container** — clone the signed-in Steam prefix (Steam titles) or wineboot a
   base prefix (manual `.exe`), then clone it for the game.
2. **Compatibility** — link GPTK / DXMT / DXVK DLLs into the container and set
   `WINEMSYNC` when the user chose MSync.
3. **Steam** — Settings opens Valve's `steam.exe` in `steam-windows` only long
   enough to save the account, then Orbit stops that Wine process. Play
   downloads Valve's client into the shared `runtimes/steam-client` cache and
   links it into the container. Source `steam-windows` stays in place.
4. **Login** — the saved window login is what the in-container agent uses: a
   client-audience token read from `config.vdf` or unwrapped from the
   `steam-windows` `local.vdf` ConnectCache. A website or QR sign-in is not
   used. If that login is missing, Play asks for
   Settings → Steam. There is no resident shared Steam client.
5. **Cloud** — clone that title's `userdata/<id>/<app>/remote` folder when it
   already exists in `steam-windows`.
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
Wine's builtins. Everything on a container's wineserver shares one sync mode
(`WINEMSYNC=1` exactly when the Wine has MSync); a mismatch makes the game exit 1.
The Steam login is DPAPI-wrapped with the container's own Wine on each Play,
because a blob from another Wine build does not unwrap. A Wine change keeps the
prefix (saves included) and detaches system DLL links that leave it, since
Wine's prefix update writes through them. GPTK packages remain user-imported.

### Distribution

Orbit Wine is published as GitHub releases of this repository, tagged
`orbit-wine-v<version>` and never marked latest. The `Orbit Wine` workflow
(`.github/workflows/orbit-wine.yml`, run by hand) builds it with
`scripts/wine/build.sh` and packages it with `scripts/wine/package.sh`:
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

## Native Steam client

`crates/orbit-steam` holds session, product, owned-library, depot, cloud, and
agent types. `services/steam_native/` reads the saved Windows login, plans
SteamCMD downloads, and maps Steam Cloud files into the container. Passwords
never enter that crate. Depot HTTP download (replacing SteamCMD at runtime) is
the next executor behind the same `DepotPlan`.
