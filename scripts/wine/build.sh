#!/usr/bin/env bash
# Build Orbit Wine (CrossOver sources: MSync + D3DMetal hooks) for x86_64 macOS
# and install it as an Orbit compatibility component. Runs on Apple Silicon
# through Rosetta. Needs: Xcode CLT, Homebrew mingw-w64, bison, freetype,
# gnutls (headers only), and an existing Gcenx Wine for its x86_64 libraries.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SOURCES="$ROOT/scripts/wine/sources.json"
VERSION="$(node -p "require('$SOURCES').crossover.version")"
SHA256="$(node -p "require('$SOURCES').crossover.sha256")"
URL="$(node -p "require('$SOURCES').crossover.url")"
MONO_VERSION="$(node -p "require('$SOURCES').mono.version")"
MONO_URL="$(node -p "require('$SOURCES').mono.url")"
MONO_SHA256="$(node -p "require('$SOURCES').mono.sha256")"
GECKO_VERSION="$(node -p "require('$SOURCES').gecko.version")"
WORK="${ORBIT_WINE_WORK:-$HOME/work/orbit-wine-build}"
ORBIT="$HOME/Library/Application Support/Orbit"
DEST="${ORBIT_WINE_DEST:-$ORBIT/runtimes/components/orbit-wine/$VERSION}"
DEPS_FROM="${ORBIT_WINE_DEPS:-$ORBIT/steam-windows/wine-11.21/Wine Devel.app/Contents/Resources/wine/lib}"
BREW="$(brew --prefix)"

if [[ ! -d "$DEPS_FROM" ]]; then
  echo "x86_64 libraries not found at $DEPS_FROM (sign in to Steam in Orbit once, or set ORBIT_WINE_DEPS)" >&2
  exit 2
fi

mkdir -p "$WORK/src" "$WORK/deps/include" "$WORK/deps/lib" "$WORK/build"
TARBALL="$WORK/crossover-sources-$VERSION.tar.gz"
if [[ ! -f "$TARBALL" ]]; then
  curl -fL --proto '=https' -o "$TARBALL.part" "$URL"
  mv "$TARBALL.part" "$TARBALL"
fi
echo "$SHA256  $TARBALL" | shasum -a 256 -c -
MONO_TARBALL="$WORK/wine-mono-$MONO_VERSION-x86.tar.xz"
if [[ ! -f "$MONO_TARBALL" ]]; then
  curl -fL --proto '=https' -o "$MONO_TARBALL.part" "$MONO_URL"
  mv "$MONO_TARBALL.part" "$MONO_TARBALL"
fi
echo "$MONO_SHA256  $MONO_TARBALL" | shasum -a 256 -c -
if [[ ! -d "$WORK/src/sources/wine" ]]; then
  tar -xzf "$TARBALL" -C "$WORK/src" sources/wine
