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

[0.1.0]: https://github.com/LFSCamargo/orbit/releases/tag/v0.1.0
