# Orbit

Controller-first desktop game launcher for macOS (Apple Silicon first). A modern alternative to Pegasus Frontend, inspired by PS5, Nintendo Switch, and Apple TV.

Built with **Tauri 2**, **React**, **TypeScript**, and **SQLite**. All filesystem and process logic lives in Rust — the frontend never launches games directly.

This repo is an **Nx monorepo** (Yarn workspaces) with two apps:

| App                            | What it is                                                                 |
| ------------------------------ | -------------------------------------------------------------------------- |
| [`apps/desktop`](apps/desktop) | The Orbit launcher (Tauri + React + Rust)                                  |
| [`apps/landing`](apps/landing) | Next.js website: install guide and downloads for every release (on Vercel) |

## Features

- **Couch-friendly UI** — fullscreen layout, cinematic transitions, spatial focus navigation
- **Game library** — home hero rows, filterable grid, search, playtime and achievements
- **Multi-source imports** — Steam, Astris (`.nsp`/`.xci`), GameHub, macOS apps, manual paths
- **Launch & sessions** — Rust-owned process launch, playtime tracking, hide window during play
- **Edit properties** — title, description, portrait/landscape/icon artwork (Base64 in SQLite)
- **Themes** — one Liquid Glass console shell with color themes, game themes (Devil May Cry 5, God of War, Cyberpunk 2077, Zelda, GTA V / VI, Super Mario), and a theme studio for your own logo and wallpaper
- **Controller + keyboard** — Gamepad API with Xbox / PlayStation / Nintendo mapping

## Platform

| Target                | Status             |
| --------------------- | ------------------ |
| macOS (Apple Silicon) | Primary            |
| macOS (Intel)         | Best-effort        |
| Linux / Windows       | Not targeted in v1 |

## Tech stack

| Layer    | Stack                                      |
| -------- | ------------------------------------------ |
| Shell    | Tauri 2 + Rust                             |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS   |
| State    | Zustand, TanStack Query                    |
| Motion   | Framer Motion                              |
| Database | SQLite (`rusqlite`)                        |
| Input    | Browser Gamepad API + custom spatial focus |
| E2E      | Playwright                                 |

## Quick start

```bash
yarn install
yarn tauri:dev        # desktop app
yarn dev:landing      # landing site on http://localhost:3000
```

Build a release `.app`:

```bash
yarn tauri:build
```

Package macOS release artifacts (`.app.tar.gz`, `.dmg`, checksums) into `release/<version>/`:

```bash
yarn release:macos                  # native arch (Apple Silicon or Intel)
yarn release:macos -- --arch universal
yarn release:macos -- --arch aarch64 --skip-tests
```

See [RUNNING.md](RUNNING.md#building-a-release) for details.

### GitHub Releases

The [release workflow](.github/workflows/release.yml) builds on `macos-14` (Apple Silicon) when you push a `v*` tag, or manually from the Actions tab.

**Publish an existing tag** (e.g. `v0.1.0` already pushed):

1. **Actions → Release → Run workflow**
2. Branch: `main`
3. Tag: `v0.1.0`
4. Run workflow

**New release:**

```bash
yarn monopipeline release patch --summary "Your release summary"
# edit CHANGELOG.md and .github/release-notes/<version>.md
git add -A && git commit -m "chore: prepare v0.2.0"
git push origin main
git tag v0.2.0
git push origin v0.2.0
```

- `Orbit-<version>-aarch64.dmg`
- `Orbit-<version>-aarch64.app.tar.gz`
- `SHA256SUMS.txt`
- Release notes from `.github/release-notes/<version>.md`

Full setup, frontend-only dev, testing, and troubleshooting: **[RUNNING.md](RUNNING.md)**.

Changelog: **[CHANGELOG.md](CHANGELOG.md)**

## Documentation

| Doc                                        | Contents                                                       |
| ------------------------------------------ | -------------------------------------------------------------- |
| [RUNNING.md](RUNNING.md)                   | Local setup, dev modes, tests, app data paths, troubleshooting |
| [CONTRIBUTING.md](CONTRIBUTING.md)         | How to contribute, quality gates, PR expectations              |
| [CHANGELOG.md](CHANGELOG.md)               | Version history and release notes                              |
| [docs/DESIGN_DOC.mdc](docs/DESIGN_DOC.mdc) | Product scope, screens, Tauri commands, data model             |
| [docs/PROJECT.mdc](docs/PROJECT.mdc)       | Repo layout, scripts, tooling                                  |
| [docs/TAURI.mdc](docs/TAURI.mdc)           | Rust backend, importers, launch flow                           |
| [docs/FRONTEND.mdc](docs/FRONTEND.mdc)     | React screens, controller system                               |
| [docs/UI.mdc](docs/UI.mdc)                 | Design tokens, components, theme system                        |
| [docs/THEMES.md](docs/THEMES.md)           | Authoring custom JSON themes                                   |
| [docs/LANDING.md](docs/LANDING.md)         | Landing site routes, release data, Vercel deploy               |

## Themes

Custom themes are plain JSON files in:

```text
~/Library/Application Support/Orbit/themes/*.json
```

See [docs/THEMES.md](docs/THEMES.md) for the schema and [docs/examples/arcade-neon.json](docs/examples/arcade-neon.json) for an example.

## Controller mapping

| Input              | Action          |
| ------------------ | --------------- |
| D-pad / left stick | Navigate        |
| A / Cross          | Select          |
| B / Circle         | Back            |
| X / Square         | Edit properties |
| Y / Triangle       | Add game        |
| L1 / R1            | Switch sections |
| Menu / Options     | Settings        |

Keyboard: arrows, Enter, Escape, `F` (edit), `C` (add), `[` `]`, `M`.

## Repository layout

```text
apps/desktop/src/             React frontend (modules, controllers, themes)
apps/desktop/src-tauri/src/   Rust backend (commands, importers, SQLite, launch)
apps/desktop/e2e/             Playwright specs
apps/landing/src/             Next.js landing site (home, install, download)
scripts/                      Release, version sync, cleanup tooling
docs/                         Architecture and design docs
```

## Contributing

Contributions welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for workflow, quality gates, and what belongs in scope.

## Out of scope

ROM downloads/decryption, keys management, emulator distribution, Steam account auth, cloud sync, social features. Automatic enrichment uses TheGamesDB + SteamGridDB with user-provided keys (see Settings or `.env`).

Artwork setup and import fallback behavior: [docs/ARTWORK.md](docs/ARTWORK.md). The **macOS Liquid Glass** theme is available in Settings; see [theme documentation](docs/THEMES.md#macos-liquid-glass).

GameHub library, background mode, and installation boundaries: [docs/GAMEHUB.md](docs/GAMEHUB.md).
