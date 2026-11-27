# Running Orbit

How to run Orbit locally, test changes, and troubleshoot common issues. For architecture and module layout, see [`docs/`](docs/).

---

## Prerequisites

| Tool          | Version                               | Notes                                     |
| ------------- | ------------------------------------- | ----------------------------------------- |
| **macOS**     | 12+                                   | Primary target; Apple Silicon recommended |
| **Node.js**   | 22+                                   | Required for frontend tooling             |
| **Bun**       | 1.4+ (`brew install oven-sh/bun/bun`) | Package manager                           |
| **Rust**      | stable                                | Install via [rustup](https://rustup.rs)   |
| **Xcode CLT** | Latest                                | `xcode-select --install`                  |

Optional for E2E:

| Tool                | Notes                                               |
| ------------------- | --------------------------------------------------- |
| Playwright browsers | Installed automatically on first `bun run test:e2e` |

---

## First-time setup

```bash
git clone <repo-url> orbit
cd orbit
bun install
bun run tauri:dev
```

The first `tauri:dev` run compiles Rust dependencies and may take several minutes.

The repo is an Nx monorepo: the desktop app is `apps/desktop` and the landing site is
`apps/landing`. Run every command below from the repo root; root scripts delegate to Nx.

---

## Development modes

### Option A — Full desktop app (recommended)

Runs the Tauri shell with hot reload on the Vite dev server and the real SQLite backend:

```bash
bun run tauri:dev
```

| Detail        | Value                                                   |
| ------------- | ------------------------------------------------------- |
| Vite dev URL  | `http://localhost:1420` (`apps/desktop/vite.config.ts`) |
| Database      | `~/Library/Application Support/Orbit/orbit.sqlite3`     |
| Custom themes | `~/Library/Application Support/Orbit/themes/`           |

Use this mode when working on importers, launch, SQLite, native dialogs, or window management.

### Option B — Frontend only (faster UI iteration)

Runs Vite with a mock Tauri API — no Rust compile, no real filesystem access:

```bash
bun run dev
```

Open `http://localhost:1420`. Mock data comes from `apps/desktop/src/lib/devMockApi.ts`.

Use this mode for UI, themes, controller focus, and layout work. Switch to `bun run tauri:dev` before merging anything that touches Tauri commands or importers.

### Landing site

```bash
bun run dev:landing
```

Opens the Next.js site on `http://localhost:3000`. Download pages read live data from the
GitHub Releases API; set `GITHUB_TOKEN` in `apps/landing/.env.local` if you hit the
unauthenticated rate limit. See [docs/LANDING.md](docs/LANDING.md) for routes and Vercel deploy.

---

## Building a release

### Quick build

```bash
bun run tauri:build
```

Produces a macOS `.app` bundle under `apps/desktop/src-tauri/target/release/bundle/macos/` and a `.dmg` installer. The DMG skips Finder icon layout because macOS blocks that AppleScript unless the terminal is allowed to control Finder. The app and the Applications link are still in the image.

### Release script (recommended)

Collects versioned artifacts and checksums into `release/<version>/`:

```bash
bun run release:macos
```

| Flag               | Description                                                    |
| ------------------ | -------------------------------------------------------------- |
| `--arch native`    | Default — matches the current Mac (`aarch64` or `x86_64`)      |
| `--arch universal` | Universal binary (Apple Silicon + Intel)                       |
| `--arch aarch64`   | Apple Silicon only                                             |
| `--arch x86_64`    | Intel only                                                     |
| `--skip-tests`     | Skip `bun run test:rust`                                       |
| `--skip-typecheck` | Skip `bun run typecheck`                                       |
| `--install`        | Mount the produced DMG and copy `Orbit.app` to `/Applications` |

**Output** (example for v0.1.0 on Apple Silicon):

```text
release/0.1.0/
  Orbit-0.1.0-aarch64.app.tar.gz
  Orbit-0.1.0-aarch64.dmg
  SHA256SUMS.txt
```

The release script must run on **macOS** with Xcode CLT, Node.js, Bun, and Rust installed. The `release/` folder is gitignored.

### Publishing a release

Pushing a release tag publishes the release on CircleCI's macOS runners
(`.circleci/config.yml`); `bun run release:macos -- --publish` does the same from a Mac.
People install Orbit once from the DMG; after that, Orbit offers each new release in an
update dialog when it opens (Tauri updater). Updates are signed with Orbit's updater key, and
installed Orbits only accept an update signed with it.

Once per machine, create the key (no password) and commit the public key it writes to
`apps/desktop/src-tauri/tauri.conf.json`:

```bash
bun run release:macos -- --init-key   # ~/.tauri/orbit.key and orbit.key.pub
```

Back up `~/.tauri/orbit.key` somewhere safe (a password manager or an encrypted drive). It
has no password, so the file is the only protection: anyone who has it can sign an update
installed Orbits accept. Without it no installed Orbit can be updated again; a new key means
everyone reinstalls from the DMG.

Each release:

```bash
git checkout main && git pull
bun run monopipeline release 2.6.1 --summary "Short release summary"
# Fill in CHANGELOG.md and .github/release-notes/2.6.1.md (the update dialog shows it), then:
git commit -am "chore(release): prepare v2.6.1"   # git add the new release-notes file first
git push origin main
git tag -a v2.6.1 -m "Orbit 2.6.1" && git push origin v2.6.1   # CircleCI publishes it
```

To publish from a Mac instead (CircleCI down or out of minutes), run
`bun run release:macos -- --publish` after pushing the tag.

`--publish` builds and signs the release, verifies the update's signature against the
public key in `tauri.conf.json`, writes `latest.json`, uploads everything to a draft
release `v2.6.1`, then publishes it as latest. Installed Orbits read
`releases/latest/download/latest.json`, so Orbit Wine releases are never marked latest.
Without `--publish` the script only builds into `release/<version>/`.

#### CircleCI setup (once)

1. Sign in to CircleCI with GitHub and set up this repository (it reads
   `.circleci/config.yml`).
2. Organization Settings → Contexts → create `orbit-release`, restricted to your security
   group, with two variables:
   - `TAURI_SIGNING_PRIVATE_KEY`: the contents of `~/.tauri/orbit.key`
     (`pbcopy < ~/.tauri/orbit.key`).
   - `GH_TOKEN`: a fine-grained GitHub token for this repository with **Contents: read and
     write** (creating releases needs it).
3. Push a release tag. The job uses the `m4pro.medium` Mac (200 credits a minute; the free
   plan's 30,000 macOS credits are about 150 minutes a month) and keeps the release files
   as job artifacts.

Context variables are not passed to builds of forked pull requests, and the workflow only
runs for `v<version>` tags.

The landing site lists the release within two minutes (GitHub Releases API), and Netlify
redeploys `/changelog` because the release commit changes `CHANGELOG.md`.

---

## Testing

### Frontend unit tests (Vitest)

Required when changing pure helpers under `apps/desktop/src/lib/`, theme tokens, library filter/sort logic, or the landing site (`apps/landing/src/`):

```bash
bun run test:unit
```

Watch mode while iterating:

```bash
bun run --cwd apps/desktop test:unit:watch
bun run --cwd apps/landing test:unit:watch
```

### Rust unit tests

Required when changing `apps/desktop/src-tauri/`:

```bash
bun run test:rust
```

### Playwright E2E

Runs against a production preview server with the mock API (`devMockApi.ts`):

```bash
bun run test:e2e
```

Interactive UI mode:

```bash
bun run test:e2e:ui
```

E2E specs (in `apps/desktop/e2e/`):

| Spec                              | Covers                                                                      |
| --------------------------------- | --------------------------------------------------------------------------- |
| `e2e/shell-flow.spec.ts`          | Default Liquid Glass shell — navigation, search, settings, controller focus |
| `e2e/macos-theme.spec.ts`         | Liquid Glass home, shelf, compact window, reduced motion                    |
| `e2e/themes.spec.ts`              | Color + game themes, legacy theme migration, theme studio save/delete       |
| `e2e/game-details.spec.ts`        | Game details controls and achievements                                      |
| `e2e/session-and-library.spec.ts` | Session quick menu, Steam library folders, compact header logo              |

`bun run test:e2e` builds the desktop app first (Nx `dependsOn`), then serves it with `vite preview`, so the specs always exercise current code.

Run E2E after changes to navigation, themes, controller focus, or screen layouts.

### Typecheck and format

```bash
bun run typecheck
bun run knip
bun run format:check    # or bun run format to fix
```

---

## Application data

On macOS, Orbit stores local data under Application Support:

```text
~/Library/Application Support/Orbit/
  orbit.sqlite3         # SQLite library + settings
  steam-windows/        # Signed-in Windows Steam prefix (do not delete)
  themes/*.json         # User-authored custom themes
```

Settings such as active theme id, optional RAWG API key, SteamGridDB API key, and
`autoEnrichOnImport` are stored in the SQLite `settings` table.

Do not delete the whole `Orbit/` folder or `steam-windows/` while developing — that
wipes the Windows Steam login and settings. See
[`.cursor/rules/preserve-user-data.mdc`](.cursor/rules/preserve-user-data.mdc).
To reset **only** the game library, quit Orbit and remove `orbit.sqlite3` after a backup.

---

## Optional configuration

Orbit has no required `.env` file. Optional settings are configured in the app:

| Setting                 | Where       | Purpose                                                  |
| ----------------------- | ----------- | -------------------------------------------------------- |
| RAWG API key            | Settings UI | Artwork search + non-Steam enrichment fallback           |
| SteamGridDB API key     | Settings UI | Launcher grids/heroes/logos/icons on enrich              |
| Auto-enrich new imports | Settings UI | Runs after scan for newly inserted game IDs (default on) |
| Theme id                | Settings UI | Active built-in or custom theme                          |

In browser dev (`bun run dev`), theme id can also be set via `localStorage`:

```javascript
localStorage.setItem('orbit.themeId', 'god-of-war') // any built-in or custom theme id
```

---

## Metadata enrichment

Orbit fetches game descriptions from [TheGamesDB](https://api.thegamesdb.net/) and Steam artwork from [SteamGridDB](https://www.steamgriddb.com/). Results are cached locally in `metadata.sqlite` under Application Support.

Add keys to a project `.env` (loaded at startup) or save them in **Settings → General**:

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
bun run format:check
bun run knip
bun run typecheck
bun run test:unit      # when src/lib/, landing, or unit-tested helpers changed
bun run test:rust      # when apps/desktop/src-tauri/ changed
bun run build
bun run test:e2e       # when desktop UI/navigation/themes changed
```

Cursor hooks in `.cursor/hooks.json` run `typecheck` and `test:rust` after agent edits.

Full gate list: [`.cursor/rules/quality-gating.mdc`](.cursor/rules/quality-gating.mdc).

---

## Troubleshooting

**`bun run tauri:dev` fails on Rust compile**

- Ensure Rust is installed: `rustc --version`
- Update toolchain: `rustup update stable`
- Clean and retry: `cargo clean --manifest-path apps/desktop/src-tauri/Cargo.toml`
- After moving the repo or pulling the monorepo layout, a build error like `failed to read plugin permissions … No such file` means cached build-script output points at the old path. Clean the Tauri crates: `cd apps/desktop/src-tauri && cargo clean -p tauri -p tauri-plugin-dialog -p tauri-plugin-opener -p orbit` (add `--release --target aarch64-apple-darwin` for release builds), or run `bun run clean` for a full reset.

**Disk usage grew while developing**

Rust incremental builds accumulate under `apps/desktop/src-tauri/target/` (often **5–15 GB**). This is normal for Tauri projects.

```bash
bun run clean:report   # show what is using space
bun run clean          # cargo clean + remove dist/test/release artifacts (~11 GB typical)
bun run clean:deep     # also prune global Bun + cargo caches (optional)
```

Orbit app data lives in `~/Library/Application Support/Orbit/` (SQLite, artwork,
themes, and `steam-windows/`). Do not delete that folder unless you intend to
reset the library **and** the Windows Steam session.

See `.cursor/skills/dev-storage-cleanup/SKILL.md` for the full cleanup workflow.

**Blank window or Vite connection refused**

- Confirm port `1420` is free (configured in `apps/desktop/vite.config.ts` and `apps/desktop/src-tauri/tauri.conf.json`)
- Kill stale Vite processes and restart `bun run tauri:dev`

**Frontend works in browser but not in Tauri**

- You may be relying on mock API behavior. Test with `bun run tauri:dev` before merging.
- Check the Tauri devtools console for invoke errors.

**Steam / Astris import finds nothing**

- Steam: ensure Steam is installed and has a library with games on this Mac.
- Astris: use Add game → scan and pick the folder containing `.nsp` / `.xci` files.
- Additional Steam library folders: Settings → Library.

**Cannot delete a game**

- Stop the active session first — Orbit blocks delete/clear while a game is running.

**Playwright E2E fails locally**

- E2E uses `bun run preview` on port `4173`. Ensure nothing else occupies that port.
- Run `bun run build` first if preview assets are stale.
- Use `bun run test:e2e:ui` to debug failing selectors interactively.

**Database looks corrupted**

- Quit Orbit, back up then remove `~/Library/Application Support/Orbit/orbit.db`, and restart (migrations re-run on first launch).

---

## Quick reference

```bash
bun install              # Install dependencies
bun run tauri:dev            # Full desktop dev (recommended)
bun run dev                  # Frontend-only with mocks
bun run dev:landing          # Landing site (Next.js) on :3000
bun run build                # Desktop + landing production builds (Nx)
bun run tauri:build          # Release .app bundle
bun run release:macos        # Package .app + .dmg to release/<version>/
bun run typecheck            # TypeScript
bun run test:unit            # Vitest unit tests
bun run test:rust            # Rust unit tests
bun run test:e2e             # Playwright E2E
bun run format               # Prettier write
bun run format:check         # Prettier check
bun run knip                 # Unused files, exports, and dependencies
bun run metadata:fetch -- …  # Standalone metadata + artwork cache CLI
```
