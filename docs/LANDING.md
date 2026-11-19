# Landing site

`apps/landing` is the public website for Orbit: what it is, how to install it, and where to
download every published version. Orbit ships for macOS only, so the site offers Orbit for
the Mac only (Windows appears only as "Windows games", which Orbit runs through Orbit Wine). It is a Next.js (App Router) app deployed on Vercel.

## Routes

| Route                 | Purpose                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| `/`                   | Space hero with the 3D globe, features, themes, controller mapping, and the Mac download             |
| `/docs`               | Product manual: imports, library, controllers, sessions, artwork, themes, local data, and boundaries |
| `/install`            | Mac install steps, first launch, checksums, updates, uninstall, and source builds                    |
| `/download`           | Latest stable release: primary download, all files, release notes, version picker                    |
| `/download/[version]` | Same view for a specific version (e.g. `/download/0.2.0`); unknown versions return 404               |

## Presentation

The site uses the look of the Orbit app's onboarding and startup splash. Behind every page
sits a fixed space sky (`components/space/SpaceBackdrop.tsx`): drifting nebula glows, a seeded
star field with twinkling sparkles, and Aceternity meteors. The home hero puts the Orbit logo
and the fire-gradient headline above a planet's horizon (`components/space/Planet.tsx`), sized
by `lib/planetGeometry.ts` (shared with the app) so its fire rim leaves through the bottom edge.

The planet is the CSS photo planet first (server-rendered, as the app's splash). On a real GPU
with motion on and a window at least 768 px wide (`lib/globeSupport.ts`; software WebGL counts
as no GPU), the turning 3D globe (`components/space/Globe3D.tsx`, Aceternity's Globe3D with
Orbit's framing and colours, as in the app's onboarding) loads after the page is idle and fades
in over the photo once it has drawn its first frame. Three.js never loads on phones, without
WebGL, or with reduced motion.

Surfaces use the app's liquid glass (`.orbit-glass` in `globals.css`, via `GlassPanel`), and
primary actions the fire-gradient glass button (`.orbit-btn-fire`, via `buttonClass`). Sections
reveal on scroll. Reduced motion stops every animation; reduced transparency makes glass
opaque.

## Release data

Releases come from the GitHub Releases API for `LFSCamargo/orbit`, so publishing a release
through [the release workflow](../.github/workflows/release.yml) is all it takes to list it.

- `src/lib/github.ts` fetches `/repos/LFSCamargo/orbit/releases?per_page=100` with
  `next: { revalidate: 600 }`. Pages regenerate at most every 10 minutes (ISR).
- `src/lib/releases.ts` validates the untrusted payload: drafts and non-semver tags are dropped,
  only `https://github.com/` download URLs are kept, and versions sort newest first.
- Only macOS files are offered: `*.dmg`, `*.app.tar.gz` and `SHA256SUMS.txt`. Anything else on
  a release (Windows or Linux files on older releases) is dropped, and stays reachable from
  the release's GitHub page. Orbit Wine releases (`orbit-wine-v*`) are not semver and never
  listed.
- "Download for Mac" prefers the Apple Silicon DMG, then universal, Intel, and the app
  archive.
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
