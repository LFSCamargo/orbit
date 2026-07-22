---
name: write-pr-description
description: >-
  Drafts pull request descriptions for the current branch. Use when the user asks
  for a PR description, PR body, or to write/open a pull request for the current branch.
---

# Write PR Description

Generates a PR description from **branch changes** for Orbit.

## Workflow

```
- [ ] Step 1: Gather git context (parallel)
- [ ] Step 2: Analyze commits and diff
- [ ] Step 3: Fill PR sections
- [ ] Step 4: Output markdown (+ create PR if asked)
```

### Step 1: Gather git context

Run these **in parallel** from the repo root:

```bash
git status
git branch -vv
git log --oneline -20
```

Resolve the base branch (`main` or `master`):

```bash
BASE=$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master)
git log --oneline "$BASE"..HEAD
git diff "$BASE"...HEAD --stat
git diff "$BASE"...HEAD --name-only
```

### Step 2: Analyze changes

From commits + diff, identify:

| Signal | Where to look |
| ------ | ------------- |
| Feature scope | `src/features/`, `src/components/` |
| Tauri / backend | `src-tauri/src/commands/`, `importers/`, `launching/` |
| Themes | `src/themes/`, `docs/UI.mdc`, `docs/THEMES.md`, `docs/examples/` |
| Controller / focus | `src/controllers/` |
| Tests | `e2e/`, `src-tauri/**` `#[cfg(test)]` |
| Docs | `docs/*.mdc`, `README.md` |

Read key changed files when the diff stat alone is ambiguous.

### Step 3: Fill PR sections

```markdown
## Summary

<!-- 1–3 bullets: concrete changes grouped by area (frontend, Tauri, themes, docs). -->

## Why

<!-- User-facing motivation and problem solved. -->

## Test plan

- [ ] `yarn run typecheck`
- [ ] `yarn run test:rust` (if `src-tauri/` touched)
- [ ] `yarn run test:e2e` (if UI/navigation/themes touched)
- [ ] Manual: controller navigation / launch flow (if applicable)

## Screenshots / recordings

<!-- UI changes: note what to capture. Backend-only: "N/A — no visual changes". -->
```

**Section rules:**

- **Summary** — factual, reviewer-oriented bullets; call out new Tauri commands, screens, and theme fields.
- **Why** — user impact, not implementation detail.
- **Test plan** — leave unchecked unless the user confirms.
- **Screenshots** — never leave empty without a note for non-UI PRs.

**Title (when creating the PR):** conventional style, e.g.
`feat: add GameHub folder scan importer` or `fix: restore hero blur on theme switch`.

### Step 4: Deliver output

**Description only (default):** return filled markdown in chat. Do not create a PR unless asked.

**Create PR (when requested):** push if needed, then `gh pr create` with HEREDOC body.

## Quality bar

- Summarize **all commits** on the branch (`$BASE..HEAD`), not only the latest.
- Do not invent features not present in the diff.
- Mention Tauri command / importer contract changes explicitly.
- Note docs updates when `README.md` or `docs/` was touched.

## Do not

- Push or open a PR without explicit user request.
- Mark test plan items as done without user confirmation.
- Dump raw `git diff` output into the PR body.
