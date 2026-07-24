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

## [0.2.0] - TBD

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

[0.2.0]: https://github.com/LFSCamargo/orbit/releases/tag/v0.2.0
[0.1.1]: https://github.com/LFSCamargo/orbit/releases/tag/v0.1.1
[0.1.0]: https://github.com/LFSCamargo/orbit/releases/tag/v0.1.0
