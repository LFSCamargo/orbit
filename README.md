# Orbit

Controller-first desktop game launcher for macOS (Apple Silicon first). A modern alternative to Pegasus Frontend, inspired by PS5, Nintendo Switch, and Apple TV.

Built with **Tauri 2**, **React**, **TypeScript**, and **SQLite**. All filesystem and process logic lives in Rust — the frontend never launches games directly.

## Features

- **Couch-friendly UI** — fullscreen layout, cinematic transitions, spatial focus navigation
- **Game library** — home hero rows, filterable grid, search, playtime and achievements
- **Multi-source imports** — Steam, Astris (`.nsp`/`.xci`), GameHub, macOS apps, manual paths
- **Launch & sessions** — Rust-owned process launch, playtime tracking, hide window during play
- **Edit properties** — title, description, portrait/landscape/icon artwork (Base64 in SQLite)
- **Themes** — Orbit, PS5, and Switch 2 shells, plus user JSON themes that reshape the whole app
- **Controller + keyboard** — Gamepad API with Xbox / PlayStation / Nintendo mapping

## Platform

| Target | Status |
| ------ | ------ |
| macOS (Apple Silicon) | Primary |
| macOS (Intel) | Best-effort |
| Linux / Windows | Not targeted in v1 |

## Tech stack

| Layer | Stack |
| ----- | ----- |
| Shell | Tauri 2 + Rust |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| State | Zustand, TanStack Query |
| Motion | Framer Motion |
| Database | SQLite (`rusqlite`) |
| Input | Browser Gamepad API + custom spatial focus |
| E2E | Playwright |

## Quick start

```bash
yarn install
yarn tauri:dev
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

Push a version tag to build a macOS `.dmg` and upload it to the [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github) tab:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The [release workflow](.github/workflows/release.yml) runs on `v*` tags, syncs the version from the tag, builds on `macos-14` (Apple Silicon), and publishes:

- `Orbit-<version>-aarch64.dmg`
- `Orbit-<version>-aarch64.app.tar.gz`
- `SHA256SUMS.txt`

Full setup, frontend-only dev, testing, and troubleshooting: **[RUNNING.md](RUNNING.md)**.

### GitHub Pages

The landing page is [`docs/index.html`](docs/index.html), deployed automatically by GitHub Actions.

**One-time setup (usually automatic):**

1. Push the repo to GitHub
2. The [deploy workflow](.github/workflows/deploy-pages.yml) enables Pages on first run (`enablement: true`)

If the deploy job still fails, open **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**, then re-run the workflow from the **Actions** tab.

**Deploy:** pushes to `main` that touch `docs/` run [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml). You can also trigger a deploy manually from the **Actions** tab (**Deploy GitHub Pages → Run workflow**).

Site URL: `https://<username>.github.io/orbit/`

Update GitHub links in `docs/index.html` if your repo URL differs from `github.com/lfscamargo/orbit`.

## Documentation

| Doc | Contents |
| --- | -------- |
| [RUNNING.md](RUNNING.md) | Local setup, dev modes, tests, app data paths, troubleshooting |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute, quality gates, PR expectations |
| [docs/DESIGN_DOC.mdc](docs/DESIGN_DOC.mdc) | Product scope, screens, Tauri commands, data model |
| [docs/PROJECT.mdc](docs/PROJECT.mdc) | Repo layout, scripts, tooling |
| [docs/TAURI.mdc](docs/TAURI.mdc) | Rust backend, importers, launch flow |
| [docs/FRONTEND.mdc](docs/FRONTEND.mdc) | React screens, controller system |
| [docs/UI.mdc](docs/UI.mdc) | Design tokens, components, theme system |
| [docs/THEMES.md](docs/THEMES.md) | Authoring custom JSON themes |

## Themes

Custom themes are plain JSON files in:

```text
~/Library/Application Support/Orbit/themes/*.json
```

See [docs/THEMES.md](docs/THEMES.md) for the schema and [docs/examples/arcade-neon.json](docs/examples/arcade-neon.json) for an example.

## Controller mapping

| Input | Action |
| ----- | ------ |
| D-pad / left stick | Navigate |
| A / Cross | Select |
| B / Circle | Back |
| X / Square | Edit properties |
| Y / Triangle | Add game |
| L1 / R1 | Switch sections |
| Menu / Options | Settings |

Keyboard: arrows, Enter, Escape, `F` (edit), `C` (add), `[` `]`, `M`.

## Repository layout

```text
src/              React frontend (features, controllers, themes)
src-tauri/src/    Rust backend (commands, importers, SQLite, launch)
e2e/              Playwright specs
docs/             Architecture and design docs
```

## Contributing

Contributions welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for workflow, quality gates, and what belongs in scope.

## Out of scope

ROM downloads/decryption, keys management, emulator distribution, automatic online artwork scraping (manual search + optional RAWG key only), Steam account auth, cloud sync, social features.
