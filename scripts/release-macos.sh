#!/usr/bin/env bash
# Build Orbit macOS release artifacts (.dmg + signed updater archive + latest.json)
# into release/<version>/, and optionally publish them as the latest GitHub release.
# Updates are signed with the Tauri updater key in ~/.tauri/orbit.key; installed
# Orbits verify them with the public key in tauri.conf.json.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ARCH=""
SKIP_TESTS=false
SKIP_TYPECHECK=false
INSTALL=false
PUBLISH=false
INIT_KEY=false
KEY_PATH="${ORBIT_UPDATER_KEY:-$HOME/.tauri/orbit.key}"
CONFIG="$ROOT/apps/desktop/src-tauri/tauri.conf.json"

usage() {
  cat <<'EOF'
Usage: scripts/release-macos.sh [options]

Build macOS release binaries with Tauri, sign the in-app update, and copy
artifacts to release/<version>/.

Options:
  --init-key                                Create the updater signing key once (~/.tauri/orbit.key)
                                            and put its public key in tauri.conf.json, then exit
  --publish                                 Create the GitHub release v<version> (tag must be pushed),
                                            upload the artifacts and mark it latest
  --arch <aarch64|x86_64|universal|native>  Rust target (default: native)
  --skip-tests                              Skip bun run test:rust
  --skip-typecheck                          Skip bun run typecheck
  --install                                 Mount the produced DMG and copy Orbit.app to /Applications
  -h, --help                                Show this help

Output (under release/<version>/):
  Orbit-<version>-<arch>.dmg          first install (download from the site)
  Orbit-<version>-<arch>.app.tar.gz   in-app update, signed
  Orbit-<version>-<arch>.app.tar.gz.sig
  latest.json                         what installed Orbits check
  SHA256SUMS.txt

--init-key makes a key without a password. A key that has one reads it from
TAURI_SIGNING_PRIVATE_KEY_PASSWORD, or asks.
ORBIT_UPDATER_KEY overrides the key path; TAURI_SIGNING_PRIVATE_KEY (the key
itself, as CI passes it) overrides the file. The signed archive is verified
against tauri.conf.json's pubkey before anything is written or published.

Examples:
  scripts/release-macos.sh
  scripts/release-macos.sh --arch universal
  scripts/release-macos.sh --arch aarch64 --skip-tests
  scripts/release-macos.sh --install
  scripts/release-macos.sh --init-key
  scripts/release-macos.sh --publish
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
    --install)
      INSTALL=true
      shift
      ;;
    --publish)
      PUBLISH=true
      shift
      ;;
    --init-key)
      INIT_KEY=true
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

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun is required." >&2
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

install_to_applications() {
  local dmg="$1"
  if [[ ! -f "$dmg" ]]; then
    echo "error: cannot install — DMG not found: $dmg" >&2
    return 1
  fi

  local mountpoint
  mountpoint="$(mktemp -d)"

  cleanup_mount() {
    if hdiutil info 2>/dev/null | grep -q "$mountpoint"; then
      hdiutil detach "$mountpoint" -quiet || true
    fi
    rm -rf "$mountpoint"
  }
  trap cleanup_mount EXIT

  echo "==> Mounting DMG"
  hdiutil attach "$dmg" -mountpoint "$mountpoint" -nobrowse -quiet
  echo "    mounted at $mountpoint"

  echo "==> Installing Orbit to /Applications"
  if [[ -d "/Applications/Orbit.app" ]]; then
    echo "    removing existing /Applications/Orbit.app"
    rm -rf "/Applications/Orbit.app"
  fi
  ditto "$mountpoint/Orbit.app" "/Applications/Orbit.app"
  echo "    installed /Applications/Orbit.app"

  echo "==> Unmounting DMG"
  hdiutil detach "$mountpoint" -quiet
  trap - EXIT
  rm -rf "$mountpoint"
}

config_pubkey() {
  node -p "(require(process.argv[1]).plugins?.updater?.pubkey ?? '').trim()" "$CONFIG"
}

