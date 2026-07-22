---
name: cleanup
description: >-
  Removes dead code and unnecessary log statements from the codebase.
  Use when you want to clean up legacy code, eliminate unused functions/variables/files,
  and strip out console logs or other non-essential debug output.
---

# Cleanup Skill

This skill scans the Orbit codebase to:

- Find and remove dead code (unused functions, variables, imports, files).
- Remove unnecessary logs (`console.log`, `console.debug`, `println!` debug noise).
- Ensure the codebase stays maintainable and production-ready.
- Leave business-critical or error logs intact; strip debug/noise only.

**Usage:** Run as part of routine maintenance or before release.

**Typical triggers:** "Remove dead code", "strip out logs", "clean up debug output",
"ensure no unused functions", "legacy cleanup"

**Note:** Review automated removal suggestions before acceptance. Cross-check with
quality gates (see `.cursor/rules/quality-gating.mdc`).

## Example requests

- "Remove all unused code and strip debug logs in `src/features/`."
- "Cleanup dead Rust helpers in `src-tauri/src/utils/`."
- "Ensure no leftover debug output before we merge this to main."

## See Also

- `.cursor/rules/quality-gating.mdc` for format, typecheck, and test gates
