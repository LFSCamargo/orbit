#!/usr/bin/env bash
# Copy .cursor/skills to every other agent directory, or fail if a copy drifted.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/.cursor/skills"
CHECK=0

if [[ "${1-}" == "--check" ]]; then
  CHECK=1
fi

if [[ ! -d "$SRC" ]]; then
  echo "sync-agent-skills: missing $SRC" >&2
  exit 1
fi

for dest in .claude .opencode; do
  target="$ROOT/$dest/skills"
  if [[ "$CHECK" -eq 1 ]]; then
    if [[ ! -d "$target" ]]; then
      echo "sync-agent-skills: missing $target" >&2
      exit 1
    fi
    diff -rq "$SRC" "$target"
  else
    mkdir -p "$target"
    rsync -a --delete "$SRC/" "$target/"
  fi
done

if [[ "$CHECK" -eq 1 ]]; then
  echo "Agent skills match."
else
  echo "Agent skills copied."
fi
