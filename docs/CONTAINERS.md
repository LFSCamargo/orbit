# Orbit Wine containers

Windows games run in Orbit-owned Wine prefixes: one **base** per Wine install,
then a cheap **per-game clone**. Graphics PE files are copied (never linked) into
`drive_c/windows/system32`. Valve's Steam client is seeded from the signed-in
`steam-windows` prefix and is never deleted.

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

## Native Steam client

`crates/orbit-steam` holds session, product, owned-library, depot, cloud, and
agent types. `services/steam_native/` reads the saved Windows login, plans
SteamCMD downloads, and maps Steam Cloud files into the container. Passwords
never enter that crate. Depot HTTP download (replacing SteamCMD at runtime) is
the next executor behind the same `DepotPlan`.
