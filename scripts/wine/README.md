# Orbit Wine (CrossOver sources)

Orbit containers need a Wine build with MSync, macdrv Metal views, and D3DMetal
hooks. Gcenx `wine-devel` 11.21 (the Steam sign-in Wine) has none of them, so
GPTK titles run with server-side sync and without D3DMetal's loader support.

CodeWeavers' CrossOver 26.3.0 sources (Wine 11.0) already include all three:
`server/msync.c` and `dlls/ntdll/unix/msync.c` (`WINEMSYNC=1`),
`dlls/winemac.drv/d3dmetal.c`, and the ntdll loader that maps GPTK's
`libd3dshared.dylib` from `CX_APPLEGPTK_LIBD3DSHARED_PATH`.

One Orbit patch (`patches/0001-ntdll-WINEDLLPATH_PREPEND.patch`): Wine searches
its own builtins before `WINEDLLPATH`, so GPTK's `dxgi`/`d3d12` lost to Wine's and
games silently ran on wined3d. CrossOver fixes this from closed code through
`prepend_dll_path`; the patch reads `WINEDLLPATH_PREPEND` instead, and Orbit
points it at the selected translation layer. Wine Mono 10.4.1 (pinned) and Gecko
2.47.4 are bundled so prefix setup never waits on an install prompt.

`sources.json` pins the tarball URL and SHA-256. Build and install locally:

```bash
scripts/wine/build.sh
```

It verifies the tarball, configures an x86_64 WoW64 build under Rosetta
against a private copy of the Gcenx bundle's x86_64 libraries (so arm64
Homebrew libraries are never linked), and installs a self-contained component
at `runtimes/components/orbit-wine/<version>/`. Needs Xcode CLT and Homebrew
`mingw-w64`, `bison`, `freetype`, and `gnutls` (headers). EGL, Wayland, FFmpeg,
and GStreamer are not built.

SDL is built in: winebus' SDL backend is what maps Bluetooth and USB
controllers to XInput on macOS. Without it winebus ignores generic HID gamepads
and games see no controller. The script pins SDL2 2.32.8 headers in
`sources.json` and links against the Gcenx bundle's x86_64 `libSDL2` (same
version), which ships in `Contents/lib`. It stops if configure does not enable
SDL, and reconfigures an older build tree that lacks it.

The component is `Orbit Wine.app` (`com.orbit.wine`, games category,
`LSSupportsGameMode`): the loader is `Contents/MacOS/wine`, Wine's tree sits in
`Contents/lib` and `Contents/share` (Wine resolves them as `../lib` and
`../share`), and `Contents/bin` links to `MacOS`. Patch
`0002-ntdll-bundle-loader.patch` starts every Wine process, the game included,
from `Contents/MacOS/wine`, so macOS attributes the game to the bundle and Game
Mode applies to it. The bundle is ad-hoc signed and registered with
LaunchServices.

Play prefers the newest installed Orbit Wine that passes the probe in
`runtimes/wine_capabilities.rs` (MSync plus the D3DMetal hook in `ntdll.so`).

The compiled distribution is not committed. It ships as a GitHub release of the
Orbit repository (`orbit-wine-v<version>`), built and published from a Mac
(there is no CI). `package.sh <built version dir> <out dir>` makes the archive,
the sources tarball (LGPL) and `orbit-wine.json` that onboarding reads. Publish
it as a draft first, so Orbit never reads a manifest whose archive is still
uploading, and never mark it latest:

```bash
VERSION="$(node -p "require('./scripts/wine/sources.json').crossover.version")"
scripts/wine/build.sh
scripts/wine/package.sh "$HOME/Library/Application Support/Orbit/runtimes/components/orbit-wine/$VERSION" release/orbit-wine
gh release create "orbit-wine-v$VERSION" --draft --latest=false \
  --title "Orbit Wine $VERSION" \
  --notes "Orbit Wine $VERSION, built from CodeWeavers' CrossOver sources with Orbit's patches (scripts/wine). LGPL-2.1-or-later: the matching sources are attached." \
  release/orbit-wine/*
gh release edit "orbit-wine-v$VERSION" --draft=false --latest=false
```

See docs/CONTAINERS.md#distribution. GPTK DMGs stay user-imported; they are not
redistributed.
