# Changelog

All notable changes to Orbit are documented in this file.

Release notes for GitHub Releases also live in [`.github/release-notes/`](.github/release-notes/).

Scaffold a new release (bump version + CHANGELOG + GitHub release notes):

```bash
bun run monopipeline release patch --summary "Short release summary"
bun run monopipeline release minor
bun run monopipeline release 0.2.0 --date 2026-08-01
```

Bump version only:

```bash
bun run monopipeline bump patch
```

## [Unreleased]

## [2.6.2] - 2026-11-27

2.6.1, rebuilt so it opens on every Mac

### Fixed

- Orbit 2.6.1 as published (built on CircleCI) could not open, whether downloaded or installed as an in-app update: it linked Homebrew's `liblzma` from the build machine instead of carrying its own. `liblzma` is now always built into the app (`LZMA_API_STATIC` in `apps/desktop/src-tauri/.cargo/config.toml`), and `scripts/release-macos.sh` refuses a build that links any library outside macOS (`scripts/check-linkage.mjs`). 2.6.2 has every 2.6.1 change.

## [2.6.1] - 2026-11-27

Updates from inside Orbit, and a choice of Orbit Wine

### Added

- Orbit updates itself: when a newer release is out, Orbit shows its release notes on launch. **Update and restart** downloads it with progress, verifies its signature against the updater public key in `tauri.conf.json` (Tauri updater), installs it and restarts; **Later** asks next launch. It is refused while a game runs.
- **Windows games runtime** in Settings → Compatibility: choose the Orbit Wine build games play with, or install another published build. With no choice stored, Play follows the newest installed build; choosing an older one pins it.
- An Orbit Wine update dialog on launch with the build's release notes: **Download update** installs it and switches games to it, **Keep** stays on the installed build and is not asked again for that version.
- Signed releases: `scripts/release-macos.sh` signs the update archive with `~/.tauri/orbit.key`, verifies it against the public key before anything is written, writes `latest.json`, and `--publish` uploads the release as latest. A pushed `v<version>` tag publishes it on CircleCI's macOS runners.

### Changed

- Orbit Wine 26.3.0-2 is a rebuild of 26.3.0 with Orbit's audio buffer patch and the SDL2 pad bridge. Orbit Wine versions compare by number (a rebuild beats its first build), so onboarding installs and Play uses the highest build whatever order GitHub lists releases in.
- Orbit Wine is never updated without asking; other runtime components still update on their own when "Update runtimes automatically" is on.
- Settings no longer shows the Compatibility layer row: games never used the catalog Wine versions it chose.

### Fixed

- Crackling and distorted audio in container games for installs on the published Orbit Wine 26.3.0: 2.6.0 set a deeper audio buffer, but only Orbit Wine 26.3.0-2 reads it.
- 2.4 GHz receivers and XInput-only USB pads in Windows games: the pad bridge they need ships in Orbit Wine 26.3.0-2's SDL2.

[2.6.1]: https://github.com/LFSCamargo/orbit/releases/tag/v2.6.1

## [2.6.0] - 2026-11-27

Controllers that keep up, native macOS downloads, and games that start ready

### Added

- XInput-only USB pads and 2.4 GHz dongles (8BitDo Ultimate 2C receiver, third-party Xbox 360 pads) work in Orbit's menus and in Windows games. Orbit reads them with libusb and hands them to Orbit Wine's SDL through a shared-file pad bridge, as a virtual Xbox 360 gamepad with rumble. Every pad Orbit reads natively (HID pads through gilrs too) drives the menus as `native-gamepad`.
- Owned games with a macOS build download that build through Steam for Mac, which Orbit starts fully hidden (no Dock icon, Cmd-Tab entry or menu bar) and quits when no macOS download or game needs it.
- Shader cache warmup before every container game starts: the caches earlier runs left (D3DMetal per executable, then Orbit Wine's Metal cache, up to 2 GiB) load with measured progress in the launch overlay. A title with no cache yet says the game compiles its shaders on its first start.
- **Repair Installation** on game details: Steam checks every file and fetches what is missing or changed, then the game's install scripts run again.
- **Compress games** in Settings → Storage: APFS transparent compression (LZFSE) for every installed Steam game, verified byte for byte before it replaces a file; turning it off decompresses them.
- A game's `installscript.vdf` "Run Process" steps run once per container before its first launch (God of War Ragnarök's PlayStation PC SDK runtime).
- God of War Ragnarök always gets Rosetta AVX, a 60 FPS D3DMetal cap by default, and its original executable back from an outdated CPU-bypass build.
- A local security gate: `bun run security` (gitleaks, OpenGrep or Semgrep, dependency audits) and a staged secret scan on every commit.

