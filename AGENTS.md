# Agent instructions

Cursor, Claude Code, and OpenCode follow this file. Cursor also loads `.cursor/rules/`. Claude Code also loads `CLAUDE.md`. Project skills (`cleanup`, `dev-storage-cleanup`, `fix-ci`, `write-pr-description`) are identical copies under `.cursor/skills/`, `.claude/skills/`, and `.opencode/skills/`. Edit `.cursor/skills/`, then run `yarn sync:skills`. MCP servers live in `.cursor/mcp.json`, `.mcp.json` (Claude Code), and `opencode.json` (OpenCode); keep them in step.

Do not finish work that skipped a required check. Do not commit or push unless the user asked.

## What this repo is

Orbit is a controller-first desktop game launcher for macOS (Apple Silicon first), built with Tauri 2, React, TypeScript, and SQLite. Rust owns all I/O (filesystem, process launch, SQLite, importers); the frontend only invokes typed Tauri commands through `src/lib/tauri.ts`. Source of truth: [docs/DESIGN_DOC.mdc](docs/DESIGN_DOC.mdc).

The repo is an Nx monorepo on Yarn 1 workspaces. Run all commands from the root; root scripts delegate to Nx.

| App            | Nx project | Role                                                                                                 |
| -------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| `apps/desktop` | `desktop`  | The Tauri launcher. Its `package.json` version is the release version.                               |
| `apps/landing` | `landing`  | Next.js site on Vercel: overview, install guide, downloads per GitHub Release. See `docs/LANDING.md` |

Apps never import from each other.

## Layout

Desktop paths are relative to `apps/desktop/`.

| Path                    | Role                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `src/app`               | App shell, providers, screen routing only                                               |
| `src/modules/<name>`    | Route-level pages with colocated `components/` and `hooks/`                             |
| `src/components/<area>` | Reusable cross-module UI, one component per file                                        |
| `src/controllers`       | Gamepad and spatial focus, one concern per file                                         |
| `src/hooks`, `stores`   | One hook per file; one Zustand store per `*.store.ts`                                   |
| `src/themes`            | Built-in theme shells, catalog, studio                                                  |
| `src/lib`               | Pure helpers, Tauri wrappers, formatters                                                |
| `src-tauri/src`         | `commands/`, `database/`, `importers/`, `launching/`, `models/`, `services/`, `utils/`  |
| `e2e/`                  | Playwright specs                                                                        |
| `apps/landing/src`      | `app/` routes, `components/<area>/` one per file, `lib/` release parsing + GitHub fetch |
| `scripts/` (root)       | Release, version sync, cleanup, agent skill sync                                        |
| `docs/` (root)          | Design, Tauri, frontend, UI, theme, and landing docs                                    |

Detailed rules: `.cursor/rules/spaghetti-checker.mdc`, `.cursor/rules/project-overview.mdc`.

## Changing files

After any code, script, or test change, finish all of these before you stop:

1. **Write tests first.** Rust `#[cfg(test)]` modules, Vitest under `src/**/__tests__/` (either app), or Playwright in `apps/desktop/e2e/`. Landing tests use fixtures, never the live GitHub API. Every reported bug fix needs a regression test, including component state and overlay/stacking bugs. Critical paths (launch session, library import, theme switching, controller focus) need Rust or E2E coverage. See `.cursor/rules/test-driven.mdc` and `.cursor/rules/regression-testing.mdc`.
2. **Keep one context per file.** New screen → `src/modules/`; new command group → `src-tauri/src/commands/`; new importer → `src-tauri/src/importers/`. `lib.rs` is wiring only.
3. **Check complexity.** No nested loops over library lists, no `invoke` or SQLite calls inside loops, no unbounded queries, no decoding full artwork blobs for thumbnail grids. Add a short complexity note for non-trivial code. See `.cursor/rules/o1-check.mdc`.
4. **Check security.** Validate and canonicalize paths in Rust, reject `..` traversal, parameterized SQL only, whitelist launch targets, treat user theme JSON and the GitHub Releases payload as untrusted, keep `GITHUB_TOKEN` server-only, no `eval` or `dangerouslySetInnerHTML`, no secrets in source or logs. See `.cursor/rules/security-first.mdc`.
5. **Run the gates** for what you touched (list below). Never use `@ts-ignore` or `any` to pass, and never skip or delete a failing test. See `.cursor/rules/quality-gating.mdc`.
6. **Keep docs in sync.** Scope or command contract → `docs/DESIGN_DOC.mdc` first, then `docs/TAURI.mdc`, `docs/FRONTEND.mdc`, or `docs/UI.mdc`. Theme fields → `docs/UI.mdc`, `docs/THEMES.md`, and `docs/examples/`. Landing routes or release parsing → `docs/LANDING.md`. Folder changes → update the trees. See `.cursor/rules/docs-sync.mdc`.

Docs-only edits skip tests when runtime behavior did not change. Still scan for secrets.

## Commands

```bash
yarn install
yarn dev                 # desktop frontend only, mock Tauri API
yarn tauri:dev           # full desktop app
yarn dev:landing         # landing site on :3000
yarn format:check
yarn typecheck           # both apps
yarn test:unit           # Vitest, both apps
yarn test:rust           # apps/desktop/src-tauri changes
yarn test:e2e            # desktop navigation, themes, imports, UI flows
yarn build               # desktop + landing
yarn nx run <app>:<target>  # one app, e.g. landing:build
yarn tauri:build         # release changes
yarn check:skills        # agent skill copies match .cursor/skills
```

## Out of scope

ROM downloads or decryption, key management, emulator distribution, automatic online artwork scraping, Steam account auth, cloud sync, social features. Do not implement or document them.

## Committing

Only commit when asked. Use Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, …). No commented-out code, debug logs, or secrets in the diff. For PR bodies follow the `write-pr-description` skill.
