---
name: security-checker
description: Runs Orbit's local security gate (gitleaks secret scan, OpenGrep/Semgrep static analysis, bun and cargo dependency audits) and triages findings. Use before a PR or release, after touching launch, paths, SQL or secrets, or when the user asks for a security scan.
---

# Security checker

Orbit has no CI, so this gate runs locally.

1. Run `bun run security` from the repository root. Parts: `security:secrets` (gitleaks over git history, `.gitleaks.toml`), `security:sast` (OpenGrep, or Semgrep, with `.opengrep.yml`), `security:audit` (`bun audit`, plus `cargo audit` when installed).
2. For each finding, decide whether it is real:
   - Real secret: remove it, rotate it, read it from `.env` (add a placeholder to `.env.example`). Never print the value.
   - Real code issue: fix it (argument arrays instead of shell strings, text instead of raw HTML) and add a regression test.
   - False positive: record it with a reason. Gitleaks: add the fingerprint to `.gitleaksignore`. OpenGrep: add a path exclude to the rule in `.opengrep.yml`. Ask the user before suppressing anything unclear.
3. Advisory in a dependency: update to the fixed version, pinned exactly, and rerun the gates.
4. Report what ran, what was found, and what was fixed or suppressed.

Missing tools: `brew install gitleaks semgrep`, `cargo install cargo-audit`.
