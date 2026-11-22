# Changelog

All notable changes to Orbit are documented in this file.

Release notes for GitHub Releases also live in [`.github/release-notes/`](.github/release-notes/).

Scaffold a new release (bump version + CHANGELOG + GitHub release notes):

```bash
yarn monopipeline release patch --summary "Short release summary"
yarn monopipeline release minor
yarn monopipeline release 0.2.0 --date 2026-08-01
```

Bump version only:

```bash
yarn monopipeline bump patch
```

## [Unreleased]

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