### Changed

- Steam downloads report every step with real numbers (downloaded, written to disk, time left); the Downloads row shows a step track, a speed graph and an exact progress bar.
- Container games get a 60 ms Wine audio buffer (`ORBIT_AUDIO_BUFFER_MS`) instead of 30 ms, which ran dry under Rosetta.
- Orbit's helper Steams (sign-in and library sync) start without Wine's controller driver, so their Steam Input cannot take the pad or open Big Picture.
- Bun replaces Yarn as the package manager and script runner; every dependency is pinned to an exact version, and commits are checked by Husky and commitlint.

### Fixed

- Controller input lag during play: rumble is written on its own thread, so a rumble change never delays the next read; a USB hiccup under 100 ms keeps held sticks and triggers.
- Controller dropouts lasting seconds: Orbit stays out of App Nap for the whole session and rescans a missing pad every 100 ms until the game ends.
- `steam.exe` stays at normal priority during play (only Steam's browser helpers are throttled); at background priority it stalled the game's Steamworks calls.
- An idle Steam for Mac no longer holds USB controllers a Windows game needs.
- Crackling and distorted audio in container games.

[2.6.0]: https://github.com/LFSCamargo/orbit/releases/tag/v2.6.0

## [2.5.0] - 2026-11-25

Lighter game containers, a hidden Steam client, and a self-updating library

### Added

- The Windows Steam client that signs a game in now runs hidden: it never appears in the Dock, the menu bar (no app menu or tray icon) or Cmd-Tab, and cannot take focus from the game. Orbit loads `OrbitHiddenClient.dylib` into the container's Steam processes only; games and the Settings sign-in window are unaffected.
- Steam library sync on every launch: owned games are read from Steam's local `packageinfo.vdf` and `appinfo.vdf` (with real titles and types), and a cancellable background sync in a reusable `steam-sync` container picks up games bought on the phone or web. Play, downloads, sign-in, sign-out and quit stop it at once.
- **Steam download locations** in Settings → Library: add an external SSD or a new folder (created on a connected drive) and pick it when installing. Library scans, play and uninstall also find games there.
- Settings → Storage lists every connected drive with its own breakdown and summed free space, and can remove any Orbit-created data (`remove_storage_item`).
- The launch screen shows live Steam sign-in steps (connecting, signing in, preparing Steam).

### Changed

- Per-game Wine containers clone a slim per-Wine base prefix and leaf-symlink its read-only `drive_c/windows` folders (`system32`, `syswow64`, `winsxs`, `resources`, `Microsoft.NET`, `globalization`) instead of copying them. Graphics DLLs are still copied per game.
- Valve's Steam client files are leaf-symlinked from `steam-windows` (or the shared `runtimes/steam-client` cache) instead of copied into every container (about 1–1.5 GB per game). Mutable files and account data stay per container, disposable caches are pruned, and existing containers are healed on their next launch.
- Steam catalog hydration and the background sync stand down while a game is launching or running, and Orbit no longer starts Wine at boot to decrypt cookies older than 36 hours.
- Component versions can be removed even when selected; the selection is cleared.
- Game details show "Space needed" for titles that are not installed.

### Fixed

- A refused Steam login (Access Denied, Invalid Password, Expired, Revoked) is cleared across `native-session.json`, `steam-windows`, the container and `steam-sync` before Steam is force-stopped, instead of waiting on `-shutdown`; Orbit then asks to sign in again from Settings → Steam.
- Spatial focus scores candidates by edge gaps, so the D-pad no longer skips two-column rows between full-width buttons (for example Stop game / Back to Orbit in the quick menu).
- Focus rings are no longer clipped by scroll containers on the Home shelf, Library grid, drawers, settings and onboarding.
- The remaining old `orbit.svg` logos are replaced by the current app icon.
- `SetupProgress` fields are serialized in camelCase.

[2.5.0]: https://github.com/LFSCamargo/orbit/releases/tag/v2.5.0

## [2.4.0] - 2026-11-22

D3DMetal DLSS & MetalFX Frame Generation, `D3DM_MAX_FPS`, and RE Engine stability

### Changed

- Enabled frame rate limiting on D3DMetal via `D3DM_MAX_FPS` in global Game graphics settings and per-game compatibility overrides, preserving the cap when toggling D3DMetal DLSS support.
- Allowlisted `D3DM_MAX_FPS`, `D3DM_MTL4`, and `D3DM_SUPPORT_DXR` in `WineProfile::validate_options`.
- Separated D3DMetal DLSS support from DXMT spatial upscaling and NVIDIA extensions, fixed Windows presentation to a 1920×1080 virtual desktop with Retina off, and updated Settings copy to reflect GPTK 4 MetalFX Super Resolution and Frame Generation behavior.

### Fixed

- Fixed D3DMetal DLSS initialization by staging both `.orbit/d3dmetal-dlss/x86_64-windows/nvngx.dll` and a symlinked `.orbit/d3dmetal-dlss/x86_64-unix/nvngx.so` (pointing to canonical `libd3dshared.dylib`) on `WINEDLLPATH_PREPEND`, replacing stale copies in existing containers, and letting D3DMetal manage NVIDIA/AMD adapter identity and `NGXCore\FullPath` natively from `D3DM_ENABLE_METALFX`.
- Updated RE Engine pre-launch `.ini` fixes (`dmc5config.ini`, `re2_config.ini`, `re3_config.ini`, and crash-fallback configs) to also set `Capability=DirectX11` and `UseVendorExtention=Disable` under `[Render]` alongside `TargetPlatform=DirectX11`.

[2.4.0]: https://github.com/LFSCamargo/orbit/releases/tag/v2.4.0

## [2.2.0] - 2026-11-21

Controller and gameplay performance, smoother cloud streaming, and codebase cleanup

### Changed

- Gamepad polling runs only while a controller is connected and not suspended, using a 500 ms discovery check when idle instead of polling every frame.
- Controller input no longer re-renders the entire app on every press or stick-scroll frame, and navigation listeners stay mounted across screen transitions without leaking Tauri event listeners.
- Spatial focus notifies only the controls gaining or losing focus (`O(1)` per move) and filters candidates by geometry before checking computed styles.
- Right-stick pane scrolling resolves the scrollable container once per gesture instead of walking computed styles at 60 Hz.
- Home hero artwork and entry lookups wait 160 ms for focus to settle so holding the D-pad does not decode full-size art for every tile passed.
- Orbit backs off background work while a local game or cloud stream is active: native Home-button polling slows from 50 ms to 100 ms, network updates only fire on online-state changes, process liveness uses `kill(pid, 0)` directly instead of spawning a subprocess, and active-session polling drops to a 10 s safety net.
- Xbox Cloud Gaming streams request keyframes on demand (after a 1 s freeze or when resuming from the Home menu, throttled to once every 2 s) instead of every 5 s, suspend Orbit's in-page and native controller polling during play, stop painting Orbit screens behind the player, and avoid per-frame input allocations at 60 Hz.
- Windows Steam container sessions move `steamwebhelper` browser processes in the game's `WINEPREFIX` to macOS background priority (`PRIO_DARWIN_BG`) during play while keeping `steam.exe` and `wineserver` at normal priority, restoring normal priority when play ends.
- Added Knip (`yarn knip`) as a quality gate to catch unused files, exports, and dependencies.

### Fixed

- Steam Input is now off by default for Windows container games so `winebus` delivers controller input directly via Orbit's SDL mappings without Wine/Rosetta translation stutter. Existing saved choices are preserved, and Settings → Steam can still enable it per setup.
- Startup crash recovery no longer overrides the selected graphics layer (such as D3DMetal / GPTK) to DXVK or triggers on signal terminations (`-1`), while keeping RE Engine DirectX 11 `.ini` fixes (`Devil May Cry 5`, `Resident Evil 2`, `Resident Evil 3`). Legacy DXVK fallback entries are dropped on startup, and stray non-builtin graphics DLLs in `system32` and `syswow64` are cleaned up when applying D3DMetal or DXMT.

### Removed

- Unused frontend components, hooks, helpers, and stale modules identified by Knip across desktop and landing.

[2.2.0]: https://github.com/LFSCamargo/orbit/releases/tag/v2.2.0

## [2.1.0] - 2026-11-20

Xbox Cloud Gaming in Orbit, game themes, and launch showcases

### Added

- Xbox Cloud Gaming catalog browsing, Microsoft device-code sign-in in onboarding and Settings, and saving cloud titles to your library.
- Orbit’s own fullscreen cloud player with queue and connection states, controller input, rumble, and pause/resume through the Home menu. Return to Orbit while a stream stays paused in the background, or stop it from the same menu.
- Five offline Studio game presets: Devil May Cry 5 — Violet, Cyberpunk 2077 — Violet, Grand Theft Auto VI — Blue Hour, Super Mario — Sunset, and Zelda: Ocarina of Time — Gold. Existing presets and saved custom themes remain available.
- Landing-page launch and gameplay videos with the globe startup animation and an original instrumental, selectable theme screenshots, library previews, provider sections, FAQ, and the application favicon.

### Changed

- All games and Search can show the cloud catalog without adding every title to the saved library. Cloud entries stay separate from Steam titles, and saved cloud games join Recently played without disk-install or Wine settings.
- Library sections can be collapsed or expanded and show more games in batches of 24; searching reveals matching entries across sections.
- Search matches accented titles and punctuation, so “Brutal Legend” finds “Brütal Legend” and plain text finds titles containing trademark symbols.

### Fixed

- Cloud Play starts Orbit’s player instead of sending the game to an external browser.
- Controller navigation and stick scrolling yield to a visible cloud game. Guide/Home presses open the Home menu once, including when native and in-page controller events arrive together.
- Xbox sign-in requests a fresh device code when opened or retried, and reports linking and streaming readiness in Settings.
- Netlify builds use the actual `landing` Nx project, with the workspace root as the build directory and `apps/landing/.next` as the publish directory.

[2.1.0]: https://github.com/LFSCamargo/orbit/releases/tag/v2.1.0

## [2.0.0] - 2026-11-19

Universal gaming experience for Mac

### Added

- First-run onboarding that sets up Orbit Wine containers, opening over an animated splash.
- Orbit Wine containers with D3DMetal, Steam sign-in seeding, and Bluetooth/USB controller passthrough.
- Windows Steam: sign in, download, play and uninstall games, with a download queue, live progress, offline pause/resume and a per-game install location.
- Game Mode for Orbit Wine, staged launch progress, and a launch card showing runtime and controller.
- Startup crash prevention for known and new games.
- Windows compatibility settings and graphics components, including GameHub imports, vkd3d-proton and zink.
- Storage settings with measured install sizes.
- Toasts for downloads, launches and errors.
- Controller stick navigation and pane scrolling; B cancels one step at a time.
- Rebuilt macOS landing site.

### Changed

- One unified library that shows each game's source and groups mixed libraries by source. GameHub is no longer a separate provider.
- The library shows only games, hiding software and tools such as Driver Booster.
- Games start as their own macOS process, and Orbit's background work pauses during play.
- Fresh installs default to MSync, AVX and MetalFX.
- Library settings redesigned as cards, plus a shared side drawer, pill-shaped buttons, skeleton loaders and debounced search.

### Fixed

- Home offers Install, not Jump back in, for games not on this Mac.
- Steam keeps exactly one Orbit client, stops it on quit, and reuses the saved sign-in.
- Games get the screen instead of a black Space, and Orbit no longer toggles fullscreen.
- Artwork loads reliably, isn't re-downloaded when unchanged, and broken logos are hidden.
- Steam game launch settings save, and a failed save says why.

[2.0.0]: https://github.com/LFSCamargo/orbit/releases/tag/v2.0.0

## [1.1.2] - 2026-11-15

### Fixed

- Steam sign-in no longer fails when Wine is already stopped; a bounded server wait certifies shutdown.
- Cancel dismisses the sign-in modal even if cleanup fails, with the failure reported as a notification.
- Native shutdown operations time out rather than leaving cancellation waiting indefinitely.

[1.1.2]: https://github.com/LFSCamargo/orbit/releases/tag/v1.1.2

## [1.1.1] - 2026-11-15

### Fixed

- Steam Wine sign-in browser rendering and offscreen-window recovery using a bundled, source-included compatibility helper.
- Modal readiness based on native placement, explicit positioning errors, and cancellation that waits for native shutdown.
- Positioning scoped to the managed Steam browser instead of unrelated Wine or native Steam windows.
- Stable Orbit header branding and persistent failed game-launch feedback.

[1.1.1]: https://github.com/LFSCamargo/orbit/releases/tag/v1.1.1

## [1.1.0] - 2026-11-14

One library for Mac and Windows Steam games, with in-app Wine and GPTK.

### Added

- **Unified library** — Installed, All games, and Favorites share one grid. A Steam title is one card (`steam:<AppID>`), whether it is owned, installed, or both. Search covers the full catalog (capped at 2,000)
- **Windows Steam on macOS** — Settings → Steam signs in with a QR code or a Steam account. The password is RSA-encrypted to Steam and never stored. Orbit snapshots the owned library, downloads one Windows depot at a time, and launches the installed `.exe` through Wine or GPTK. SteamCMD runs only during a download
- **Downloads sidebar** in the shell — follow the active transfer without a resident Steam window
- **Windows compatibility in Settings** — install Wine, DXVK, DXMT, MoltenVK, and Apple Game Porting Toolkit from a catalog; keep the chosen versions; apply graphics options only when that backend is installed. GPTK packages are checksum-verified against Apple’s published disk images
- **Additional Steam library folders** in Settings → Library — add a `steamapps/common` folder (or its parent) so existing installs count as installed and can play
- **Game details Settings** — General, Artwork, and Launch & compatibility live on the details page. There is no separate Edit properties screen
- Unified library commands (`list_library_entries`, `get_library_entry`, `update_library_entry`, `delete_library_entry`, `scan_steam_installations`) and the Windows Steam sign-in / library / download command group

### Changed

- Library search, sort, and platform filters sit in separate 48px Liquid Glass clusters instead of one nested bar
- Settings uses a controller-first sidebar (General, Themes, Library, Steam, Game graphics, Compatibility) with a right-hand insights column
- Steam store descriptions replace importer placeholder copy, including leftover GameHub text, when a Steam identity is known
- Desktop styling is Tailwind-first; Liquid Glass, focus rings, and CSS variables stay in `apps/desktop/src/styles/index.css`

### Removed

- GameHub as a provider: no shortcut scan, `gamehub://` handoff, or GameHub library screen. Add a Steam library folder in Settings to pick up games that already live in a GameHub `steamapps` tree. Unmatched GameHub rows leave the active library only after a SQLite backup; installed files are never moved or deleted

### Fixed

- Compact shell header no longer overflows around 900px; Settings content scrolls inside the glass pane
- Windows executable discovery checks shallower directories first so large asset folders cannot hide the game `.exe`

## [1.0.0] - 2026-11-11

Nx monorepo, landing site, game and color themes with a theme studio, and home/library focus polish.

### Added

- **Landing site** (`apps/landing`, Next.js on Vercel) — product overview, install guide (first launch, checksums, update, uninstall), and a download page for every GitHub Release with a version picker, file list, and release notes
- **Nx monorepo** on Yarn workspaces: the desktop app moved to `apps/desktop`; root scripts (`yarn tauri:dev`, `yarn build`, `yarn test:unit`, …) run through Nx with caching

- **Game themes** — Devil May Cry 5, God of War, Cyberpunk 2077, Zelda: Ocarina of Time Remake, Grand Theft Auto V, Grand Theft Auto VI, Zelda: Breath of the Wild, and Super Mario. The game's wordmark (or a logo you pick) replaces the Orbit logo, with a small ORBIT signature at the bottom of the screen
- **Color themes** — Aurora, Ember, Sakura, and Graphite alongside the Liquid Glass default
- **Theme studio** in Settings: rename a theme, change its logo text, tagline, accent, and logo style, pick a logo and wallpaper (file, artwork search, or a game in your library), then save it as your own theme or delete it
- `save_custom_theme` / `delete_custom_theme` Tauri commands and a `logo` slot for `search_game_artwork` (SteamGridDB logos, Steam Store logo)

### Changed

- Liquid Glass is now the only shell and the default theme; its wallpaper, scrims, and buttons follow the active palette
- Saved PS5, Switch 2, and Orbit Default theme selections switch to Liquid Glass automatically
- Custom theme JSON is sanitized on load: invalid ids or colors skip the theme, and only inline raster images are kept. `layout` and `backgroundStyle` are ignored

### Removed

- PS5, Switch 2, and Orbit Default shells, along with their home screens, navigation bar, and styles

### Fixed

- Home game tiles: the focus selector now tracks the card — the whole tile scales up on focus instead of only the artwork lifting inside a static selector
- Library and search game cards scale up on focus, matching the home animation
- Home game tiles no longer show the generic focus outline ring, which wrapped the caption below the artwork and was partly covered by the artwork itself

## [0.3.0] - 2026-11-09

Artwork picker grid across all providers, random SteamGridDB artwork, and guaranteed artwork + title correction on import.

### Added

- **Browse images** picker on Edit Properties: a grid of artwork from SteamGridDB, TheGamesDB, RAWG, Wikimedia, and the Steam Store, filterable by source, sized per slot (cover, hero, icon)
- **Random SteamGridDB** button per artwork slot — applies a random image for the matched game without repeating the previous roll
- `search_game_artwork` Tauri command that queries every configured provider independently and reports per-provider warnings
- Imported games always get artwork in every slot (reused slot or generated placeholder that stays eligible for later enrichment)

### Changed

- Auto-enrich now also runs for existing games that still lack real artwork, and works without a TheGamesDB key
- SteamGridDB matching uses the Steam app ID or an exact normalized title; importer titles are corrected from the matched SteamGridDB / TheGamesDB / Steam Store entry
- TheGamesDB title match threshold raised to avoid matching sequels or similarly named games
- HTTP requests have connect and total timeouts; provider errors no longer leak request URLs (API keys)

### Fixed

- Downloaded artwork is validated as an image before being cached, so HTML error pages are no longer stored as art
- A single failed artwork download no longer aborts enrichment for the whole game

## [0.2.0] - 2026-07-25

TheGamesDB + SteamGridDB metadata enrichment, same-monitor launching, PS5/Switch shell polish, library square tile normalization, and a modules/performance refactor.

### Added

- **TheGamesDB** text metadata enrichment (title, description, release date, genres, developers, publishers) with a separate local cache database
- **SteamGridDB** artwork enrichment (cover, hero, logo, icon) with optional API key
- Auto-enrich newly imported games when `autoEnrichOnImport` is enabled (default on)
- Manual **Fetch metadata & artwork** on Edit Properties for existing games
- Settings: TheGamesDB + SteamGridDB API keys, auto-enrich toggle, and **Test API keys**
- Square icon fallback to portrait cover when no dedicated icon is available
- Transparent square icons flattened onto a black background when cached
- Same-monitor launch placement — Steam, GameHub, Astris, and native apps open on the monitor where Orbit is running
- Native path picker on the AppKit main thread (`pick_open_path`) for imports and artwork selection
- PS5/Switch home shell polish: carousel tile titles, home menu modal, controller Home/Guide handling, and stick scrolling
- Shared `SquareGameArt` and `StatCard` components with fixed-size library grids on PS5 and Switch themes
- Shared `themeTokens()` lookup for themed shell, panel, ink, and muted classes
- Dev storage cleanup scripts: `yarn clean:report`, `yarn clean`, and `yarn clean:deep`
- Vitest unit test suite (`yarn test:unit` / `yarn test:unit:watch`) for pure TypeScript helpers and shared components
- Expanded Rust unit coverage for repository CRUD, metadata cache, launch strategy dispatch, and Steam VDF fixtures

### Changed

- Frontend route screens live under `src/modules/` (replacing `src/features/`) with colocated module components and hooks
- Home, Settings, and Game Details pages split into focused colocated components
- Import scan flow shared via `useImportScan` across Add Game and Settings → Import
- Rust HTTP client, Switch ROM walk, and Steam root detection deduplicated into shared helpers
- Artwork search/fetch HTTP logic moved out of Tauri commands into a dedicated service
- Library `list_games` strips heavy Base64 artwork blobs; full artwork remains on game details
- Override and import upsert lookups batched (no per-row N+1 queries)
- Metadata cache repository shared via `AppState` instead of reopening per call
- Artwork slot downloads run in parallel; session polling only runs while a game is active
- `GameCard` memoized with stable handlers for library and search grids
- Import re-scans merge artwork and descriptions without wiping enriched or user-filled slots
- Import toasts report how many games were enriched
- `ScanResult` includes `enriched` count
- Library and Search square tiles use fixed grid columns with top-aligned rows and reserved two-line title space
- Square tiles use full-bleed cover for portrait fallbacks and contained fit for true square icons

### Fixed

- Home and library tiles show artwork again — heavy Base64 images are spilled to `artwork-cache/` instead of being stripped from `list_games`
- TheGamesDB lookup and JSON parsing for titles like DmC: Devil May Cry
- Artwork cache write failures when a path pointed at a directory (`EISDIR`)
- Steam importer skips directory paths masquerading as artwork files

### Removed

- Unused `GameHero`, `GameCarousel`, and `useHeroBlur` frontend code
- Dead `seed_mock_games_if_empty` / `mock_games` repository helpers

## [0.1.1] - 2026-07-22

Library content inventory on the home hero, smarter Switch and GameHub imports, a playing screen during sessions, and launch-path editing.

### Added

**Switch (Astris)**

- Switch library scanner that groups base games, updates, and DLC from ROM folders inferred from your library
- Switch content visualizer screen (Settings → Import → Switch content visualizer)
- Home hero shows game version and installed DLC count for Switch titles
- DLC names extracted from ROM filename brackets (e.g. `Astronomers Hat`)
- Launch always resolves to the base `.nsp` / `.xci` application ROM; updates are left for the emulator

**Steam**

- Home hero shows build ID and installed add-on count for Cyberpunk 2077 (Steam AppID `1091500`) as a proof of concept

**GameHub**

- Import verified GameHub shortcuts from `/Applications` and `~/Applications`
- Detection via bundle id `com.gamehub.shortcut.*` and `gamehub://launch/` deep links in shortcut launchers
- Play opens the shortcut `.app`, which forwards the deep link to GameHub
- Setup instructions on the Import screen

**Launcher & sessions**

- Full-screen playing view with game artwork, title, and stop button while a session is active
- Edit launch path on the game edit page when a title fails to open

### Changed

- Astris import skips AppleDouble `._*` sidecar files, updates, DLC, and language packs; base-only applications ≥ 100 MB
- GameHub importer no longer scans arbitrary `.exe` folders — shortcuts only
- macOS Applications scan excludes GameHub shortcuts (import them via GameHub instead)
- Home content stats use compact typography and stable card height; version/DLC pills removed from game tiles

### Fixed

- Astris launch opens the real ROM instead of macOS metadata sidecars on exFAT volumes
- Install size refreshes when the launch path is edited on the game edit page

## [0.1.0] - 2026-07-21

First public release of **Orbit** — a controller-first game launcher for macOS.

### Highlights

- Fullscreen, couch-friendly launcher UI inspired by PS5, Nintendo Switch, and Apple TV
- Import games from Steam, Astris, GameHub, macOS apps, and manual file picks
- Launch games with playtime tracking and session management
- Three built-in theme shells (Orbit, PS5, Switch 2) plus custom JSON themes
- Gamepad and keyboard navigation with spatial focus

### Added

**Library & launcher**

- Home screen with cinematic hero, recent rows, and glass activity dashboard
- Library grid with filters, sorting, and search
- Game details with playtime, install size, and achievements
- Edit properties — title, description, portrait, landscape, and icon artwork
- Add game journey with importer detection and manual import
- Launch/stop sessions with Orbit window hide during play

**Importers**

- Steam library sync (playtime, SizeOnDisk, achievements)
- Astris folder scan (`.nsp` / `.xci`)
- macOS Applications scan
- GameHub folder scan (experimental)
- Manual file/folder import

**Themes**

- Orbit Default — hero rows and frosted dashboard
- PlayStation 5 — immersive artwork and stats panel
- Switch 2 — square tiles and bottom navigation
- Custom JSON themes via `~/Library/Application Support/Orbit/themes/`

**Input**

- Gamepad support (Xbox / PlayStation / Nintendo mapping)
- Spatial focus system and keyboard shortcuts

**Platform**

- Tauri 2 + Rust backend (SQLite, importers, process launch)
- React 19 frontend with Framer Motion transitions
- macOS 12+ target (Apple Silicon primary)

**Tooling & docs**

- `yarn release:macos` release script (`.app.tar.gz`, `.dmg`, checksums)
- GitHub Actions release workflow on `v*` tags
- Project docs, contributing guide, and E2E tests (Playwright)

### Requirements

- macOS 12+
- Apple Silicon recommended (aarch64 build published in CI)

### Downloads

GitHub Releases includes:

- `Orbit-0.1.0-aarch64.dmg` — recommended installer
- `Orbit-0.1.0-aarch64.app.tar.gz` — portable archive
- `SHA256SUMS.txt` — checksums

### Known limitations

- macOS only in v0.1.0
- No Steam account auth, cloud sync, or automatic artwork scraping
- GameHub importer is experimental
- Intel Macs: build locally with `yarn release:macos -- --arch x86_64` or `--arch universal`

[1.1.0]: https://github.com/LFSCamargo/orbit/releases/tag/v1.1.0
[1.0.0]: https://github.com/LFSCamargo/orbit/releases/tag/v1.0.0
[0.3.0]: https://github.com/LFSCamargo/orbit/releases/tag/v0.3.0
[0.2.0]: https://github.com/LFSCamargo/orbit/releases/tag/v0.2.0
[0.1.1]: https://github.com/LFSCamargo/orbit/releases/tag/v0.1.1
[0.1.0]: https://github.com/LFSCamargo/orbit/releases/tag/v0.1.0
