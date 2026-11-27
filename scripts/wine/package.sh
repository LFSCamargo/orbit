#!/usr/bin/env bash
# Packages a built Orbit Wine (scripts/wine/build.sh) for a GitHub release that
# Orbit's onboarding installs from (runtimes/orbit_wine.rs):
#   orbit-wine-<version>.tar.zst         <version>/Orbit Wine.app
#   orbit-wine-sources-<version>.tar.gz  Orbit's patches and pinned sources (LGPL)
#   orbit-wine.json                      version, url, size, sha256, sourcesUrl
# Usage: scripts/wine/package.sh <built version dir> <output dir>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BUILT="${1:?built Orbit Wine version directory}"
OUT="${2:?output directory}"
REPOSITORY="LFSCamargo/orbit"
VERSION="$(basename "$BUILT")"
TAG="orbit-wine-v$VERSION"
ARCHIVE="orbit-wine-$VERSION.tar.zst"
SOURCES="orbit-wine-sources-$VERSION.tar.gz"

if [[ ! -x "$BUILT/Orbit Wine.app/Contents/MacOS/wine" ]]; then
  echo "No Orbit Wine.app loader in $BUILT" >&2
  exit 2
fi
codesign --verify --strict "$BUILT/Orbit Wine.app"

mkdir -p "$OUT"
# Owner and group are dropped so the archive unpacks as the installing user.
# No macOS metadata: bsdtar would add `._*` AppleDouble entries beside every
# file, and code signatures live inside the binaries and _CodeSignature anyway.
COPYFILE_DISABLE=1 tar -C "$(dirname "$BUILT")" --uid 0 --gid 0 \
  --no-mac-metadata --no-xattrs --no-acls -cf - "$VERSION" |
  zstd -19 -T0 -q -o "$OUT/$ARCHIVE" --force
COPYFILE_DISABLE=1 tar -C "$ROOT/scripts/wine" --no-mac-metadata -czf "$OUT/$SOURCES" sources.json patches README.md build.sh build-sdl2.sh Info.plist

SIZE="$(stat -f %z "$OUT/$ARCHIVE")"
SHA256="$(shasum -a 256 "$OUT/$ARCHIVE" | cut -d' ' -f1)"
cat > "$OUT/orbit-wine.json" <<JSON
{
  "version": "$VERSION",
  "url": "https://github.com/$REPOSITORY/releases/download/$TAG/$ARCHIVE",
  "size": $SIZE,
  "sha256": "$SHA256",
  "sourcesUrl": "https://github.com/$REPOSITORY/releases/tag/$TAG"
}
JSON
echo "Packaged Orbit Wine $VERSION ($((SIZE / 1000000)) MB) in $OUT for tag $TAG"