fi
# Orbit patches on top of CrossOver (see patches/). Already-applied ones are skipped.
for patch_file in "$ROOT"/scripts/wine/patches/*.patch; do
  if patch -d "$WORK/src/sources/wine" -p1 -R -s -f --dry-run < "$patch_file" >/dev/null 2>&1; then
    continue
  fi
  patch -d "$WORK/src/sources/wine" -p1 -s < "$patch_file"
done

# The bundled libraries have bare install names, so configure cannot derive
# the names Wine dlopens; they are pinned to the Gcenx bundle's below.
# Only these headers and x86_64 libraries are visible to configure, so arm64
# Homebrew libraries are never linked by accident.
cp -a "$DEPS_FROM"/*.dylib "$WORK/deps/lib/"
ln -sfn "$BREW/include/freetype2" "$WORK/deps/include/freetype2"
ln -sfn "$BREW/include/gnutls" "$WORK/deps/include/gnutls"

TOOLS_PATH="$BREW/opt/bison/bin:$BREW/bin:/usr/bin:/bin:/usr/sbin:/sbin"
build_env=(/usr/bin/env -i HOME="$HOME" PATH="$TOOLS_PATH" MACOSX_DEPLOYMENT_TARGET=11.0)

cd "$WORK/build"
# Build tools such as sfnt2fon load freetype by its bare install name, and SIP
# strips DYLD_* from make, so dyld only finds it in the working directory.
ln -sfn "$WORK/deps/lib/libfreetype.dylib" libfreetype.dylib
if [[ ! -f Makefile ]] || grep -q '^FREETYPE_LIBS = -L/opt/homebrew' Makefile; then
  arch -x86_64 "${build_env[@]}" \
    CC="clang -arch x86_64" CXX="clang++ -arch x86_64" \
    CPPFLAGS="-I$WORK/deps/include -I$WORK/deps/include/freetype2" \
    LDFLAGS="-L$WORK/deps/lib" PKG_CONFIG=false \
    FREETYPE_CFLAGS="-I$WORK/deps/include/freetype2" FREETYPE_LIBS="-L$WORK/deps/lib -lfreetype" \
    GNUTLS_CFLAGS="-I$WORK/deps/include" GNUTLS_LIBS="-L$WORK/deps/lib -lgnutls" \
    ac_cv_lib_soname_freetype=libfreetype.6.dylib ac_cv_lib_soname_gnutls=libgnutls.30.dylib \
    ac_cv_lib_soname_vulkan=libvulkan.1.dylib \
    ../src/sources/wine/configure --prefix="$WORK/install" \
    --enable-archs=i386,x86_64 --disable-tests --without-x \
    --without-alsa --without-capi --without-dbus --without-fontconfig \
    --without-gphoto --without-gssapi --without-krb5 --without-netapi \
    --without-oss --without-pulse --without-sane --without-udev --without-usb \
    --without-v4l2 --without-pcap --without-inotify --without-sdl \
    --without-gstreamer --with-gnutls --with-freetype --with-mingw \
    --with-vulkan --with-opencl --with-coreaudio
fi
arch -x86_64 "${build_env[@]}" make -j"$(sysctl -n hw.ncpu)"
rm -rf "$WORK/install"
arch -x86_64 "${build_env[@]}" make install

# Self-contained component: an app bundle that declares the games category, so
# macOS Game Mode boosts the game's Wine processes (patch 0002 starts every
# Wine process from Contents/MacOS/wine). Wine resolves lib/ and share/ as
# ../lib and ../share from its loader, so MacOS works like bin/.
APP="$DEST.part/Orbit Wine.app"
CONTENTS="$APP/Contents"
UNIX_DIR="$CONTENTS/lib/wine/x86_64-unix"
rm -rf "$DEST.part"
mkdir -p "$CONTENTS/MacOS"
cp -a "$WORK/install/lib" "$WORK/install/share" "$CONTENTS/"
cp -a "$WORK/deps/lib/." "$CONTENTS/lib/"
cp -p "$UNIX_DIR/wine" "$CONTENTS/MacOS/wine"
cp -p "$WORK/install/bin/wineserver" "$CONTENTS/MacOS/wineserver"
ln -s ../lib/wine/x86_64-unix/ntdll.so "$CONTENTS/MacOS/ntdll.so"
ln -s MacOS "$CONTENTS/bin"
sed "s/@VERSION@/$VERSION/" "$ROOT/scripts/wine/Info.plist" > "$CONTENTS/Info.plist"
# Wine Mono and Gecko in share/wine, so a new or updated prefix never waits
# on an install prompt nobody can see.
mkdir -p "$CONTENTS/share/wine/mono" "$CONTENTS/share/wine/gecko"
tar -xJf "$MONO_TARBALL" -C "$CONTENTS/share/wine/mono"
cp -a "$DEPS_FROM/../share/wine/gecko/wine-gecko-$GECKO_VERSION-x86" \
  "$DEPS_FROM/../share/wine/gecko/wine-gecko-$GECKO_VERSION-x86_64" "$CONTENTS/share/wine/gecko/"
# The bundled libraries have bare install names; Wine's Unix modules find them
# in `lib/` through this rpath, as in the Gcenx bundle.
for module in "$UNIX_DIR"/*.so "$UNIX_DIR/wine" "$CONTENTS/MacOS/wine" "$CONTENTS/MacOS/wineserver"; do
  if ! otool -l "$module" | grep -q "path @loader_path/../../ "; then
    install_name_tool -add_rpath @loader_path/../../ "$module" 2>/dev/null || true
  fi
  # The bundle's main executable is signed with the bundle below.
  if [[ "$module" != "$CONTENTS/MacOS/wine" ]]; then
    codesign --force -s - "$module" 2>/dev/null
  fi
done
# The main executable's signature must bind this Info.plist.
codesign --force --sign - "$APP"
codesign --verify --strict "$APP"
rm -rf "$DEST"
mv "$DEST.part" "$DEST"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
  -f "$DEST/Orbit Wine.app"
echo "Installed Orbit Wine $VERSION at $DEST/Orbit Wine.app"
