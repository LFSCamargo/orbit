# Onboarding

A guided first run: **Welcome → Setup → Account → Recommended → Scan Games → Home**. It is an overlay: a card floating over Orbit, which stays rendered behind it, dimmed and blurred. The card carries its own scenery (warm corner glows, stars, a planet whose orange rim glows along the horizon, a sun bloom behind it) and orange primary actions with white labels.

## When it shows

`App.tsx` renders `OnboardingFlow` over the shell while `useOnboardingVisible()` (`modules/onboarding/lib/onboardingVisibility.ts`) is true: preferences have loaded and either onboarding is not completed yet or it was replayed from **Settings → General → Show onboarding** (`ui.store` `onboardingOpen`).

Completion lives in app preferences (`lib/appPreferences.ts`), one JSON value under the settings key `app-preferences-v1`:

| Field                 | Fresh install             | Upgrade (existing games or managed Wine) |
| --------------------- | ------------------------- | ---------------------------------------- |
| `onboardingCompleted` | `false` (onboarding runs) | `true` (written silently, no onboarding) |
| `scanOnStartup`       | `true`                    | `false`                                  |
| `autoUpdateRuntimes`  | `true`                    | `false`                                  |
| `xboxCloudConnected`  | `false`                   | `false`                                  |

Upgrades keep the new background work off, so updating Orbit changes nothing it did before. Missing fields merge from the defaults, so new fields are safe. The browser build (and e2e) reads the same JSON from `localStorage` `orbit.app-preferences-v1`. `preferences.store.ts` hydrates next to the theme in `providers.tsx`; the startup splash covers the wait for both.

Onboarding always opens over the startup splash, at first launch and when replayed from Settings (`reopenSplash()` brings the splash back, its animations and 3D globe restarted): the splash stays up behind it (onboarding holds it with `holdSplash({ untilReleased: true })`, exempt from the splash's 10 s safety limit) and shows through the backdrop, lightly veiled and blurred. `#root` rises above the splash (`html.orbit-splash-under-onboarding`, set by `App`), with the Home screen behind it hidden (`[data-app-layer]`). Controller and keyboard input reach onboarding although the splash is up. When onboarding finishes or is skipped, it releases the splash, which then plays its exit and opens Home. The splash is hidden, not removed, when it leaves, so it can come back each time.

Onboarding appears whole. `useOnboardingReady` preloads, before the card shows: Setup's queries (`SETUP_QUERIES`: catalog, installed components, Orbit Wine), the scene's code split chunks (`space/sceneModules.ts`: the Three.js globe and tsParticles, on a GPU), the first screens' images (app icon, logo, Earth textures or the CSS planet's photo) and fonts, then waits for the WebGL globe's first textured frame (`Globe3D` `onReady`). Until then the backdrop shows with a spinner and the card is hidden and `inert`; it then fades and rises in. On first run the startup splash covers that wait instead. Nothing holds it back for long: the preload stops waiting after 6 s and the scene after 4 s more.

The shell behind is `inert` and `aria-hidden` while onboarding shows, so pointer, Tab and screen readers stay in the card. Skip (✕, top right) asks first, then marks onboarding completed and opens Home; finishing does the same. — (top right) minimizes Orbit's window.

## Steps

| Step        | States                                           | Backed by                                                    |
| ----------- | ------------------------------------------------ | ------------------------------------------------------------ |
| Welcome     | —                                                | static                                                       |
| Setup       | ready · installing · needs attention · complete  | `useOnboardingSetup`, `lib/setupPlan.ts`                     |
| Account     | choose · connected · continue without an account | `useSteamSignIn` + `SteamClientSignIn`, `open_xbox_cloud`    |
| Recommended | —                                                | `compatibility_settings`, app preferences, `useLibraryPaths` |
| Scan Games  | ready · scanning · complete · empty · error      | `useOnboardingScan`, `lib/scanSummary.ts`                    |

### Setup

Rows are the real macOS stack, from the component catalog and what is installed, each with a checkbox and a badge:

