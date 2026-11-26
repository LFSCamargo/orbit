# Landing site

`apps/landing` is the public website for Orbit: what it is, how to install it, and where to
download every published version. Orbit ships for macOS only, so the site offers Orbit for
the Mac only (Windows appears only as "Windows games", which Orbit runs through Orbit Wine). It is a Next.js (App Router) app deployable on Netlify or Vercel.

## Routes

| Route                  | Purpose                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`                    | Space hero with provider logos, game cover wall, demo reel and screenshots, features, sources, themes, controller, why Orbit, download, and FAQ  |
| `/docs`                | Product manual: imports, library, controllers, sessions, artwork, themes, local data, and boundaries                                             |
| `/install`             | Install hero with download CTA and animated install, three-step overview, then the detailed guide (first launch, checksums, updates, source)     |
| `/download`            | Latest stable release: primary download, all files, release notes, version picker                                                                |
| `/download/[version]`  | Same view for a specific version (e.g. `/download/0.2.0`); unknown versions return 404                                                           |
| `/changelog`           | Every release from `CHANGELOG.md`, newest first, with its summary and kinds of change                                                            |
| `/changelog/[version]` | One release explained: highlights, each change with "find in code" links, and the commits and pull requests between its tag and the previous one |
| `/blog`                | Announcements and articles (MDX), filterable by kind, with view counts and an RSS feed at `/blog/rss.xml`                                        |
| `/blog/[slug]`         | One post: view count, reactions and share links                                                                                                  |
| `/api/blog/*`          | View and reaction counters (`GET` / `POST /api/blog/[slug]`, `GET /api/blog/stats`)                                                              |

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

The cover wall (`public/covers/`) and demo screenshots (`public/screenshots/`) are cropped from
Orbit's own screens. The demo section opens on the 38-second Orbit features trailer,
with separate God of War (Orbit Wine + GPTK 4.0.3, 45 seconds) and Forza Horizon 6
(Xbox Game Cloud Layer, 32 seconds) tabs alongside the screenshots. Web-optimized 1080p
H.264 MP4s and 720p JPEG posters live in `public/videos/`. Each video opens with the recorded Orbit globe startup animation and uses an original
synthesized 150 BPM rage-trap instrumental with no third-party samples. Videos play on
request with sound and native controls, and preload metadata only. The God of War
caption explains that keyboard and mouse were used because screen recording affected
controller performance; controllers work normally outside recording. Switching tabs unmounts the
previous video so it stops playing; only the selected player is mounted. Steam and Xbox marks are Bootstrap
Icons (MIT), Epic's is its official mark, shown as coming soon. Each provider logo
has its own component under `components/brand/`; source cards live in
`components/home/SourceCard.tsx`.

The themes section replaces the decorative studio mockup with a selectable screenshot
gallery (`ThemePreviewGallery.tsx`). It shows Devil May Cry 5, God of War, Cyberpunk 2077,
Zelda: Ocarina of Time Remake, and Grand Theft Auto VI from `public/screenshots/themes/`.
Thumbnail buttons expose their selection with `aria-pressed`; native keyboard activation
switches the single large preview. Next Image serves responsive, lazy-loaded images.

Surfaces use the app's liquid glass (`.orbit-glass` in `globals.css`, via `GlassPanel`), and
primary actions the fire-gradient glass button (`.orbit-btn-fire`, via `buttonClass`). Sections
reveal on scroll. Reduced motion stops every animation; reduced transparency makes glass
opaque.

The website favicon (`src/app/favicon.ico`) is the Orbit application icon, copied
from the desktop app’s icon assets. Next.js adds its icon metadata on every route.

## Navigation

`components/layout/SiteNav.tsx` renders the header links from `lib/navigation.ts`: **Home**
(Demo, Overview, Sources, Themes, Why — anchors on `/`) and **Resources** (Changelog, Documentation,
Install, FAQ, Blog) open on hover, click or keyboard (Escape closes), then GitHub and Download.
Below `md` a menu button shows the same groups. The dropdown and mobile panels are liquid glass, rendered in a portal on `document.body` 12 px below the header: inside the header's own `backdrop-filter` glass a translucent panel lets the page show through in Chromium. Resources-page heroes fade their glow out with a mask instead of clipping it, so there is no hard line under them.

## Changelog

`/changelog` reads the repository's `CHANGELOG.md` and `.github/release-notes/<version>.md`
(`lib/changelogSource.ts`, parsed by `lib/changelog.ts`). A release page prefers its release
notes, which explain each change in more depth, and falls back to `CHANGELOG.md`. Inline `code`
in a change becomes a GitHub code-search link. When the version has a GitHub release, the page
lists every commit since the previous published tag from the compare API
(`fetchReleaseComparison` in `lib/github.ts`, revalidated hourly), grouped by Conventional Commit
type and linked to the commit and pull request. `next.config.ts` traces both files into the
server bundle so revalidation can read them.

## Blog

Posts are MDX files in `src/content/blog/<slug>.mdx`, listed with their metadata (title,
highlighted words for the social card, description, date, kind, tags, reading time) in
`src/content/blog/posts.ts`, newest first. `src/mdx-components.tsx` styles the elements and
provides `<Callout>`. To publish a post, add the MDX file and its `POSTS` entry.

Each read is counted once per browser every six hours (an `ov_<slug>` cookie) and each
reaction (👍 ❤️ 🚀 🎮) once per browser (`or_<slug>`). Counts are anonymous: no account, IP or
fingerprint is stored. On Netlify they live in the `orbit-blog-stats` Netlify Blobs store
(`lib/blog/stats.ts`); elsewhere (local dev, tests, Vercel) in memory, so they reset with the
server. Posts share to X, Bluesky, LinkedIn, Reddit, Hacker News and Facebook, copy their link,
or open the system share sheet (`components/share/ShareBar.tsx`); release pages share the same way.

## Release data

Releases come from the GitHub Releases API for `LFSCamargo/orbit`, so publishing a release
through [the release workflow](../.github/workflows/release.yml) is all it takes to list it.

- `src/lib/github.ts` fetches `/repos/LFSCamargo/orbit/releases?per_page=100` with
  `next: { revalidate: 120 }` and exposes `fetchLatestRelease()` as the shared source of
  truth for `/`, `/install`, and `/download`. Pages regenerate at most every 2 minutes (ISR).
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

New GitHub releases appear within the 2-minute revalidation window; redeploy to show them
immediately.

## Deploy (Netlify)

The root `netlify.toml` keeps builds at the workspace root and publishes only the
landing app. It overrides the dashboard build command with `yarn nx run landing:build`.
The Nx project is named `landing`; `@orbit/landing` is the Yarn package name and is
not a valid Nx project target.

Use these Netlify site settings:

- **Base directory:** repository root (`.`).
- **Package directory:** `apps/landing` (set in the Netlify dashboard).
- **Build command:** `yarn nx run landing:build` (owned by `netlify.toml`).
- **Publish directory:** `apps/landing/.next` (relative to the repository root).
- **Runtime:** Netlify’s automatically detected Next.js adapter. Keep SSR and ISR enabled;
  this app does not use a static export.
- **Environment:** optional server-only `GITHUB_TOKEN`, as on Vercel.

## Metadata and social sharing

Every section has its own generated 1200×630 social card (`opengraph-image.tsx` and
`twitter-image.tsx`), drawn by `src/og/card.tsx` with `next/og` in four layouts that match the
design: **Landing Page** (`/`), **Installation** (`/install`), **Changelog** (`/changelog` and
each `/changelog/[version]`: "Orbit vX is here." with its kinds of change) and **Blog**
(`/blog` and each post, with its own title). `/docs` and `/download` use the same card with their
own titles. The space background, planet horizon, wordmark and DM Sans fonts are in
`src/og/assets/` (the background is pre-rendered as one JPEG). Cards are generated at build time.

`lib/seo.ts` gives each page its canonical URL plus Open Graph (`og:type`, site name, locale,
article dates and tags) and `summary_large_image` Twitter tags, which LinkedIn, Facebook,
Slack, Discord, iMessage, WhatsApp, Bluesky and X all read. `src/app/layout.tsx` sets
`metadataBase` to `https://orbit.thelittleluiz.me` so images resolve to absolute URLs. The site
also serves `/sitemap.xml`, `/robots.txt` (`/api/` disallowed), `/manifest.webmanifest`, an RSS
feed, and JSON-LD: `SoftwareApplication` and `WebSite` on `/`, `BlogPosting` and breadcrumbs on
posts, `TechArticle` on release pages.

Netlify discovers the root config when no package-level config exists. File-based build
settings override dashboard values, including a previously inferred
`nx run @orbit/landing:build` command. After this config reaches the branch Netlify builds,
retry the deploy. See [Netlify monorepo configuration](https://docs.netlify.com/build/configure-builds/monorepos/).
