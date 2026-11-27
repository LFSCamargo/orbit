---
name: folder-pattern-manager
description: >-
  Organizes Orbit application folders to match the one-context layout.
  Use when the user calls folder-pattern manager, asks to organize
  application folders, or asks where a new screen, command, hook, or
  component should live.
---

# Folder-pattern manager

Check the application trees, then move files that break the layout. The canonical trees are in `.cursor/rules/spaghetti-checker.mdc`. Read that rule first. Do not invent top-level folders.

## Check

Walk only:

- `apps/desktop/src`
- `apps/desktop/src-tauri/src`
- `apps/landing/src`

A file is misplaced when it has more than one of: page, component, hook, store, Tauri command group, importer, or service. A file is also misplaced when it lives outside the tree in the spaghetti-checker rule.

Report every finding before moving anything:

```
## Folder-pattern violations
- `current/path` → `required/path` — reason
```

Write `None.` when the trees match.

## Organize

Move only the reported files.

- New screen → `apps/desktop/src/modules/<name>/`.
- Module-only UI stays in that module's `components/`. Shared UI → `apps/desktop/src/components/<area>/`, one component per file.
- Shared hook → `src/hooks/`. Zustand store → `src/stores/*.store.ts`.
- Tauri command group → `src-tauri/src/commands/`. Importer → `importers/`. Service → `services/`. `lib.rs` stays wiring only.
- Landing UI → `apps/landing/src/components/<area>/`, one component per file. Helpers → `src/lib/`.

Update imports in the same change. Update the folder tree in the matching doc when a directory is added or renamed. Run `bun run typecheck` for each app whose imports moved. Do not move tests away from the module they cover.
