#!/usr/bin/env bash
# Build the x86_64 SDL2 Orbit Wine's winebus uses to pass controllers to games,
# with Orbit's pad bridge (scripts/wine/patches/sdl2): a pad Orbit reads
# natively (XInput-only USB pads and 2.4 GHz dongles such as the 8BitDo
# Ultimate 2C, which have no HID interface on macOS) reaches winebus as an SDL
# virtual Xbox 360 gamepad through the file named by ORBIT_PAD_BRIDGE
# (runtimes/controllers.rs, platform/macos/pad_bridge.rs). Wine gets no USB
# access: no libusb.
#
#   build-sdl2.sh                  build into $WORK/out
#   build-sdl2.sh --into DIR       also copy libSDL2-2.0.0.dylib into DIR
#   build-sdl2.sh --install        also put it in every installed Orbit Wine,
#                                  keeping the first replaced copy as *.gcenx
#
# Needs Xcode CLT. Runs on Apple Silicon (x86_64 is cross-compiled; Rosetta
# runs configure's test programs).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SOURCES="$ROOT/scripts/wine/sources.json"
read_source() { node -p "require('$SOURCES').$1"; }
SDL_VERSION="$(read_source sdl2.version)"
SDL_URL="$(read_source sdl2.url)"
SDL_SHA256="$(read_source sdl2.sha256)"
WORK="${ORBIT_SDL_WORK:-$HOME/work/orbit-sdl2-build}"
ORBIT="$HOME/Library/Application Support/Orbit"
CC_X86="clang -arch x86_64 -mmacosx-version-min=11.0"
LIB="libSDL2-2.0.0.dylib"

into=""
install=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --into) into="$2"; shift 2 ;;
    --install) install=1; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

fetch() { # url sha256 dest
  if [[ ! -f "$3" ]]; then
    curl -fL --proto '=https' -o "$3.part" "$1"
    mv "$3.part" "$3"
  fi
  echo "$2  $3" | shasum -a 256 -c -
}

mkdir -p "$WORK/src" "$WORK/out"
fetch "$SDL_URL" "$SDL_SHA256" "$WORK/SDL2-$SDL_VERSION.tar.gz"

rm -rf "$WORK/src/SDL2-$SDL_VERSION" "$WORK/install"
tar -xzf "$WORK/SDL2-$SDL_VERSION.tar.gz" -C "$WORK/src"
for patch_file in "$ROOT"/scripts/wine/patches/sdl2/*.patch; do
  patch -d "$WORK/src/SDL2-$SDL_VERSION" -p1 -s <"$patch_file"
done
mkdir -p "$WORK/src/SDL2-$SDL_VERSION/build"
(
  cd "$WORK/src/SDL2-$SDL_VERSION/build"
  ../configure --host=x86_64-apple-darwin CC="$CC_X86" --prefix="$WORK/install" \
    --enable-hidapi --enable-hidapi-joystick --disable-hidapi-libusb \
    --enable-joystick-virtual \
    --disable-video-x11 --disable-video-wayland --disable-static >"$WORK/sdl-configure.log"
  config="include/SDL_config.h"
  config_text="$(cat "$config")"
  if [[ "$config_text" != *"#define SDL_JOYSTICK_VIRTUAL 1"* ]]; then
    echo "SDL configure disabled virtual joysticks; see $WORK/sdl-configure.log" >&2
    exit 1
  fi
  if [[ "$config_text" == *"#define HAVE_LIBUSB 1"* ]]; then
    echo "SDL configure picked up libusb; Wine must not claim USB pads" >&2
    exit 1
  fi
  make -j"$(sysctl -n hw.ncpu)" >"$WORK/sdl-make.log"
  make install >/dev/null
)

OUT="$WORK/out/$LIB"
cp -p "$WORK/install/lib/$LIB" "$OUT"
# Same bare install name as the Gcenx copy; Wine finds it through its rpath.
install_name_tool -id libSDL2.dylib "$OUT"
codesign --force -s - "$OUT"
# Whole outputs are captured first: grep -q closing a pipe early fails it
# under pipefail.
arch_info="$(lipo -info "$OUT")"
symbols="$(nm "$OUT")"
links="$(otool -L "$OUT")"
[[ "$arch_info" == *x86_64* ]] || { echo "$OUT is not x86_64" >&2; exit 1; }
[[ "$symbols" == *_SDL_GameControllerOpen* ]] || { echo "$OUT has no SDL_GameControllerOpen" >&2; exit 1; }
[[ "$symbols" == *_SDL_OrbitBridgeUpdate* ]] || { echo "$OUT has no Orbit pad bridge" >&2; exit 1; }
if [[ "$links" == *libusb* || "$symbols" == *_libusb_init* ]]; then
  echo "$OUT uses libusb" >&2
  exit 1
fi
echo "Built $OUT (SDL $SDL_VERSION with the Orbit pad bridge)"

place() { # dir
  if [[ -f "$1/$LIB" && ! -f "$1/$LIB.gcenx" ]]; then
    cp -p "$1/$LIB" "$1/$LIB.gcenx"
  fi
  cp -p "$OUT" "$1/$LIB"
  ln -sf "$LIB" "$1/libSDL2.dylib"
}

if [[ -n "$into" ]]; then
  place "$into"
fi
if [[ $install -eq 1 ]]; then
  shopt -s nullglob
  for app in "$ORBIT/runtimes/components/orbit-wine/"*/"Orbit Wine.app"; do
    place "$app/Contents/lib"
    # The main executable's signature seals the bundle; sign it again.
    codesign --force --sign - "$app"
    codesign --verify --strict "$app"
    echo "Installed into $app"
  done
fi
