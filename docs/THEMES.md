# Liquid Glass and SteamGridDB themes

Orbit has one interface look: **Liquid Glass**. Game themes change the logo and background. The default Liquid Glass palette matches the Orbit landing page: a dark grayscale canvas with warm orange accents and yellow focus rings. Saved custom themes can also override every color.

## Choose a game theme

Select a game under **Game themes**. Orbit applies its bundled logo, wallpaper,
and colors immediately. These themes work offline in the desktop app and browser
preview, including after restart.

## Make your own

1. Open **Theme studio** and enter a theme name and the exact **Game title**.
2. Choose **Choose logo** for SteamGridDB artwork or **Choose background** to browse SteamGridDB, TheGamesDB, RAWG, and Wikimedia. Providers that require an API key use the keys from Settings.
3. Customize colors under **Custom colors**, or pick a **Suggested palette**. You can also choose **Extract from image** to generate a palette from any cover or hero on your machine.
4. Save as your theme. Saved themes can be edited or deleted in the studio.

The logo appears in the header, with a small Orbit signature in the footer. The chosen hero is the background on Home, game details, and other screens. The plain Liquid Glass choice retains the original selected-game artwork behavior.

## Compatibility and files

Saved `ps5`, `switch-2`, `orbit`, `macos`, `steam-big-picture`, `aurora`, `ember`, `sakura`, and `graphite` selections resolve to Liquid Glass. These are not selectable looks.

Custom files remain in `~/Library/Application Support/Orbit/themes/*.json`; they are not deleted or rewritten by migration. Legacy radius, font, motion, `logoText`, and `logoStyle` fields remain readable for file compatibility, but the shell always uses the Liquid Glass look and does not render text game logos. Color fields are honored when a custom theme sets them. Existing custom artwork remains available; new studio images use the picker’s approved providers. Save updates a custom file only when requested.

Opening Themes reuses the catalog loaded at startup. Use **Reload custom themes**
after editing files externally. Native loading runs on a worker with a 128-theme,
64 MB input budget and a 512-entry directory scan limit; each file remains capped
at 20 MB. Symlinks are skipped. Inline artwork becomes cached display files and
small thumbnails before metadata crosses IPC, keeping base64 blobs out of React.
The optional `preview` paths exist only in the runtime catalog and are never a
portable theme JSON field. Legacy GIF originals remain animated in the shell;
their grid cards use a static placeholder.

Theme JSON keeps the existing `id`, `name`, `colors`, and optional `branding` shape. `colors` is an object of space-separated RGB triplets (`"R G B"`) for `canvas`, `surface`, `panel`, `foreground`, `muted`, `accent`, `focus`, and `border`. IDs written by the studio begin with `custom-`. Relevant branding fields:

| Field                   | Meaning                                  |
| ----------------------- | ---------------------------------------- |
| `logoImage`             | Inline raster logo or bundled reference  |
| `wallpaper`             | Inline raster hero or bundled reference  |
| `artworkQuery`          | Exact SteamGridDB game title             |
| `tagline`               | Optional existing footer text            |
| `logoText`, `logoStyle` | Legacy data; not rendered as a game logo |

The illustrative [example JSON](examples/arcade-neon.json) retains the compatible schema; use the studio to add actual artwork. The backend rejects invalid theme IDs and colors and strips remote/SVG branding images. Theme Studio preserves bundled artwork in saved copies using references such as `orbit-bundled:cyberpunk-2077:hero`. Custom JSON remains an advanced compatibility format, not an alternate layout API.

## Rendering

The shared surface in `apps/desktop/src/components/ui/liquid-glass.tsx` uses restrained compositor blur and subtle edges. Rust prepares a small shared grain texture for desktop sessions. Browser preview uses the same material styling. Reduced transparency and high contrast use opaque panels. Controller focus and navigation continue through the existing shared shell.

## Offline built-in artwork

All eight built-in game themes ship with optimized WebP logos and heroes in
`apps/desktop/src-tauri/assets/bundled-themes/`. Vite packages these same files for
browser development and builds; Tauri prefers WebP, with PNG/JPG support for older bundles.
Theme cards show local artwork before selection. No key or network is needed to
display bundled themes. To refresh artwork, configure the ignored root `.env`
with `STEAMGRIDDB_API_KEY` and run
`node --env-file=.env scripts/bundle-theme-artwork.mjs`.

Theme card previews use fixed frames with cropped backgrounds and contained logos.
Desktop preparation uses a Rust GPU worker with CPU fallback and disk caching.
Packaged previews are available immediately without starting native preparation.
A shimmer appears while preparation or decoding is pending. Reduced Motion uses
a static placeholder. Full-resolution originals remain available for the shell
wallpaper. After refreshing bundled artwork, run `yarn optimize:themes` to regenerate the display images and compact WebP previews. `bundle:themes` runs this step automatically.

Display logos are cropped to their visible alpha bounds and fit within 1024×512.
Bundled wallpapers use high-quality WebP and retain their source resolution up to
3840×2160 without changing aspect ratio. Card previews use their own smaller WebP
files. Downloaded and newly saved custom artwork receives the same dimension
limits on a Rust worker; transparent images preserve alpha. Existing compact JPEG
and WebP inputs are retained to avoid repeated lossy encoding.

The offline optimizer needs the `cwebp` build tool. It keeps a recovery copy of
replaced artwork in the system temporary directory and makes no changes when
the bundle is already optimized.

Preparation scales linearly with decoded pixel count, with bounded image dimensions
and a fixed number of artwork slots per theme. Shipped card previews bypass full
image decoding and GPU initialization; custom image processing runs off the UI thread.
