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

[1.0.0]: https://github.com/LFSCamargo/orbit/releases/tag/v1.0.0
[0.3.0]: https://github.com/LFSCamargo/orbit/releases/tag/v0.3.0
[0.2.0]: https://github.com/LFSCamargo/orbit/releases/tag/v0.2.0
[0.1.1]: https://github.com/LFSCamargo/orbit/releases/tag/v0.1.1
[0.1.0]: https://github.com/LFSCamargo/orbit/releases/tag/v0.1.0
