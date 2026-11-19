import { chromium, expect, test } from '@playwright/test'

test('the splash shows the logo over the planet, with meteors and sparkles, then zooms into Orbit', async ({
  page,
}) => {
  // Hold Orbit's own script back: the splash must paint and move without it,
  // and stays put for these checks.
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(/\/assets\/index-[^/]+\.js$/, async (route) => {
    await gate
    await route.continue()
  })
  // Module scripts hold DOMContentLoaded, so only wait for the page to arrive.
  await page.goto('/', { waitUntil: 'commit' })
  const splash = page.locator('#orbit-splash')
  // Painted from index.html before any script module runs: motion, no text.
  await expect(splash).toBeAttached()
  expect((await splash.innerText()).trim()).toBe('')
  await expect(splash.locator('img.splash-logo')).toHaveCount(1)
  await expect(splash.locator('.splash-planet img')).toHaveCount(1)
  // Regression: the logo was blurry. It has pixels for Retina, and its
  // entrance only fades and rises: no scale (a scaled-up layer is drawn at
  // its start size) and no filter.
  const logo = splash.locator('img.splash-logo')
  await expect
    .poll(() =>
      logo.evaluate((img: HTMLImageElement) => img.naturalWidth / img.clientWidth),
    )
    .toBeGreaterThanOrEqual(2)
  expect(
    await page.evaluate(() =>
      [...document.styleSheets]
        .flatMap((sheet) => {
          // Cross-origin sheets (Google Fonts) cannot be read.
          try {
            return [...sheet.cssRules]
          } catch {
            return []
          }
        })
        .filter(
          (rule) => rule instanceof CSSKeyframesRule && rule.name === 'splash-logo-in',
        )
        .map((rule) => rule.cssText)
        .join(''),
    ),
  ).not.toMatch(/scale|filter/)
  // No filter on the logo at rest either: WebKit draws a filtered, animated
  // layer at low resolution, and a filter list that differs from the
  // entrance's cannot blend, so the app's WebKit could keep it blurred.
  await expect(logo).toHaveCSS('filter', 'none')
  await expect
    .poll(() => splash.locator('.splash-meteor').count())
    .toBeGreaterThanOrEqual(8)
  await expect
    .poll(() => splash.locator('.splash-sparkle').count())
    .toBeGreaterThanOrEqual(20)
  // Regression: meteors waited for their delays above the top edge, so few
  // ever crossed a short splash. They are mid-flight from the first frame.
  await expect
    .poll(
      () =>
        splash.evaluate((el) => {
          const box = el.getBoundingClientRect()
          return [...el.querySelectorAll('.splash-meteor')].filter((meteor) => {
            const rect = meteor.getBoundingClientRect()
            return (
              rect.right > 0 &&
              rect.left < box.width &&
              rect.bottom > 0 &&
              rect.top < box.height * 0.84
            )
          }).length
        }),
      { timeout: 1500 },
    )
    // Before, none were; a few are always just off an edge mid-flight.
    .toBeGreaterThanOrEqual(4)
  const animated = await splash.evaluate(
    (el) =>
      [
        ...el.querySelectorAll('.splash-meteor, .splash-sparkle, .splash-planet-surface'),
      ].filter((node) => getComputedStyle(node).animationName !== 'none').length,
  )
  expect(animated).toBeGreaterThan(20)
  // The planet's rim rises from the bottom edge and leaves through it.
  const planet = await splash.locator('.splash-planet').boundingBox()
  const viewport = page.viewportSize()!
  expect(planet!.y).toBeGreaterThan(viewport.height * 0.5)
  expect(planet!.y + planet!.height).toBeGreaterThan(viewport.height)
  expect(
    await page.evaluate(() =>
      document.documentElement.classList.contains('orbit-booting'),
    ),
  ).toBe(true)
  release()
  // It leaves once Orbit's first screen is ready, and Orbit is then usable.
  await expect(splash).toBeHidden({ timeout: 10_000 })
  await expect(page.locator('html')).not.toHaveClass(/orbit-booting|orbit-entering/)
  await expect(page.locator('[data-focus-id="macos-nav-library"]')).toBeVisible()
  await expect(page.locator('#root')).toHaveCSS('opacity', '1')
})

test('on a GPU the splash spins the 3D globe, then opens Home through an iris', async () => {
  test.skip(process.platform !== 'darwin', 'needs a Metal GPU')
  const browser = await chromium.launch({
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto('/', { waitUntil: 'commit' })
  const globe = page.locator('#orbit-splash-globe')
  // The splash waits for the globe's first frame, then shows it over the photo.
  await expect(globe).toHaveAttribute('data-ready', 'true', { timeout: 10_000 })
  await expect(globe.locator('canvas')).toHaveCount(1)
  const logo = await page.locator('.splash-logo').boundingBox()
  expect(Math.abs(logo!.x + logo!.width / 2 - 720)).toBeLessThan(4)
  // Leaving: Home is revealed through the iris, with the fire ring on its edge.
  await expect(page.locator('html')).toHaveClass(/orbit-entering/, { timeout: 10_000 })
  expect(
    await page.evaluate(
      () => getComputedStyle(document.getElementById('root')!).animationName,
    ),
  ).toBe('orbit-iris')
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement, '::after').animationName,
    ),
  ).toBe('orbit-ring')
  // Then the splash and its WebGL scene are gone.
  await expect(page.locator('#orbit-splash')).toBeHidden()
  await expect(page.locator('canvas')).toHaveCount(0)
  await browser.close()
})
