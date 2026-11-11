# Landing site

`apps/landing` is the public website for Orbit: what it is, how to install it, and where to
download every published version. It is a Next.js (App Router) app deployed on Vercel.

## Routes

| Route                 | Purpose                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| `/`                   | Animated product preview, features, themes, controller mapping, downloads for all desktop platforms  |
| `/docs`               | Product manual: imports, library, controllers, sessions, artwork, themes, local data, and boundaries |
| `/install`            | macOS, Windows, and Linux install steps, checksums, updates, uninstall, and source builds            |
| `/download`           | Latest stable release: primary download, all files, release notes, version picker                    |
| `/download/[version]` | Same view for a specific version (e.g. `/download/0.2.0`); unknown versions return 404               |

## Presentation

The dark grayscale visual system uses red, orange, and yellow accents. The home hero uses
`MacbookScroll`, a Motion-powered scroll perspective inspired by Aceternity UI, with a
reduced-motion static fallback. Platform cards expose the latest compatible asset for each
desktop OS without making browser or OS detection a requirement.

## Release data

Releases come from the GitHub Releases API for `LFSCamargo/orbit`, so publishing a release
through [the release workflow](../.github/workflows/release.yml) is all it takes to list it.

- `src/lib/github.ts` fetches `/repos/LFSCamargo/orbit/releases?per_page=100` with
  `next: { revalidate: 600 }`. Pages regenerate at most every 10 minutes (ISR).
- `src/lib/releases.ts` validates the untrusted payload: drafts and non-semver tags are dropped,
  only `https://github.com/` download URLs are kept, and versions sort newest first.
- Assets are classified by file name and platform: `*.dmg` / `*.app.tar.gz` (macOS),
  `*.exe` / `*.msi` (Windows), `*.AppImage` / `*.deb` / `*.rpm` / Linux archives, and
  `SHA256SUMS.txt` (checksums). Architecture labels adapt to the platform.
- Primary downloads prefer Apple Silicon DMG on macOS, x64 EXE on Windows, and x64 AppImage
  on Linux, with the other native package formats as fallbacks. If a release has no bundle
  for a platform, the install guide links to the cross-platform source build instead.
- "Latest" is the newest non-prerelease. Pre-releases are listed with a badge.
- If GitHub is unreachable or rate-limited, pages show a fallback that links to GitHub Releases.
- Release notes are rendered from markdown with `react-markdown` (raw HTML is never rendered).

Asset names come from `scripts/release-macos.sh` (`Orbit-<version>-<arch>.dmg`,
`Orbit-<version>-<arch>.app.tar.gz`, `SHA256SUMS.txt`). Renaming artifacts there requires
updating `classifyAsset` and its tests.

## Environment

| Variable       | Required | Notes                                                                               |
| -------------- | -------- | ----------------------------------------------------------------------------------- |
| `GITHUB_TOKEN` | No       | Server-only. Raises the GitHub API rate limit (60/hour unauthenticated). Read-only. |

## Develop

```bash
yarn dev:landing                         # http://localhost:3000
yarn nx run landing:build                # production build
yarn workspace @orbit/landing start      # serve the build
yarn nx run landing:test:unit            # Vitest
yarn nx run landing:typecheck            # next typegen + tsc
```

## Deploy (Vercel)

Create a Vercel project from this repository with:

- **Framework preset:** Next.js
- **Root directory:** `apps/landing`
- **Install command:** default (Vercel detects Yarn workspaces and installs from the repo root)
- **Build command:** default (`next build`)
- **Environment:** optional `GITHUB_TOKEN`

New GitHub releases appear within the 10-minute revalidation window; redeploy to show them
immediately.
