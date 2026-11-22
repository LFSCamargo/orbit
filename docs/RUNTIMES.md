# Windows compatibility and game runtimes

## Managed macOS setup

**Settings → Compatibility** presents a single **Install compatibility** action
for the pinned Wine 11.0.1 runtime, plus per-component install buttons for each
item in the online catalog. Orbit downloads the pinned Wine 11.0.1 distribution
directly from its official Gcenx release, checks the exact SHA-256, extracts it
into a private staging folder, probes `wine --version`, and only then activates
it under Orbit's app data directory. The download is never mirrored in Orbit
releases. Failed or partial installs are not shown as ready and can be retried
safely.

The main flow does not ask users to understand Wine, Homebrew, prefixes, DXVK,
D3DMetal, or terminal commands. Existing distributions and executable paths are
available only under **Advanced runtime options**. Add game and Edit properties
automatically select the managed runtime after setup.

This managed installer is intentionally **macOS-only**. The native
`CompatibilityStatus.supported` system flag is backed by `cfg!(target_os =
"macos")`; unsupported systems receive no download action, and the Rust install
entry point independently refuses to run. The UI uses the same flag rather than
user-agent detection. No Linux or Windows installer layer is planned.

Downloads are bounded to 1 GiB and 15 minutes. Archive entries may be regular
files, directories, or internal Wine links. Absolute paths, parent traversal,
external link targets, devices, and FIFOs are rejected; `unpack_in` must confirm
every entry. Installation never requires administrator privileges or writes to
`/Applications`.

## Per-component installation

`runtimes/components.rs` manages a shared `components/` directory under Orbit's
runtime root. Each installed component writes an `orbit-component.json` manifest
and is keyed by `(component_id, version)`. Installable components:

- Wine Stable/Development/Staging from Gcenx builds.
- DXVK-macOS and DXMT graphics translation layers.
- MoltenVK (required by DXVK on macOS).

The UI exposes a download/install button on each catalog row, and every transfer
reports phase and percentage through one shared tracker.

## Download progress (reusable)

`src/lib/downloadProgress.ts` is the single store for background transfers.
Each task has a stable key (`component:<id>:<version>`, or `steam:<appId>` for
Steam Windows downloads), a label, a progress value
and a failure record. Tasks live in the store rather than in a component, so
navigating away from Settings keeps the bar visible and cannot restart a
download.

- Rust emits `Downloading { component, downloadedBytes, totalBytes }`,
  `Verifying`, `Extracting`, `Installing` and `Ready { component, message }`.
