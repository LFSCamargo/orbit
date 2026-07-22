# Running Orbit

How to run Orbit locally, test changes, and troubleshoot common issues. For architecture and module layout, see [`docs/`](docs/).

---

## Prerequisites

| Tool | Version | Notes |
| ---- | ------- | ----- |
| **macOS** | 12+ | Primary target; Apple Silicon recommended |
| **Node.js** | 22+ | Required for frontend tooling |
| **Yarn** | 1.x or compatible | Package manager |
| **Rust** | stable | Install via [rustup](https://rustup.rs) |
| **Xcode CLT** | Latest | `xcode-select --install` |

Optional for E2E:

| Tool | Notes |
| ---- | ----- |
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

---

## Development modes

### Option A — Full desktop app (recommended)

Runs the Tauri shell with hot reload on the Vite dev server and the real SQLite backend:

```bash
yarn tauri:dev
```

| Detail | Value |
| ------ | ----- |
| Vite dev URL | `http://localhost:1420` (from `tauri.conf.json`) |
| Database | `~/Library/Application Support/Orbit/orbit.db` |
| Custom themes | `~/Library/Application Support/Orbit/themes/` |

Use this mode when working on importers, launch, SQLite, native dialogs, or window management.

### Option B — Frontend only (faster UI iteration)

Runs Vite with a mock Tauri API — no Rust compile, no real filesystem access:

```bash
yarn dev
```

Open the URL printed by Vite (default `http://localhost:5173`). Mock data comes from `src/lib/devMockApi.ts`.

Use this mode for UI, themes, controller focus, and layout work. Switch to `yarn tauri:dev` before merging anything that touches Tauri commands or importers.

---

## Building a release

### Quick build

```bash
yarn tauri:build
```

Produces a macOS `.app` bundle under `src-tauri/target/release/bundle/macos/`. A `.dmg` installer is also created when Tauri's bundler succeeds.

### Release script (recommended)

Collects versioned artifacts and checksums into `release/<version>/`:

```bash
yarn release:macos
```

| Flag | Description |
| ---- | ----------- |
| `--arch native` | Default — matches the current Mac (`aarch64` or `x86_64`) |
| `--arch universal` | Universal binary (Apple Silicon + Intel) |
| `--arch aarch64` | Apple Silicon only |
| `--arch x86_64` | Intel only |
| `--skip-tests` | Skip `yarn test:rust` |
| `--skip-typecheck` | Skip `yarn typecheck` |

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

### Rust unit tests

Required when changing `src-tauri/`:

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

E2E specs:

| Spec | Covers |
| ---- | ------ |
| `e2e/orbit-ui-flow.spec.ts` | Orbit default theme — hero, glass panel, focus, navigation |
| `e2e/switch-ui-flow.spec.ts` | Switch 2 theme shell |
| `e2e/ui-flow.spec.ts` | Shared UI flows |

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

Settings such as active theme id and optional RAWG API key are stored in the SQLite `settings` table.

To reset local state during development, quit Orbit and remove `orbit.db` (this clears your library).

---

## Optional configuration

Orbit has no required `.env` file. Optional settings are configured in the app:

| Setting | Where | Purpose |
| ------- | ----- | ------- |
| RAWG API key | Settings UI | Artwork search via `search_public_artwork` |
| Theme id | Settings UI | Active built-in or custom theme |

In browser dev (`yarn dev`), theme id can also be set via `localStorage`:

```javascript
localStorage.setItem('orbit.themeId', 'orbit')   // orbit | ps5 | switch-2
```

---

## Quality gates

Run before opening a PR (see [CONTRIBUTING.md](CONTRIBUTING.md)):

```bash
yarn run format:check
yarn run typecheck
yarn run test:rust      # when src-tauri/ changed
yarn run build
yarn run test:e2e       # when UI/navigation/themes changed
```

Cursor hooks in `.cursor/hooks.json` run `typecheck` and `test:rust` after agent edits.

Full gate list: [`.cursor/rules/quality-gating.mdc`](.cursor/rules/quality-gating.mdc).

---

## Troubleshooting

**`yarn tauri:dev` fails on Rust compile**

- Ensure Rust is installed: `rustc --version`
- Update toolchain: `rustup update stable`
- Clean and retry: `cargo clean --manifest-path src-tauri/Cargo.toml`

**Blank window or Vite connection refused**

- Confirm port `1420` is free (configured in `src-tauri/tauri.conf.json`)
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
yarn build                # Typecheck + Vite production build
yarn tauri:build          # Release .app bundle
yarn release:macos        # Package .app + .dmg to release/<version>/
yarn typecheck            # TypeScript
yarn test:rust            # Rust unit tests
yarn test:e2e             # Playwright E2E
yarn format               # Prettier write
yarn format:check         # Prettier check
```
