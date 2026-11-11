# Running Orbit

How to run Orbit locally, test changes, and troubleshoot common issues. For architecture and module layout, see [`docs/`](docs/).

---

## Prerequisites

| Tool          | Version           | Notes                                     |
| ------------- | ----------------- | ----------------------------------------- |
| **macOS**     | 12+               | Primary target; Apple Silicon recommended |
| **Node.js**   | 22+               | Required for frontend tooling             |
| **Yarn**      | 1.x or compatible | Package manager                           |
| **Rust**      | stable            | Install via [rustup](https://rustup.rs)   |
| **Xcode CLT** | Latest            | `xcode-select --install`                  |

Optional for E2E:

| Tool                | Notes                                            |
| ------------------- | ------------------------------------------------ |
| Playwright browsers | Installed automatically on first `yarn test:e2e` |

---

## First-time setup

```bash
git clone <repo-url> orbit
cd orbit
yarn install
yarn tauri:dev
```

The first `tauri:dev` run compiles Rust dependencies and may take several minutes.

The repo is an Nx monorepo: the desktop app is `apps/desktop` and the landing site is
`apps/landing`. Run every command below from the repo root; root scripts delegate to Nx.

---

## Development modes

### Option A — Full desktop app (recommended)

Runs the Tauri shell with hot reload on the Vite dev server and the real SQLite backend:

```bash
yarn tauri:dev
```

| Detail        | Value                                                   |
| ------------- | ------------------------------------------------------- |
| Vite dev URL  | `http://localhost:1420` (`apps/desktop/vite.config.ts`) |
| Database      | `~/Library/Application Support/Orbit/orbit.db`          |
| Custom themes | `~/Library/Application Support/Orbit/themes/`           |

Use this mode when working on importers, launch, SQLite, native dialogs, or window management.

### Option B — Frontend only (faster UI iteration)

Runs Vite with a mock Tauri API — no Rust compile, no real filesystem access:

```bash
yarn dev
```

Open `http://localhost:1420`. Mock data comes from `apps/desktop/src/lib/devMockApi.ts`.

Use this mode for UI, themes, controller focus, and layout work. Switch to `yarn tauri:dev` before merging anything that touches Tauri commands or importers.

### Landing site

```bash
yarn dev:landing
```

Opens the Next.js site on `http://localhost:3000`. Download pages read live data from the
GitHub Releases API; set `GITHUB_TOKEN` in `apps/landing/.env.local` if you hit the
unauthenticated rate limit. See [docs/LANDING.md](docs/LANDING.md) for routes and Vercel deploy.

---

## Building a release

### Quick build

```bash
yarn tauri:build
```

Produces a macOS `.app` bundle under `apps/desktop/src-tauri/target/release/bundle/macos/`. A `.dmg` installer is also created when Tauri's bundler succeeds.

### Release script (recommended)

Collects versioned artifacts and checksums into `release/<version>/`:

```bash
yarn release:macos
```

| Flag               | Description                                                    |
| ------------------ | -------------------------------------------------------------- |
| `--arch native`    | Default — matches the current Mac (`aarch64` or `x86_64`)      |
| `--arch universal` | Universal binary (Apple Silicon + Intel)                       |
| `--arch aarch64`   | Apple Silicon only                                             |
| `--arch x86_64`    | Intel only                                                     |
| `--skip-tests`     | Skip `yarn test:rust`                                          |
| `--skip-typecheck` | Skip `yarn typecheck`                                          |
| `--install`        | Mount the produced DMG and copy `Orbit.app` to `/Applications` |

**Output** (example for v0.1.0 on Apple Silicon):

```text
release/0.1.0/
  Orbit-0.1.0-aarch64.app.tar.gz
  Orbit-0.1.0-aarch64.dmg
  SHA256SUMS.txt
```

The release script must run on **macOS** with Xcode CLT, Node.js, Yarn, and Rust installed. The `release/` folder is gitignored.

### GitHub Releases (CI)

Push a semver tag to trigger [`.github/workflows/release.yml`](../.github/workflows/release.yml):

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow syncs the version from the tag, builds on GitHub's `macos-14` runner, and publishes `.dmg`, `.app.tar.gz`, and checksums to the GitHub Releases tab.

---

## Testing

### Frontend unit tests (Vitest)

Required when changing pure helpers under `apps/desktop/src/lib/`, theme tokens, library filter/sort logic, or the landing site (`apps/landing/src/`):

```bash
yarn test:unit
```

Watch mode while iterating:

```bash
yarn workspace @orbit/desktop test:unit:watch
yarn workspace @orbit/landing test:unit:watch
```

### Rust unit tests

Required when changing `apps/desktop/src-tauri/`:

```bash
yarn test:rust
```

### Playwright E2E

Runs against a production preview server with the mock API (`devMockApi.ts`):

```bash
yarn test:e2e
```

Interactive UI mode:

```bash
yarn test:e2e:ui
```

E2E specs (in `apps/desktop/e2e/`):

| Spec                              | Covers                                                                      |
| --------------------------------- | --------------------------------------------------------------------------- |
| `e2e/shell-flow.spec.ts`          | Default Liquid Glass shell — navigation, search, settings, controller focus |
| `e2e/macos-theme.spec.ts`         | Liquid Glass home, shelf, compact window, reduced motion                    |
| `e2e/themes.spec.ts`              | Color + game themes, legacy theme migration, theme studio save/delete       |
| `e2e/game-details.spec.ts`        | Game details controls and achievements                                      |
| `e2e/session-and-gamehub.spec.ts` | Session quick menu, GameHub manager, compact header logo                    |

`yarn test:e2e` builds the desktop app first (Nx `dependsOn`), then serves it with `vite preview`, so the specs always exercise current code.

Run E2E after changes to navigation, themes, controller focus, or screen layouts.

### Typecheck and format

```bash
yarn typecheck
yarn format:check    # or yarn format to fix
```

---

## Application data

On macOS, Orbit stores local data under Application Support:

```text
~/Library/Application Support/Orbit/
  orbit.db              # SQLite library database
  themes/*.json         # User-authored custom themes
```

Settings such as active theme id, optional RAWG API key, SteamGridDB API key, and
`autoEnrichOnImport` are stored in the SQLite `settings` table.

To reset local state during development, quit Orbit and remove `orbit.db` (this clears your library).

---

## Optional configuration

Orbit has no required `.env` file. Optional settings are configured in the app:

| Setting                 | Where       | Purpose                                                  |
| ----------------------- | ----------- | -------------------------------------------------------- |
| RAWG API key            | Settings UI | Artwork search + non-Steam enrichment fallback           |
| SteamGridDB API key     | Settings UI | Launcher grids/heroes/logos/icons on enrich              |
| Auto-enrich new imports | Settings UI | Runs after scan for newly inserted game IDs (default on) |
| Theme id                | Settings UI | Active built-in or custom theme                          |

In browser dev (`yarn dev`), theme id can also be set via `localStorage`:

```javascript
localStorage.setItem('orbit.themeId', 'god-of-war') // any built-in or custom theme id
```

---

## Metadata enrichment

Orbit fetches game descriptions from [TheGamesDB](https://api.thegamesdb.net/) and Steam artwork from [SteamGridDB](https://www.steamgriddb.com/). Results are cached locally in `metadata.sqlite` under Application Support.

Add keys to a project `.env` (loaded at startup) or save them in **Settings → Metadata & artwork**:

```bash
THE_GAMES_DB_API_KEY="your-thegamesdb-key"
STEAMGRIDDB_API_KEY="your-steamgriddb-bearer-token"
```

Use **Test connections** in Settings to verify both keys. Auto-enrich on import can be toggled there; manual fetch is available in **Edit Properties**.

Optional `RAWG_API_KEY` in Settings still powers artwork search in Edit Properties (Wikimedia Commons works without a key).

---

## Quality gates

Run before opening a PR (see [CONTRIBUTING.md](CONTRIBUTING.md)):

```bash
yarn run format:check
yarn run typecheck
yarn run test:unit      # when src/lib/, landing, or unit-tested helpers changed
yarn run test:rust      # when apps/desktop/src-tauri/ changed
yarn run build
yarn run test:e2e       # when desktop UI/navigation/themes changed
```

Cursor hooks in `.cursor/hooks.json` run `typecheck` and `test:rust` after agent edits.

Full gate list: [`.cursor/rules/quality-gating.mdc`](.cursor/rules/quality-gating.mdc).

---

## Troubleshooting

**`yarn tauri:dev` fails on Rust compile**

- Ensure Rust is installed: `rustc --version`
- Update toolchain: `rustup update stable`
- Clean and retry: `cargo clean --manifest-path apps/desktop/src-tauri/Cargo.toml`
- After moving the repo or pulling the monorepo layout, a build error like `failed to read plugin permissions … No such file` means cached build-script output points at the old path. Clean the Tauri crates: `cd apps/desktop/src-tauri && cargo clean -p tauri -p tauri-plugin-dialog -p tauri-plugin-opener -p orbit` (add `--release --target aarch64-apple-darwin` for release builds), or run `yarn clean` for a full reset.

**Disk usage grew while developing**

Rust incremental builds accumulate under `apps/desktop/src-tauri/target/` (often **5–15 GB**). This is normal for Tauri projects.

```bash
yarn clean:report   # show what is using space
yarn clean          # cargo clean + remove dist/test/release artifacts (~11 GB typical)
yarn clean:deep     # also prune global yarn + cargo caches (optional)
```

Orbit app data lives in `~/Library/Application Support/Orbit/` (SQLite + artwork). Do not delete that folder unless you intend to reset your library. GameHub/wine data under `~/Library/Application Support/com.gamemac.www/` is separate and can be much larger if you test GameHub games.

See `.cursor/skills/dev-storage-cleanup/SKILL.md` for the full cleanup workflow.

**Blank window or Vite connection refused**

- Confirm port `1420` is free (configured in `apps/desktop/vite.config.ts` and `apps/desktop/src-tauri/tauri.conf.json`)
- Kill stale Vite processes and restart `yarn tauri:dev`

**Frontend works in browser but not in Tauri**

- You may be relying on mock API behavior. Test with `yarn tauri:dev` before merging.
- Check the Tauri devtools console for invoke errors.

**Steam / Astris import finds nothing**

- Steam: ensure Steam is installed and has a library with games on this Mac.
- Astris: use Add game → scan and pick the folder containing `.nsp` / `.xci` files.
- GameHub importer is experimental.

**Cannot delete a game**

- Stop the active session first — Orbit blocks delete/clear while a game is running.

**Playwright E2E fails locally**

- E2E uses `yarn preview` on port `4173`. Ensure nothing else occupies that port.
- Run `yarn build` first if preview assets are stale.
- Use `yarn test:e2e:ui` to debug failing selectors interactively.

**Database looks corrupted**

- Quit Orbit, back up then remove `~/Library/Application Support/Orbit/orbit.db`, and restart (migrations re-run on first launch).

---

## Quick reference

```bash
yarn install              # Install dependencies
yarn tauri:dev            # Full desktop dev (recommended)
yarn dev                  # Frontend-only with mocks
yarn dev:landing          # Landing site (Next.js) on :3000
yarn build                # Desktop + landing production builds (Nx)
yarn tauri:build          # Release .app bundle
yarn release:macos        # Package .app + .dmg to release/<version>/
yarn typecheck            # TypeScript
yarn test:unit            # Vitest unit tests
yarn test:rust            # Rust unit tests
yarn test:e2e             # Playwright E2E
yarn format               # Prettier write
yarn format:check         # Prettier check
yarn metadata:fetch -- …  # Standalone metadata + artwork cache CLI
```
