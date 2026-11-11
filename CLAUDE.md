# Claude Code

Follow @AGENTS.md.

## Changing files

The repo is an Nx monorepo: `apps/desktop` (Tauri) and `apps/landing` (Next.js). Run commands from the root.

Before you finish a code change: write tests first (bug fixes need a regression); keep one context per file; review complexity and security (paths, launch, SQL, secrets); run `yarn format:check`, `yarn typecheck`, and the matching `yarn test:unit`, `yarn test:rust`, `yarn test:e2e`, and `yarn build`; keep `docs/` in sync.

## Committing

Only commit when asked. Use Conventional Commits. Skills are identical under `.claude/skills/`, `.cursor/skills/`, and `.opencode/skills/`.
