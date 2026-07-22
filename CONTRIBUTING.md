# Contributing to Orbit

Thank you for helping improve Orbit. This guide covers setup, expectations, and how to open a good pull request.

For day-to-day commands and troubleshooting, see [RUNNING.md](RUNNING.md). For architecture, see [`docs/`](docs/).

---

## Getting started

1. Fork and clone the repository.
2. Install prerequisites from [RUNNING.md](RUNNING.md#prerequisites).
3. Run the app locally:

   ```bash
   yarn install
   yarn tauri:dev
   ```

4. Create a branch from `main`:

   ```bash
   git checkout -b feat/short-description
   ```

---

## What to work on

Good contribution areas:

- UI polish, theme layouts, and controller navigation
- Importers (Steam, Astris, GameHub, native apps)
- Launch reliability and session tracking
- Playwright E2E coverage for user flows
- Rust unit tests for path parsing and repository logic
- Documentation fixes and theme examples

Please **open an issue first** for large features or architectural changes so we can align on scope.

### Out of scope

Do not open PRs for:

- ROM downloads, decryption, or keys management
- Bundling or distributing emulators
- Steam account authentication or cloud sync
- Automatic artwork scraping pipelines (RAWG search in Settings is the supported path)

See [docs/DESIGN_DOC.mdc](docs/DESIGN_DOC.mdc) for the full product boundary.

---

## Development workflow

### Pick the right dev mode

| Change type | Dev command |
| ----------- | ----------- |
| Rust, SQLite, importers, launch | `yarn tauri:dev` |
| React UI, themes, focus system | `yarn dev` for speed, then `yarn tauri:dev` before PR |
| E2E specs | `yarn test:e2e` (uses preview + mock API) |

### Code organization

Follow the modular layout documented in:

- Frontend: [docs/FRONTEND.mdc](docs/FRONTEND.mdc) and [`.cursor/rules/spaghetti-checker.mdc`](.cursor/rules/spaghetti-checker.mdc)
- Rust: [docs/TAURI.mdc](docs/TAURI.mdc)
- Themes: [docs/UI.mdc](docs/UI.mdc) and [docs/THEMES.md](docs/THEMES.md)

Guidelines:

- **One context per file** — one page, component, hook, or command group per file.
- **Thin Tauri commands** — delegate to services, importers, or `GameRepository`.
- **No frontend launch logic** — always go through `src/lib/tauri.ts`.
- **Match existing style** — Prettier, `@/` imports, Zustand/TanStack Query patterns.

### Tests

| Layer | When required | Command |
| ----- | ------------- | ------- |
| Rust | Any `src-tauri/` logic change | `yarn test:rust` |
| E2E | Navigation, themes, focus, new screens | `yarn test:e2e` |
| Typecheck | All TS/TSX changes | `yarn typecheck` |

Bug fixes should include a regression test when practical. See [`.cursor/rules/test-driven.mdc`](.cursor/rules/test-driven.mdc).

---

## Quality gates

All gates must pass before a PR is ready for review:

```bash
yarn run format:check
yarn run typecheck
yarn run test:rust      # if src-tauri/ touched
yarn run build
yarn run test:e2e       # if UI/navigation/themes touched
```

Do not:

- Use `@ts-ignore` or `any` to bypass type errors without justification
- Skip or delete failing tests to make CI green
- Commit debug `console.log` / `println!` noise
- Commit secrets (RAWG keys, API tokens)

Security-sensitive changes (paths, launch, SQL): review [`.cursor/rules/security-first.mdc`](.cursor/rules/security-first.mdc).

---

## Documentation

Update docs in the **same PR** when you change behavior not already described:

| Change | Update |
| ------ | ------ |
| New screen or flow | [docs/DESIGN_DOC.mdc](docs/DESIGN_DOC.mdc), [docs/FRONTEND.mdc](docs/FRONTEND.mdc) |
| New Tauri command | [docs/DESIGN_DOC.mdc](docs/DESIGN_DOC.mdc), [docs/TAURI.mdc](docs/TAURI.mdc), `src/lib/tauri.ts` |
| New theme field | [docs/UI.mdc](docs/UI.mdc), [docs/THEMES.md](docs/THEMES.md) |
| New script or dev workflow | [docs/PROJECT.mdc](docs/PROJECT.mdc), [RUNNING.md](RUNNING.md) |
| Folder structure change | Matching doc tree + [README.md](README.md) if top-level |

See [`.cursor/rules/docs-sync.mdc`](.cursor/rules/docs-sync.mdc).

---

## Pull requests

1. Keep PRs focused — one feature or fix per PR when possible.
2. Fill out the PR template (`.github/PULL_REQUEST_TEMPLATE.md`).
3. Include screenshots or screen recordings for UI changes.
4. List which gates you ran in the test plan.
5. Link related issues if applicable.

### Commit messages

Prefer [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat: add GameHub folder scan
fix: restore hero blur on theme switch
docs: update RUNNING.md troubleshooting
test: add regression for focus ring on back nav
```

### Review expectations

Reviewers will check:

- Controller navigability on changed screens
- Correct dev mode was used (mock vs Tauri)
- Tests and docs updated
- No scope creep into out-of-scope features

---

## Questions

Open a GitHub issue for bugs, feature requests, or design questions. For theme authoring help, start with [docs/THEMES.md](docs/THEMES.md).
