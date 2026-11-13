#!/usr/bin/env bash
# Fetch a pinned Apple GPTK package mirror and verify its exact size and SHA-256.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGE_ID="${1:-}"
OUTPUT_DIR="${2:-$ROOT/release/gptk}"
MANIFEST="$ROOT/runtime-packages/gptk/manifest.json"
BASE_URL="${ORBIT_GPTK_BASE_URL:-$(node -p "JSON.parse(require('fs').readFileSync('$MANIFEST','utf8')).baseUrl")}"

if [[ -z "$PACKAGE_ID" ]]; then
  echo "Usage: scripts/fetch-gptk.sh <package-id> [output-directory]" >&2
  echo "Available package IDs:" >&2
  node -e "for (const p of JSON.parse(require('fs').readFileSync('$MANIFEST','utf8')).packages) console.log('  '+p.id+'  ('+p.kind+')')" >&2
  exit 2
fi

METADATA="$(node -e "const p=JSON.parse(require('fs').readFileSync('$MANIFEST','utf8')).packages.find(p=>p.id===process.argv[1]); if(!p) process.exit(2); console.log(p.file+' '+p.sha256+' '+p.size)" "$PACKAGE_ID")" || {
  echo "Unknown package ID: $PACKAGE_ID" >&2
  exit 2
}
read -r FILE EXPECTED_SHA EXPECTED_SIZE <<<"$METADATA"

mkdir -p "$OUTPUT_DIR"
DESTINATION="$OUTPUT_DIR/$FILE"
PARTIAL="$DESTINATION.part"
echo "Fetching $PACKAGE_ID"
curl --fail --location --retry 3 --connect-timeout 15 --output "$PARTIAL" "$BASE_URL/$FILE"

ACTUAL_SIZE="$(stat -f '%z' "$PARTIAL")"
if [[ "$ACTUAL_SIZE" != "$EXPECTED_SIZE" ]]; then
  rm -f "$PARTIAL"
  echo "Size mismatch: expected $EXPECTED_SIZE, got $ACTUAL_SIZE" >&2
  exit 1
fi
ACTUAL_SHA="$(shasum -a 256 "$PARTIAL" | awk '{print $1}')"
if [[ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]]; then
  rm -f "$PARTIAL"
  echo "SHA-256 mismatch: expected $EXPECTED_SHA, got $ACTUAL_SHA" >&2
  exit 1
fi
mv "$PARTIAL" "$DESTINATION"
echo "Verified: $DESTINATION"