init_key() {
  if [[ -e "$KEY_PATH" ]]; then
    echo "error: $KEY_PATH already exists. Orbit's installs trust it; it is never replaced." >&2
    exit 1
  fi
  mkdir -p "$(dirname "$KEY_PATH")"
  chmod 700 "$(dirname "$KEY_PATH")"
  echo "==> Creating the updater signing key (no password: the file is the only protection)"
  bun run --cwd apps/desktop tauri signer generate -w "$KEY_PATH" --ci
  chmod 600 "$KEY_PATH"
  node -e '
    const fs = require("fs")
    const [config, pub] = process.argv.slice(1)
    const json = JSON.parse(fs.readFileSync(config, "utf8"))
    json.plugins = json.plugins ?? {}
    json.plugins.updater = { ...(json.plugins.updater ?? {}), pubkey: fs.readFileSync(pub, "utf8").trim() }
    fs.writeFileSync(config, JSON.stringify(json, null, 2) + "\n")
  ' "$CONFIG" "$KEY_PATH.pub"
  bunx prettier --write "$CONFIG" >/dev/null 2>&1 || true
  echo
  echo "Public key written to apps/desktop/src-tauri/tauri.conf.json (commit it)."
  echo "Back up $KEY_PATH somewhere safe (a password manager or an encrypted drive)."
  echo "Without it, installed Orbits can never be updated again; anyone who has it"
  echo "can sign an update they will accept."
}

check_updater_key() {
  if [[ -z "$(config_pubkey)" ]]; then
    echo "error: tauri.conf.json has no updater pubkey. Run: scripts/release-macos.sh --init-key" >&2
    exit 1
  fi
  # CI passes the key itself in TAURI_SIGNING_PRIVATE_KEY; a Mac reads the file.
  if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
    if [[ ! -f "$KEY_PATH" ]]; then
      echo "error: no updater key at $KEY_PATH. Run: scripts/release-macos.sh --init-key" >&2
      exit 1
    fi
    TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY_PATH")"
  fi
  export TAURI_SIGNING_PRIVATE_KEY
  if [[ -z "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD+set}" ]]; then
    # A key made without a password (--init-key) signs with an empty one; only
    # a key that has a password is asked for it.
    local probe
    probe="$(mktemp -d)"
    echo orbit > "$probe/probe"
    if TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" bun run --cwd "$DESKTOP_DIR" tauri signer sign \
      -k "$TAURI_SIGNING_PRIVATE_KEY" "$probe/probe" >/dev/null 2>&1; then
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
    elif [[ -t 0 ]]; then
      read -r -s -p "Updater key password: " TAURI_SIGNING_PRIVATE_KEY_PASSWORD
      echo
    else
      rm -rf "$probe"
      echo "error: the updater key has a password; set TAURI_SIGNING_PRIVATE_KEY_PASSWORD." >&2
      exit 1
    fi
    rm -rf "$probe"
  fi
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD
}

if [[ "$INIT_KEY" == true ]]; then
  init_key
  exit 0
fi

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
DESKTOP_DIR="$ROOT/apps/desktop"
VERSION="$(node -p "require('./apps/desktop/package.json').version")"
OUT_DIR="$ROOT/release/$VERSION"
BUNDLE_DIR="$DESKTOP_DIR/src-tauri/target/$TARGET/release/bundle"
NOTES_FILE="$ROOT/.github/release-notes/$VERSION.md"
TAG="v$VERSION"

check_updater_key

if [[ "$PUBLISH" == true ]]; then
  command -v gh >/dev/null 2>&1 || { echo "error: --publish needs the GitHub CLI (gh)." >&2; exit 1; }
  # Before the build: CI's GH_TOKEN (or a Mac's gh login) must be able to publish.
  gh auth status >/dev/null 2>&1 || {
    echo "error: --publish needs GitHub access: set GH_TOKEN or run gh auth login." >&2
    exit 1
  }
  [[ -f "$NOTES_FILE" ]] || { echo "error: --publish needs $NOTES_FILE" >&2; exit 1; }
  if ! git ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null; then
    echo "error: tag $TAG is not on origin. Push it first: git push origin $TAG" >&2
    exit 1
  fi
  if gh release view "$TAG" >/dev/null 2>&1; then
    echo "error: release $TAG already exists." >&2
    exit 1
  fi
fi

echo "==> Orbit macOS release"
echo "    version: $VERSION"
echo "    target:  $TARGET ($LABEL)"
echo "    output:  $OUT_DIR"
echo

if [[ "$SKIP_TYPECHECK" != true ]]; then
  echo "==> Typecheck"
  bun run typecheck
  echo
fi

if [[ "$SKIP_TESTS" != true ]]; then
  echo "==> Rust tests"
  bun run test:rust
  echo
fi

