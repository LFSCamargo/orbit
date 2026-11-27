#!/usr/bin/env bash
# Local security gate: secrets (gitleaks), static analysis (OpenGrep, or
# Semgrep when OpenGrep is not installed) and dependency advisories (bun audit).
# Usage: scripts/security-scan.sh [all|secrets|staged|sast|audit]
set -euo pipefail
cd "$(dirname "$0")/.."

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: $1 is required. Install it with: $2" >&2
    exit 1
  fi
}

secrets() {
  need gitleaks "brew install gitleaks"
  # Git content only (every commit): ignored files such as .env and build
  # output are never read. Reviewed false positives live in .gitleaksignore.
  echo "==> gitleaks (git history)"
  gitleaks git . --config .gitleaks.toml --redact --no-banner
}

staged() {
  # Pre-commit: only what is about to be committed. Skipped when gitleaks is absent.
  if ! command -v gitleaks >/dev/null 2>&1; then
    echo "warning: gitleaks not installed; staged secret scan skipped (brew install gitleaks)" >&2
    return 0
  fi
  gitleaks git --pre-commit --staged --config .gitleaks.toml --redact --no-banner
}

sast() {
  local tool
  if command -v opengrep >/dev/null 2>&1; then
    tool=opengrep
  elif command -v semgrep >/dev/null 2>&1; then
    tool=semgrep
  else
    echo "error: opengrep or semgrep is required. Install one with: brew install semgrep" >&2
    exit 1
  fi
  echo "==> $tool (.opengrep.yml)"
  "$tool" scan --config .opengrep.yml --error --metrics=off --quiet \
    --exclude node_modules --exclude target --exclude dist --exclude .next \
    apps scripts
}

audit() {
  echo "==> bun audit"
  bun audit
  if command -v cargo-audit >/dev/null 2>&1; then
    echo "==> cargo audit"
    cargo audit --file apps/desktop/src-tauri/Cargo.lock
  else
    echo "warning: cargo-audit not installed; Rust advisories skipped (cargo install cargo-audit)" >&2
  fi
}

case "${1:-all}" in
  all) secrets; sast; audit ;;
  secrets) secrets ;;
  staged) staged ;;
  sast) sast ;;
  audit) audit ;;
  *) echo "usage: $0 [all|secrets|staged|sast|audit]" >&2; exit 2 ;;
esac