- **Orbit Wine** (Required, cannot be unchecked): Orbit's CrossOver-class Wine and its base game container, through `useOrbitWineSetup` (`install_orbit_wine`, one download task `component:orbit-wine`). It downloads the newest `orbit-wine-v*` release from the Orbit GitHub repository (see [CONTAINERS.md](CONTAINERS.md#distribution)), prepares the container new games are cloned from, and makes it the default Wine. The row reads Installed once Orbit Wine is installed and that container is ready (`orbit_wine_status`).
- **Game Porting Toolkit** (Recommended, orange; "Apple license required"): newest downloadable catalog build; a prerelease only when that is all there is.
- **DXMT** (Latest).
- **DXVK + MoltenVK** (Optional, unchecked by default): one row, two installs; MoltenVK is skipped when already installed.

Installed rows show checked and locked with "Installed". One button installs every checked row **in order**; a failure does not stop the rest. Progress comes from the shared download store (task keys `component:<id>:<version>` and `component:wine-stable:recommended`), so Settings shows the same transfers. Download toasts stay quiet while onboarding is visible. "Setup needs attention" names the first failed component, shows "k of n components completed successfully", retries only failures, and offers "Continue without …" so a failing download never traps the user. If the catalog is unreachable, catalog rows read "Not available right now" and Setup can continue.

### Account