- `downloadPercent` clamps to 0-100 for any phase that reports bytes
  (Steam's `Verifying` and `Installing` may), returns 100 once `Ready`, and
  `null` while the amount of work is unknown. `downloadStatus` renders a
  sentence with the percentage and `x / y` in decimal units; an unknown total
  shows bytes so far instead of "0 of 0". `Installing { message }` shows the
  native step.
- `src/components/ui/progress-bar.tsx` is the styled track: a filled bar with
  `aria-valuenow`, or a sweeping indeterminate segment when the value is
  `null` (a pulse with Reduce Motion). `download-progress.tsx` wraps it with
  the live-region text; `RuntimeSettings`, every component row, details and
  the downloads sidebar use it.
- Finished tasks stay listed as completed until **Clear completed**;
  `selectBusy` and the toolbar dot count only running transfers.
- Download events are throttled to about one percent so a slow mirror cannot
  flood IPC, and the final byte count is always reported.

## Active component version

Several versions of a component can be installed side by side. Which one a
launch uses is a stored setting, not an accident of install order:

- `runtimes/selections.rs` keeps `windows-compatibility-active-components-v1`
  in SQLite as `component id -> installed version`.
- `set_active_component` rejects a version that is not in the component store,
  so the UI can never select something launch would fail to find.
- `resolve_profile` resolves the selections into a launch-only
  `WineProfile.selections` map (`#[serde(skip)]`, same treatment as the
  resolved settings). Because it is never written into the game's launch JSON,
  uninstalling or changing a version cannot corrupt an existing game.
- A stale selection (deleted version) falls back to the newest installed one
  instead of failing the launch.
- Choosing a version in the picker writes through immediately; browsing an
  uninstalled version only changes the view and shows the Install action.

The row that is showing is saved separately as
`windows-compatibility-component-views-v1` (`component_views` /
`set_component_view`). GPTK 4.0 beta packages share one installed version
string, so the launch selection alone cannot tell an evaluation download from
the complete toolkit. The saved row is what the picker restores after a tab
change. A closed selector cannot overwrite that row while its options are
still registering.

## Error handling

Failures name the file and the next action instead of surfacing a raw transport
error: timeouts state the minute budget, 404 says the package is no longer
published and to choose another version, 5xx says to retry later, truncated
downloads report the bytes received against the expected size, and an
unsupported container is rejected before Orbit downloads anything. Extraction
validation searches the archive for its markers (`wine`/`wine64` under a `bin`
directory, `libMoltenVK.dylib`, DXVK `x64|x32/d3d11.dll`, DXMT
`x86_64-windows` or `x64/d3d11.dll`) rather than assuming one
vendor layout, so a package whose contents do not match its advertised kind
explains what was missing. The UI shows the message inline with a **Retry**
button that clears the failure and re-runs the same task.

Installed graphics components unlock the matching backend in **Settings → Game
graphics**. `validate_launchable` rejects a backend unless its component is
installed, so selecting a backend alone never claims to enable DirectX
translation.

## Apple Game Porting Toolkit

The GPTK row is **versioned**. Orbit lists every Game Porting Toolkit version
available through its two legitimate sources:

1. **Community binary releases** (`Gcenx/game-porting-toolkit`) — every version
   tag, stable and beta, published as `game-porting-toolkit-<version>.tar.xz`
   with a GitHub-published SHA-256 digest. Orbit's verified downloader checks
   the exact digest before extraction and rejects packages that lack both the
   Wine binaries and `libD3DMetal.dylib`. These require the user to accept
   Apple's D3DMetal license. The current range is 1.1 through 3.0-3, including
   all 2.x/3.x betas; newer versions appear automatically in the picker.
2. **Apple's official Homebrew formula** (`apple/apple/game-porting-toolkit`) —
   listed as a separate "Apple official via Homebrew" version. Orbit detects
   Homebrew, taps `apple/apple`, installs the current formula, locates the Cellar
   payload, and registers it. This is the only Apple-sanctioned automated path
   and always tracks Apple's published version, not older ones.

Homebrew's tap ships only its current formula, so it cannot install historical
GPTK versions; the checksum-verified community packages provide that range.
The manual "Choose package…" path for a local Apple DMG or `redist/lib` folder
also remains available.

When a new GPTK release is published in either feed, it appears as another
versioned option automatically.

## Apple 3.x/4.x packages you already downloaded

GPTK 4.x betas (and Apple's own 3.0 package) are only available through Apple's
authenticated download, so they are never in any public release feed. Instead,
`runtimes/gptk_local.rs` **detects the DMGs you already own** and imports them:

- Scan is bounded (depth 1) over `~/Downloads`, matching Apple's
  `Game_Porting_Toolkit_<version>.dmg` and
  `Evaluation_environment_for_Windows_games_<version>.dmg` names. Size bounds and
  symlink rejection apply; only regular files are offered.
- When a filename matches a version pinned in `runtime-packages/gptk/manifest.json`,
  Orbit streams the file through SHA-256 and marks it verified before importing.
- Import mounts the DMG read-only with `hdiutil attach -nobrowse -readonly`,
  locates the `redist/lib` payload (descending into the evaluation DMG nested
  inside a complete toolkit), requires `D3DMetal.framework`/`libd3dshared.dylib`
  plus `wine/x86_64-windows/d3d11.dll`, and copies it with `ditto` so Apple's
  framework symlinks stay intact. `License.rtf`, `Acknowledgements.rtf` and
  `Read Me.rtf` are preserved beside the imported payload. Everything is detached
  and staging removed on both success and failure paths.
- Imported versions live under `runtimes/components/gptk/<version>` with the same
  manifest format as downloaded components, so D3DMetal unlocks identically.
- Opt-in verification on this machine: the 4.0 beta 3 evaluation DMG matched its
  pinned digest `afa311da…537c1d` and imported into a temporary root in 0.7s.

Orbit modifies nothing inside Apple's DMG and never uploads or mirrors it. The
`runtime-packages/gptk/` manifest is used only for digest pinning and the
`scripts/fetch-gptk.sh` helper remains available for local integrity checks.

## Online component catalog

`runtimes/catalog.rs` reads bounded pages from public GitHub release APIs for
Wine Stable/Development/Staging, DXVK-macOS, DXMT, MoltenVK, vkd3d-proton and
the versioned Gcenx Game Porting Toolkit releases. Drafts and incompatible
assets are skipped; public prereleases are included and labelled. Responses are
capped at 8 MiB, at most 1,000 releases per repository are read, and the merged
catalog is cached for six hours. Individual feed failures do not hide other
components. Tests use fixtures, never live APIs.

vkd3d-proton (DirectX 12 over Vulkan) installs from upstream `.tar.zst`
releases; Orbit extracts zstd archives alongside tar/tar.xz/tar.gz. When a DXVK
launch also has a vkd3d-proton selection, its `d3d12`/`d3d12core` DLLs are
installed beside DXVK's (DXVK keeps `dxgi`). zink (OpenGL over Vulkan) has no
single public macOS build feed: its catalog row is import-only, filled by
a manual path registration.

The older `runtime-packages/gptk/` mirror files and `scripts/fetch-gptk.sh` are
no longer surfaced in the main catalog; they remain in the repository for
reference and licensing preservation only.

## Global defaults and per-game overrides

`CompatibilitySettings` is stored once under the SQLite setting
`windows-compatibility-settings-v1`. Until a row is saved, launch uses the
built-in fresh-install defaults: Automatic graphics (which picks GPTK 4.0
beta 3 D3DMetal once the Apple package is imported), MSync, Rosetta AVX on,
MetalFX upscaling on, and a fixed 1920×1080 virtual desktop with Retina off.
Each `WineProfile.compatibility` contains
only explicit per-game overrides; missing fields inherit the current global
values at launch rather than copying them. The resolved settings are never
written back to the game's JSON.

Implemented launch behavior:

- Graphics: Automatic prefers GPTK (D3DMetal), then DXMT, then DXVK+MoltenVK.
  An explicit Wine choice stays Wine. Other backends are rejected until their
  component is installed; a menu selection alone never claims to enable DirectX
  translation.
- Synchronization: Default, ESync (`WINEESYNC`), or MSync (`WINEMSYNC`), mutually
  exclusive; the default is MSync. Wine builds without MSync support downgrade
  it at spawn. Explicit advanced environment values retain highest priority.
- Display is fixed to 1920×1080 for every launch. Orbit always writes Wine's
  `HKCU\Software\Wine\Mac Driver\RetinaMode=n`, `Explorer\Desktop=Orbit`, and
  `Explorer\Desktops\Orbit=1920x1080` values. Legacy global and per-game
  Automatic, high-resolution and custom-dimension values are normalized when
  loaded or resolved; they cannot bypass the launch boundary.
- Metal HUD (`MTL_HUD_ENABLED`) and Rosetta AVX (`ROSETTA_ADVERTISE_AVX`).
- Global saves return the canonical fixed-display settings. Display changes apply
  on new launches, not to an already running session.

Frame rate limit (`D3DM_MAX_FPS`, `DXMT_CONFIG`, `DXVK_FRAME_RATE`), MetalFX upscaling (on by default), and DXMT NVIDIA
extensions unlock when
D3DMetal, DXMT, or DXVK is installed. Automatic launch prefers GPTK, then DXMT,
then DXVK, and Play sanitizes options that do not apply to that engine; with no
MetalFX-capable engine installed, the upscaling default is dropped at launch
rather than failing the game. An
explicit Wine, DXMT, or DXVK choice still wins. Upscale ratio and the separate
frame-generation / frame-generation VSync switches stay disabled: DXMT has no
ratio control, and Apple's D3DMetal enables DLSS Frame Generation together with
`D3DM_ENABLE_METALFX=1` for games that ship `nvngx_dlssg.dll` (using Metal 4 on
macOS 27+, configurable via allowlisted `D3DM_MTL4`) with no separate
frame-generation or VSync override. `validate_launchable` still rejects an
option whose component or engine is missing. Play sanitizes leftover DXMT
NVIDIA, MetalFX, and frame-rate flags that do not apply to the resolved engine
instead of failing on the first overlay step. Advanced per-game environment
overrides allowlist `D3DM_MAX_FPS`, `D3DM_MTL4`, and `D3DM_SUPPORT_DXR`.

D3DMetal also accepts engine-style GPTK packages that ship a flat `wine/`
directory plus `external/libd3dshared.dylib`; that layout sets
`WINE_GPTK_LIBD3DSHARED_PATH` instead of relying on Apple's `@rpath`. Payloads
whose native bridge is ARM64-only (`aarch64-unix` without `x86_64-unix`) are
never selected: Orbit's Wine runs as x86_64 under Rosetta.

D3DMetal DLSS support is separate from DXMT spatial upscaling. When Apple's
opt-in files are present, Orbit copies `nvngx-on-metalfx.dll` as `nvngx.dll` and
`nvapi64.dll` into system32, and stages both `x86_64-windows/nvngx.dll` (copy)
and `x86_64-unix/nvngx.so` (symlink to the canonical GPTK `libd3dshared.dylib`
on Unix) inside the prefix-owned `.orbit/d3dmetal-dlss` DLL directory prepended
to `WINEDLLPATH_PREPEND`; legacy Wine's private runtime layer creates the same
aliases and uses cache format v2 so existing layers are rebuilt. Pairing both
the Windows PE and symlinked Unix bridge in the same prepended directory is
required so Wine's builtin loader initializes `nvngx.dll` cleanly instead of
failing `DllMain` with `ERROR_DLL_INIT_FAILED`. The shared component remains
unchanged. Orbit does not force `D3DM_VENDOR_ID`: once `nvngx.dll` loads,
D3DMetal natively switches adapter identity (`0x10de`/`0x2684`) and registers
`NGXCore\FullPath` whenever `D3DM_ENABLE_METALFX=1`, and stays on AMD
Compatibility Mode when `D3DM_ENABLE_METALFX=0`. Launch still sets
`HKLM\Software\NVIDIA Corporation\Global\NGXCore\FullPath` to
`C:\windows\system32` while DLSS is enabled. `D3DM_ENABLE_METALFX` follows the
toggle and unlocks both DLSS Super Resolution (`nvngx_dlss.dll`) and DLSS Frame
Generation (`nvngx_dlssg.dll`) on macOS 26+ when the game and package support
them.

Startup cleanup in `runtimes/retired_components.rs` drops Orbit's own component
manifests that only pointed at a retired third-party engine folder, and clears
active selections that used them. It never deletes files outside Orbit's
component store, and it skips any folder that holds more than the pointer.

## CrossOver feature audit

CrossOver behavior was checked against CodeWeavers' official
[CrossOver 26 advanced settings documentation](https://support.codeweavers.com/en_US/advanced-settings-in-crossover-mac-26):
Auto/DXMT/D3DMetal/DXVK/Wine graphics, ESync/MSync, and MetalFX-powered DLSS
are supported. Orbit intentionally fixes display output to 1080p and does not
expose CrossOver's High Resolution Mode. CSMT is always on in current CrossOver
and is not exposed as a fake Orbit toggle.

The remaining implementation backlog is a real backend contract, not more menu
items: DXVK/DXMT download and per-prefix DLL injection, Apple GPTK package import
and D3DMetal linkage, MoltenVK capability checks, MetalFX/upscale-ratio mapping,
frame-generation injection and VSync, Rosetta/X87 setup, color modes, media
decode workarounds, dependency installation, prefix tools/reset/backup, and
tested per-game recommendations. Store accounts, social features, and cloud sync
remain outside Orbit's scope.

## Phase 1 manual runtime foundation

## Audit and plan

Orbit already has a provider-neutral library, JSON launch configurations stored in
SQLite, manual import and artwork editing, Rust launch strategies, session events,
and controller-aware Play/Stop controls. Native apps, Steam, and Astris
are implemented. Direct `.exe` imports select Wine explicitly.

The implementation extends those paths without rebuilding screens:

1. Introduce the `runtimes/` boundary and typed `WineProfile`.
2. Probe installed Wine executables and validate selected Windows PE files.
3. Initialize one prefix per game, launch with literal argv and monitor the owned
   Wine session, preserving existing launch strategies for other configurations.
4. Surface runtime registration, compatibility options and diagnostics through
   existing Settings, Add game, Edit properties and game details.
5. Test validation, persistence, setup failure/retry, process lifetime and UI flow;
   run an opt-in real Wine smoke test separately from deterministic tests.

## Usage

In **Settings → Runtimes**, detect Wine from PATH, standard Homebrew locations and
Wine application bundles, or choose an installed distribution's `bin/wine` or
`bin/wine64`. A matching `wineserver` must be in the same directory. Registration
executes `--version` with a timeout and persists the selected path in SQLite.
GUI apps may have a shorter PATH than shells; the explicit picker handles that.

Use **Add game → Single file → Choose file** to select a Windows `.exe`. Confirm
the runtime and add it to the library. **Play** prepares an isolated environment,
then starts the game from its executable's directory. First setup can take up to
150 seconds. Game details offers **Cancel launch** during preparation. Edit
properties changes the executable, runtime and literal arguments (one per line).
The diagnostics selector enables Wine errors/warnings; quiet mode is the default.

**Compatibility diagnostics** reads the latest launch log. Logs are capped at
1 MiB per game; the UI reads only the last 32 KiB. They are local and are not
uploaded. Game output can contain personal data; review before sharing.

The runtime's existing graphics defaults apply. Orbit does not claim that a Wine
version supports a specific DirectX API or game. No graphics DLLs are copied or
installed. Windows installers can require dependencies or launchers that this
slice does not yet manage. Prefer an already installed, self-contained game.

## Architecture and persistence

- `runtimes/mod.rs`: typed profile and `RuntimeAdapter` / `RuntimeProcess` contracts.
- `detection.rs`: bounded candidate discovery and executable probes.
- `validation.rs`: absolute paths, no parent traversal, Windows PE header checks.
- `prefix.rs`: creation, ownership/version marker and failed-setup cleanup.
- `containers/`: base + per-game Wine containers, APFS clone, graphics links, Steam seed.
- `wine_capabilities.rs`: MSync / Metal-view / D3DMetal probe for CrossOver-class Wine.
- `process.rs`: bounded waits, sanitized child environment and capped pipe capture.
- `wine.rs`: Wine adapter, game working directory, exit monitoring and stop.
- `commands/runtimes.rs`: asynchronous native command boundary.
- Existing `SessionManager`: serializes launch reservations, persists playtime,
  emits existing events, and restores Orbit when the game exits.

`LaunchConfiguration::Wine { profile }` is stored in the existing
`launch_config_json` column. Existing variants and rows are unchanged; no SQL
migration is necessary. Missing profile arguments/environment deserialize to empty
values. Unknown profile fields are rejected. Profiles store a runtime path; the
managed environment's marker records the Wine path/version that last prepared the
prefix. Play uses the game's current graphics settings and, for Windows Steam
titles, the current Steam Wine binary. A leftover prefix is updated in place
(`wineboot -u`) instead of being deleted when the Wine version changes.

Environment locations are under Orbit's existing application data directory:
`runtimes/<game-id>/prefix` (legacy fallback), `runtimes/containers/bases/<wine-key>/`,
`runtimes/containers/games/<game-id>/`, `runtime.json`, and `latest.log`. Prefix paths are never
supplied by the frontend. Symlinks at the managed game/prefix boundary are rejected.
An interrupted unmarked prefix is not reused. Newly failed initialization is removed
only after its Wine server stops. Imported game files are never deleted on launch
failure or library removal. Prefix setup succeeds once `system.reg` exists after
wineserver settles, even if wineboot's exit code is non-zero. Wine child processes
use `en_US.UTF-8` and the Wine `bin` directory on `PATH`.

Long-running preparation, detection and stop run on blocking workers, not the UI
thread. A launch reservation rejects concurrent launches, including during setup.
Runtime process handles own child processes and reap them. The initial Wine loader
may exit before the game: monitoring waits for the dedicated prefix's `wineserver`
to exit before ending tracking. The recorded exit code is the initial loader's code,
not a promise to recover an arbitrary descendant game's exit code. Stop signals
only that prefix's server, first TERM and then Wine's default kill escalation.
Native/emulator tracking retains its current
limitations; it is not relabeled as owned-process tracking.

Launches use `Command` argv, never a shell. Child environment inheritance is cleared
except basic host/display variables; Orbit's metadata API credentials are not passed
to Wine. Advanced environment keys are allowlisted in Rust. Arguments remain literal.
Detection is O(candidate paths), deduplicated; process monitoring is O(1) for Orbit's
single active session. No library scans or per-game SQL loops were introduced.

## Technology decisions and future slices

- [Wine](https://github.com/wine-mirror/wine) supplies execution; Orbit implements
  orchestration, not compatibility translation. Its [wineserver manual](https://github.com/wine-mirror/wine/blob/master/server/wineserver.man.in)
  specifies prefix-scoped kill/wait semantics used here.
- [Heroic](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher) demonstrates
  separation between store management and Wine execution. Its GPL code is not copied
  or embedded. Legendary/GOG integrations should be investigated in Phase 4.
- The original [Whisky](https://github.com/Whisky-App/Whisky) is archived; do not base
  Orbit's update strategy on its old downloads. The [community fork](https://github.com/frankea/Whisky)
  is a reference for future distribution/capability research, not a dependency.
- [Apple Game Porting Toolkit](https://developer.apple.com/games/game-porting-toolkit/)
  and CrossOver have their own packaging/license conditions. This slice does not
  redistribute either, detect their presence as proof of generic Wine compatibility,
  or modify their bottles. Explicit runtime registration is for a compatible Wine
  executable with a matching server; it is not full CrossOver integration.
- DXVK and DXMT need explicit runtime/architecture/capability checks and installation
  contracts. UI toggles without installed components would be misleading.

Completed in the managed slice: verified distribution download/checksum, macOS
system gating, transactional activation and a simple progress UI. Next: version
inventory, transactional prefix reset/removal, graphics capabilities and package
imports, dependency management, structured diagnostic codes and controller options.
Phase 3 covers installer jobs, automatic recommendations, tested presets and
onboarding. Phase 4 stays a research backlog for Epic, GOG, community profiles,
and streaming. Windows Steam on macOS is specified in [STEAM_WINDOWS.md](STEAM_WINDOWS.md).
Managed compatibility remains macOS-only.

## Verification

`yarn test:rust` covers fake subprocess fixtures explicitly as deterministic unit
coverage, not actual Wine compatibility. Cases include detection and missing server,
PE/path validation, environment restrictions, argv boundaries, setup failure/retry,
version mismatch, lifecycle exit status, and cancellation timeouts. Frontend tests
exercise the exact Single file → .exe → Add flow and profile editing. The Playwright
runtime settings case verifies navigation and honest browser-preview limitations.

For a real installed Wine distribution and a known Windows game:

```sh
ORBIT_TEST_WINE=/absolute/path/to/bin/wine \
ORBIT_TEST_EXE=/absolute/path/to/game.exe \
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml \
  --lib real_wine_launch_and_stop -- --ignored --nocapture
```

The opt-in test initializes a temporary prefix, launches the real executable,
asserts that it stays running for five seconds, stops it, and removes the test
prefix. It does not prove rendering correctness, controller input, modern DirectX
compatibility, or the complete installed Tauri UI flow. Those require manual game
validation. Normal automated suites never require Wine or launch user games.

For the managed download itself:

```sh
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml \
  --lib real_managed_download_and_activation -- --ignored --nocapture
```

This opt-in test downloads the official pinned archive, verifies its digest,
activates it in a temporary directory, probes the managed executable, and removes
the installation. It does not modify `/Applications` or the user's registered
runtime.

### Local result (2026-11-11)

The managed download/activation test passed on this Apple Silicon Mac in
approximately 26 seconds. The real package's internal symlinks were preserved;
absolute and escaping links remain rejected.

On this Apple Silicon Mac, the opt-in test passed using an already installed
`wine-11.0-gbdfedbca358` and its x86_64 Windows `winemine.exe`. Initialization,
five seconds of live process monitoring, prefix-scoped stop and temporary cleanup
completed in approximately 37 seconds. This validates the native adapter against a
real Windows game; it does not certify the graphics backends or full Tauri UI flow.

### Graphics launch failure handling

A graphics setup error aborts launch at the graphics stage and reaches the launch
overlay. Installed MoltenVK is included in resolved component selections, allowing
DXVK's dependency validation to succeed. D3DMetal checks the required Windows/Unix
library pairs, copies its 64-bit DLLs only to `system32`, and supplies the matching
`redist/lib/wine` (or `lib/wine`) through `WINEDLLPATH`. The prefix DLLs take
precedence over Wine's own PE graphics libraries; the Unix bridges and framework
remain together in the installed payload. No 64-bit DLL is copied into `syswow64`.

These checks do not certify game compatibility. A real God of War diagnostic with
the installed Wine 11.21 and Apple 4.0 beta 3 payload still exited with code 53;
the loader trace records `SteamAPI_Init()` failing because no Steam instance or
Steam installation directory exists in that private prefix. Playability is not
verified. This requires the outstanding official in-prefix Steam client described
in `STEAM_WINDOWS.md`, including its own authenticated session.
