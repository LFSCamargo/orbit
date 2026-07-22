#!/usr/bin/env bash
# Runs Rust tests after src-tauri file edits or when an agent turn completes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

input=$(cat)
file_path=""

if [[ -n "$input" ]]; then
  file_path=$(printf '%s' "$input" | node -e "
    let d = '';
    process.stdin.on('data', (c) => { d += c; });
    process.stdin.on('end', () => {
      try {
        const i = JSON.parse(d);
        process.stdout.write(i.file_path || i.path || '');
      } catch {
        process.stdout.write('');
      }
    });
  " 2>/dev/null || true)
fi

if [[ -n "$file_path" ]] && [[ ! "$file_path" =~ src-tauri/ ]]; then
  exit 0
fi

yarn run test:rust || exit 2
exit 0
