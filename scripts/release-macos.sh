#!/usr/bin/env bash
# Build Orbit macOS release artifacts (.app + .dmg) into release/<version>/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ARCH=""
SKIP_TESTS=false
SKIP_TYPECHECK=false

usage() {
  cat <<'EOF'
Usage: scripts/release-macos.sh [options]

Build macOS release binaries with Tauri and copy artifacts to release/<version>/.

Options:
  --arch <aarch64|x86_64|universal|native>  Rust target (default: native)
  --skip-tests                              Skip yarn test:rust
  --skip-typecheck                          Skip yarn typecheck
  -h, --help                                Show this help

Output (under release/<version>/):
  Orbit-<version>-<arch>.app.tar.gz
  Orbit-<version>-<arch>.dmg          (when Tauri produces a DMG)
  SHA256SUMS.txt

Examples:
  scripts/release-macos.sh
  scripts/release-macos.sh --arch universal
  scripts/release-macos.sh --arch aarch64 --skip-tests
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --arch)
      ARCH="${2:-}"
      shift 2
      ;;
    --skip-tests)
      SKIP_TESTS=true
      shift
      ;;
    --skip-typecheck)
      SKIP_TYPECHECK=true
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "error: macOS release builds must run on macOS (Darwin)." >&2
  exit 1
fi

if ! command -v yarn >/dev/null 2>&1; then
  echo "error: yarn is required." >&2
  exit 1
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "error: Rust/cargo is required. Install via https://rustup.rs" >&2
  exit 1
fi

resolve_native_arch() {
  local machine
  machine="$(uname -m)"
  case "$machine" in
    arm64) echo "aarch64-apple-darwin" ;;
    x86_64) echo "x86_64-apple-darwin" ;;
    *)
      echo "error: unsupported machine architecture: $machine" >&2
      exit 1
      ;;
  esac
}

arch_label() {
  case "$1" in
    aarch64-apple-darwin) echo "aarch64" ;;
    x86_64-apple-darwin) echo "x86_64" ;;
    universal-apple-darwin) echo "universal" ;;
    *) echo "$1" ;;
  esac
}

if [[ -z "$ARCH" || "$ARCH" == "native" ]]; then
  TARGET="$(resolve_native_arch)"
elif [[ "$ARCH" == "aarch64" ]]; then
  TARGET="aarch64-apple-darwin"
elif [[ "$ARCH" == "x86_64" ]]; then
  TARGET="x86_64-apple-darwin"
elif [[ "$ARCH" == "universal" ]]; then
  TARGET="universal-apple-darwin"
else
  echo "error: invalid --arch value: $ARCH" >&2
  exit 1
fi

LABEL="$(arch_label "$TARGET")"
VERSION="$(node -p "require('./package.json').version")"
PRODUCT_NAME="$(node -p "require('./src-tauri/tauri.conf.json').productName")"
OUT_DIR="$ROOT/release/$VERSION"
BUNDLE_DIR="$ROOT/src-tauri/target/$TARGET/release/bundle"

echo "==> Orbit macOS release"
echo "    version: $VERSION"
echo "    target:  $TARGET ($LABEL)"
echo "    output:  $OUT_DIR"
echo

if [[ "$SKIP_TYPECHECK" != true ]]; then
  echo "==> Typecheck"
  yarn run typecheck
  echo
fi

if [[ "$SKIP_TESTS" != true ]]; then
  echo "==> Rust tests"
  yarn run test:rust
  echo
fi

echo "==> Tauri build"
yarn run tauri build -- --target "$TARGET"
echo

mkdir -p "$OUT_DIR"

APP_SRC=""
while IFS= read -r candidate; do
  APP_SRC="$candidate"
done < <(find "$BUNDLE_DIR/macos" -maxdepth 1 -name "*.app" -type d 2>/dev/null | head -n 1)

if [[ -z "$APP_SRC" || ! -d "$APP_SRC" ]]; then
  echo "error: no .app bundle found under $BUNDLE_DIR/macos" >&2
  exit 1
fi

APP_BASENAME="$(basename "$APP_SRC" .app)"
APP_ARCHIVE="$OUT_DIR/${APP_BASENAME}-${VERSION}-${LABEL}.app.tar.gz"

echo "==> Archive .app"
tar -czf "$APP_ARCHIVE" -C "$(dirname "$APP_SRC")" "$(basename "$APP_SRC")"
echo "    $APP_ARCHIVE"

DMG_COUNT=0
if [[ -d "$BUNDLE_DIR/dmg" ]]; then
  while IFS= read -r dmg; do
    [[ -z "$dmg" ]] && continue
    DMG_DEST="$OUT_DIR/${APP_BASENAME}-${VERSION}-${LABEL}.dmg"
    cp "$dmg" "$DMG_DEST"
    echo "    $DMG_DEST"
    DMG_COUNT=$((DMG_COUNT + 1))
  done < <(find "$BUNDLE_DIR/dmg" -maxdepth 1 -name "*.dmg" -type f 2>/dev/null)
fi

if [[ "$DMG_COUNT" -eq 0 ]]; then
  echo "    (no .dmg produced — .app archive is the primary artifact)"
fi

echo
echo "==> Checksums"
CHECKSUMS="$OUT_DIR/SHA256SUMS.txt"
: > "$CHECKSUMS"
while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  (
    cd "$OUT_DIR"
    shasum -a 256 "$(basename "$file")"
  ) >> "$CHECKSUMS"
done < <(find "$OUT_DIR" -maxdepth 1 \( -name "*.tar.gz" -o -name "*.dmg" \) -type f | sort)
cat "$CHECKSUMS"

echo
echo "==> Done"
echo "Release artifacts:"
find "$OUT_DIR" -maxdepth 1 -type f | sort | while IFS= read -r f; do
  echo "  $f"
done