- **Steam**: existing sign-in (Valve's client in `steam-windows`). Connected shows the account name.
- **Xbox Cloud Gaming**: opens the device-code sign-in (`XboxDeviceCodeModal`, see `docs/XBOX_CLOUD.md`); connected once an account is linked.
- **Epic Games**: shown disabled, "Coming soon".
- **Skip for now** → "Continue without an account" (local-first). B returns to the choices.

Account marks: `components/brand/AccountIcons.tsx` (`XboxIcon` from Bootstrap Icons, follows text colour; `EpicGamesIcon` is the official two-tone mark in `assets/brand/epic-games.svg`).

### Recommended

| Toggle                            | Writes                                                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Optimize game performance         | MSync + Rosetta AVX on (off: default sync, AVX off)                                                                                            |
| Prefer Apple Game Porting Toolkit | graphics Automatic (GPTK first, falls back); off: Wine's own translation, which needs no extra component. An explicit D3DMetal choice is kept. |
| Update runtimes automatically     | `autoUpdateRuntimes`                                                                                                                           |
| Scan for new games on startup     | `scanOnStartup`                                                                                                                                |

Library paths are Steam's `additionalLibraryPaths` (shared with Settings → Steam through `hooks/useLibraryPaths.ts`). Saved on Continue.

### Scan Games

Three phases, weighted for the bar (a running phase counts as half done):

1. Scanning library paths (40): `scan_steam_installations`, `scan_steam_library`.
2. Detecting installed games (30): `scan_native_apps`.
3. Fetching game details (30): `refresh_steam_windows_library` when Steam is signed in.

A phase fails only when every scan in it did; both of the first two failing is the error state (Retry, or "Finish without scanning"). The library is re-counted after the first phase ("Found N games so far") and at the end ("N games found", chips per source). A fan of portrait covers (`CoverFan`, `ProgressiveArtwork`) shows the newest games, with placeholders while scanning. Each phase shows an orange check, a spinner or an empty ring. An empty library offers "Add another path" (rescans) or "Finish Anyway".

## Startup jobs

`app/startup/`, once per launch after onboarding:

- `useStartupScan`: when `scanOnStartup`, the same three scans quietly; failures are ignored.
- `useRuntimeAutoUpdate`: when `autoUpdateRuntimes`, `lib/runtimeUpdates.ts` picks installed catalog components with a newer release (newest-first catalog order; prereleases only for a prerelease install; Homebrew, Apple-download and hand-registered installs are left alone; never the pinned `wine-stable` or `zink`) and queues them one at a time through the downloads queue.

## Xbox Cloud Gaming window

Opened from Settings → General (`XboxCloudSettings`); once opened, `xboxCloudConnected` adds it to the Home menu. Playing a catalog game does not use this window: it streams in Orbit's own player (`docs/XBOX_CLOUD.md`).

`open_xbox_cloud` (`commands/xbox_cloud.rs`) opens or focuses a `xbox-cloud` window on `https://www.xbox.com/play` with a Safari user agent (the site gates on Safari). It gets no Tauri capability (`capabilities/default.json` is scoped to `main`), so the remote page cannot call Orbit. Navigation is limited to HTTPS Xbox and Microsoft sign-in hosts (`allowed_navigation`, subdomains included, lookalikes rejected); any other link opens in the default browser. Sign-in happens on Microsoft's page; Orbit stores no Xbox credentials.

To verify on device: Gamepad API support inside WKWebView on the minimum macOS, and whether Orbit's own controller listener should pause while the Xbox window is focused.

## Controller and keyboard

All controls are `Focusable` in group `onboarding` (trapped by `useModalFocus`). Each step mounts with focus on its primary action; for its first second the step re-asserts the trap and focus, since Orbit mounting behind the overlay can claim focus for its own screen. When a primary that was disabled (Installing…, Scanning…) becomes available, focus returns to it. B / Escape goes back one step (or out of a sub-state, such as "Continue without an account"); on Welcome it does nothing. Menu, Home and section switching are ignored while onboarding is visible (`onboardingAllows` in `useController.ts`), so nothing changes the screen hidden behind it.

## Layout and effects

`OnboardingFrame`: a full-window layer (`overflow: clip`, dim + 14px blur over Orbit) holding a card up to 1080 × 700 (`container-type: size`, so effects and type scale with `cq` units). The step area scrolls inside the card when a short window (down to 1024 × 640) cannot fit it.

`OnboardingEffects` (behind the content):

- Nebula: warm gas top left and right and a faint violet haze between, drifting and breathing (`nebula-drift`, 16–26 s).
- Stars: 70 seeded far stars drifting (`space-drift`, 60 s), and Aceternity's Sparkles (`space/Sparkles.tsx`, tsParticles, lazy-loaded) for the near field: about 110 particles per 400 × 400 px fading in and out, with clicks no longer adding particles. Without a GPU, 30 CSS twinkling stars stand in. Aceternity's Meteors (`space/Meteors.tsx`): 14 warm streaks spread across the width on seeded timings (`meteor`, 5–11 s).
- Planet: Aceternity UI's `Globe3D` (`components/ui/3d-globe.tsx`, as published) in Orbit's colours (`space/SpaceGlobe.tsx`): its Blue Marble Earth and bump map (NASA, via three-globe, MIT; bundled, not loaded from unpkg) under an amber key light and orange fill instead of white and blue, a camera raised 32° so the horizon runs over the continents, and its own auto-rotate. Orbit additions to the component, all optional with defaults that keep the original: `segments` (256 here, so the huge rim stays a smooth curve), `lightColor`, `fillLightColor`, `cameraElevation`, and a `viewOffset` prop that renders only the card's window of a larger frame. `planetGeometry`/`globeViewOffset` size that frame so the globe's outline is the planet circle: its top at 84% of the card height and its rim leaving through the bottom edge 3% inside each corner, whatever the card's proportions. The component's atmosphere shell is a ring 12% of the radius thick, a solid band at this scale, so it stays off (its default) and the card's CSS rim, haze and bloom provide the glow. It loads lazily with Three.js, only when onboarding shows. Without a hardware GPU (software rasterizers such as SwiftShader or llvmpipe, `graphicsTier`) a CSS planet stands in: the same geometry, with the globe photo turning inside a CSS rim.
- Atmosphere and bloom: radial gradients centred on the horizon (never ending in an edge), plus a hot core where the sun sits behind the planet; all breathe (`glow-breathe`, 3–6 s, animating `scale` so their centring transforms stay).
- Embers: 18 sparks rising off the sunlit horizon and fading (`ember-rise`, 7–14 s).

Keyframes and their classes live in `styles/index.css`, not `tailwind.config.js`: a running dev server does not reload the Tailwind config, which once left the classes animating nothing. Each element sets its own `--period` and `--delay`. Every animation is off with reduced motion (shooting stars and embers are hidden). The e2e suite checks each class resolves to running keyframes.
