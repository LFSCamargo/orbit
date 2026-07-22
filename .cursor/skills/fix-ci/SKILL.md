---
name: fix-ci
description: >-
  Runs Orbit quality gates locally, fixes failures in order, and asks the user
  targeted questions when a failure needs a product or scope decision. Use when
  checks fail, pre-commit hooks fail, or the user asks to fix CI / quality gates.
---

# Fix CI

Run Orbit quality gates locally, fix failures gate-by-gate, and re-run until green.
Source of truth: `.cursor/rules/quality-gating.mdc`, [docs/PROJECT.mdc](../../docs/PROJECT.mdc).

## Quick reference — local commands

| Gate | Command |
| ---- | ------- |
| Format | `yarn run format:check` |
| Typecheck | `yarn run typecheck` |
| Rust tests | `yarn run test:rust` |
| E2E | `yarn run test:e2e` |
| Frontend build | `yarn run build` |
| Release build | `yarn run tauri:build` |

## Workflow

```
- [ ] Step 1: Identify failing gate(s)
- [ ] Step 2: Sync deps (`yarn install`)
- [ ] Step 3: Run matching gate — capture full output
- [ ] Step 4: Classify failure (straightforward vs needs user input)
- [ ] Step 5: Fix or ask user
- [ ] Step 6: Re-run failed gate, then downstream gates
- [ ] Step 7: Confirm all gates green locally
```

### Run gates in order

Run **only** the failing gate first. After it passes, run subsequent gates:

```bash
yarn run format:check
yarn run typecheck
yarn run test:rust
yarn run build
yarn run test:e2e
```

For Rust-only changes, you can narrow to `yarn run test:rust` first.
For UI/theme/controller changes, include `yarn run test:e2e`.

### Classify failures

| Category | Examples | Action |
| -------- | -------- | ------ |
| **Straightforward** | Prettier drift, type error in touched file, failing Rust unit test | Fix immediately |
| **Needs user input** | E2E flake, breaking Tauri API change, ambiguous product behavior | Ask user first |
| **Out of scope** | Unrelated test failure on another screen | Report; suggest separate fix |

### Gate-specific fixes

| Gate | Fix approach | Rule reference |
| ---- | ------------ | -------------- |
| Format | Run `yarn run format` or fix Prettier issues | quality-gating |
| Typecheck | Fix types at source; no `@ts-ignore` | quality-gating |
| Rust tests | Fix logic in `src-tauri/`; add regression test | test-driven |
| E2E | Fix selectors/flows; update Playwright spec if UI changed intentionally | test-driven |
| Build | Fix compile/bundle errors | spaghetti-checker |
| Layout | Split oversized files per module layout | spaghetti-checker |

### Ask user before fixing (required when blocked)

1. **E2E failures** that may be intentional UI redesign vs regression.
2. **Tauri command contract** changes that affect existing clients.
3. **Multiple valid fixes** (large refactor vs narrow patch).
4. **Ambiguous product behavior** — test asserts behavior you're unsure is intended.

## Do not

- Disable type checks, skip tests, or weaken gates to pass.
- Use `@ts-ignore` or `any` without user approval.
- Change unrelated modules to fix a gate unless user approves scope expansion.
- Declare done without re-running the gates that failed.

## Related

- Quality gate list: `.cursor/rules/quality-gating.mdc`
- PR description after green checks: `write-pr-description` skill