echo "==> Tauri build (signed updater archive)"
# CI=true makes Tauri skip the Finder layout script. On macOS 27 that script
# fails with AppleEvent -1743 (not allowed to control Finder) and aborts the DMG.
# Updater artifacts are only made here, so a plain `tauri build` needs no key.
CI=true bun run --cwd apps/desktop tauri build --target "$TARGET" \
  --config '{"bundle":{"createUpdaterArtifacts":true}}'
echo

mkdir -p "$OUT_DIR"
# Only this build's files: an older build's archive must never be published.
rm -f "$OUT_DIR"/*.dmg "$OUT_DIR"/*.app.tar.gz "$OUT_DIR"/*.app.tar.gz.sig \
  "$OUT_DIR/latest.json" "$OUT_DIR/SHA256SUMS.txt"

APP_SRC=""
while IFS= read -r candidate; do
  APP_SRC="$candidate"
done < <(find "$BUNDLE_DIR/macos" -maxdepth 1 -name "*.app" -type d 2>/dev/null | head -n 1)

if [[ -z "$APP_SRC" || ! -d "$APP_SRC" ]]; then
  echo "error: no .app bundle found under $BUNDLE_DIR/macos" >&2
  exit 1
fi

APP_BASENAME="$(basename "$APP_SRC" .app)"

echo "==> Linked libraries"
node "$ROOT/scripts/check-linkage.mjs" "$APP_SRC/Contents/MacOS/$APP_BASENAME"

APP_ARCHIVE="$OUT_DIR/${APP_BASENAME}-${VERSION}-${LABEL}.app.tar.gz"
UPDATER_ARCHIVE="$BUNDLE_DIR/macos/$APP_BASENAME.app.tar.gz"

echo "==> Updater archive"
if [[ ! -f "$UPDATER_ARCHIVE" || ! -f "$UPDATER_ARCHIVE.sig" ]]; then
  echo "error: Tauri made no signed $UPDATER_ARCHIVE(.sig)" >&2
  exit 1
fi
# The signature covers the bytes, not the name, so the archive keeps the
# release's naming (the landing site lists it as the .app download).
cp "$UPDATER_ARCHIVE" "$APP_ARCHIVE"
cp "$UPDATER_ARCHIVE.sig" "$APP_ARCHIVE.sig"
echo "    $APP_ARCHIVE"
echo "    $APP_ARCHIVE.sig"

echo "==> latest.json"
NOTES_ARGS=()
if [[ -f "$NOTES_FILE" ]]; then
  NOTES_ARGS=(--notes-file "$NOTES_FILE")
else
  echo "    warning: no $NOTES_FILE; the update dialog will show no notes"
fi
# Verified against tauri.conf.json first: a release signed with another key
# would be rejected by every installed Orbit.
node "$ROOT/scripts/updater-manifest.mjs" --version "$VERSION" --arch "$LABEL" \
  --archive "$APP_ARCHIVE" --config "$CONFIG" --out "$OUT_DIR/latest.json" "${NOTES_ARGS[@]+"${NOTES_ARGS[@]}"}"

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

if [[ "$INSTALL" == true ]]; then
  if [[ "$DMG_COUNT" -eq 0 ]]; then
    echo "error: --install requires a DMG artifact" >&2
    exit 1
  fi
  echo
  install_to_applications "$DMG_DEST"
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
done < <(find "$OUT_DIR" -maxdepth 1 \( -name "*.tar.gz" -o -name "*.dmg" -o -name "*.sig" -o -name "latest.json" \) -type f | sort)
cat "$CHECKSUMS"

if [[ "$PUBLISH" == true ]]; then
  echo
  echo "==> Publishing $TAG"
  # A draft first: installed Orbits read releases/latest, which must never
  # point at a release whose files are still uploading.
  gh release create "$TAG" --verify-tag --draft --title "Orbit $VERSION" \
    --notes-file "$NOTES_FILE" "$OUT_DIR"/*
  gh release edit "$TAG" --draft=false --latest
  LIVE="$(curl -fsSL "https://github.com/LFSCamargo/orbit/releases/latest/download/latest.json" |
    node -p "JSON.parse(require('fs').readFileSync(0, 'utf8')).version" || true)"
  if [[ "$LIVE" == "$VERSION" ]]; then
    echo "    installed Orbits now see $VERSION"
  else
    echo "    warning: releases/latest/download/latest.json reports '${LIVE:-nothing}', not $VERSION" >&2
  fi
fi

echo
echo "==> Done"
echo "Release artifacts:"
find "$OUT_DIR" -maxdepth 1 -type f | sort | while IFS= read -r f; do
  echo "  $f"
done
