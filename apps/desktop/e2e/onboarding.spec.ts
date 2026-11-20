import { chromium, expect, test, type Page } from './fixtures'

/** A fresh install: onboarding not completed yet. */
async function freshInstall(page: Page) {
  // Init scripts run on every load; seed once so a reload keeps what the app saved.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
    localStorage.setItem(
      'orbit.app-preferences-v1',
      JSON.stringify({ onboardingCompleted: false }),
    )
  })
}

const heading = (page: Page, name: string) =>
  page.getByRole('heading', { name, exact: true })
const primary = (page: Page) => page.locator('[data-focus-id="onboarding-primary"]')

test('a new user is guided from Welcome to Home', async ({ page }) => {
  await freshInstall(page)
  await page.goto('/')
  await expect(heading(page, 'Welcome to Orbit')).toBeVisible()
  // An overlay on top of Orbit: the app stays rendered behind it, out of reach.
  await expect(page.locator('[data-macos-shell]')).toBeAttached()
  await expect(page.locator('div[inert]:has([data-macos-shell])')).toHaveCount(1)
  // The planet: the 3D globe's canvas, or the CSS planet where WebGL is unavailable.
  await expect(
    page.locator('.onboarding-effects').locator('canvas, img').first(),
  ).toBeAttached()
  // The primary action carries the fixed fire gradient.
  await expect(primary(page)).toHaveClass(/orbit-btn-fire/)
  await primary(page).click()

  // Setup: browser builds cannot download, so this exercises the failure path.
  await expect(heading(page, 'Setup')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Install DXMT' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await primary(page).click()
  await expect(heading(page, 'Setup needs attention')).toBeVisible()
  await expect(primary(page)).toHaveText(/Retry Download/)
  await page.getByRole('button', { name: /^Continue without/ }).click()

  // Account: Steam or Xbox Cloud Gaming, with Epic coming soon, or skip.
  await expect(page.getByRole('button', { name: /Xbox Cloud Gaming/ })).toBeEnabled()
  await expect(heading(page, 'Account')).toBeVisible()
  await expect(
    page.getByRole('button', { name: /Epic Games: coming soon/ }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Skip for now' }).click()
  await expect(heading(page, 'Continue without an account')).toBeVisible()
  // Escape / controller B steps back inside onboarding.
  await page.keyboard.press('Escape')
  await expect(heading(page, 'Account')).toBeVisible()
  await primary(page).click()

  await expect(heading(page, 'Recommended Settings')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(heading(page, 'Account')).toBeVisible()
  await primary(page).click()
  await expect(heading(page, 'Recommended Settings')).toBeVisible()
  await expect(
    page.getByRole('switch', { name: 'Update runtimes automatically' }),
  ).toHaveAttribute('aria-checked', 'true')
  await primary(page).click()

  await expect(heading(page, 'Scan Games')).toBeVisible()
  await primary(page).click()
  await expect(
    page.getByRole('heading', { name: /Scan complete|No games found/ }),
  ).toBeVisible()
  await primary(page).click()

  await expect(page.locator('[data-focus-id="macos-play"]')).toBeVisible()
  await page.reload()
  await expect(page.locator('[data-focus-id="macos-play"]')).toBeVisible()
  await expect(heading(page, 'Welcome to Orbit')).toHaveCount(0)
})

test('a first run opens onboarding over the blurred splash, which then opens Home', async ({
  page,
}) => {
  await freshInstall(page)
  await page.goto('/')
  await expect(heading(page, 'Welcome to Orbit')).toBeVisible()
  // The splash stays up behind the card (onboarding's backdrop blurs it),
  // and Home is not shown behind it yet.
  await expect(page.locator('#orbit-splash')).toBeAttached()
  await expect(page.locator('html')).toHaveClass(/orbit-splash-under-onboarding/)
  await expect(page.locator('[data-app-layer]')).toHaveCSS('visibility', 'hidden')
  // The card is on top and works, with the keyboard too.
  await page.keyboard.press('Enter')
  await expect(heading(page, 'Setup')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(heading(page, 'Welcome to Orbit')).toBeVisible()
  // Finishing hands over to the splash: its exit opens Home.
  await page.getByRole('button', { name: 'Skip setup' }).first().click()
  await page.getByRole('button', { name: 'Skip setup' }).last().click()
  await expect(page.locator('html')).toHaveClass(/orbit-entering/, { timeout: 10_000 })
  await expect(page.locator('#orbit-splash')).toBeHidden({ timeout: 10_000 })
  await expect(page.locator('[data-app-layer]')).toHaveCSS('visibility', 'visible')
  await expect(page.locator('[data-focus-id="macos-play"]')).toBeVisible()
})

test('Settings can replay onboarding', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-focus-id="macos-play"]')).toBeVisible()
  await page.locator('[data-focus-id="macos-nav-settings"]').click()
  await expect(page.getByRole('heading', { name: 'Xbox Cloud Gaming' })).toBeVisible()
  await expect(page.locator('#orbit-splash')).toBeHidden()
  await page.getByRole('button', { name: 'Show onboarding' }).click()
  await expect(heading(page, 'Welcome to Orbit')).toBeVisible()
  // Every time onboarding opens, the splash comes back behind it, and Settings
  // is hidden behind both.
  await expect(page.locator('#orbit-splash')).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/orbit-splash-under-onboarding/)
  await expect(page.locator('[data-app-layer]')).toHaveCSS('visibility', 'hidden')
  await page.getByRole('button', { name: 'Skip setup' }).first().click()
  await page.getByRole('button', { name: 'Skip setup' }).last().click()
  // Then the splash opens Home.
  await expect(page.locator('html')).toHaveClass(/orbit-entering/, { timeout: 10_000 })
  await expect(page.locator('#orbit-splash')).toBeHidden({ timeout: 10_000 })
  await expect(page.locator('[data-focus-id="macos-play"]')).toBeVisible()
})

test('menu and section keys cannot leave onboarding', async ({ page }) => {
  await freshInstall(page)
  await page.goto('/')
  await expect(heading(page, 'Welcome to Orbit')).toBeVisible()
  for (const key of ['Escape', '[', ']', 'm', 'c', 'f']) await page.keyboard.press(key)
  await expect(heading(page, 'Welcome to Orbit')).toBeVisible()
})

test('the onboarding card stays in place at the smallest window size', async ({
  page,
}) => {
  await freshInstall(page)
  await page.setViewportSize({ width: 1024, height: 640 })
  await page.goto('/')
  await primary(page).click()
  await expect(heading(page, 'Setup')).toBeVisible()
  await primary(page).click()
  await page.getByRole('button', { name: /^Continue without/ }).click()
  await expect(heading(page, 'Account')).toBeVisible()
  await primary(page).click()
  await expect(heading(page, 'Recommended Settings')).toBeVisible()
  await primary(page).click()
  await expect(heading(page, 'Scan Games')).toBeVisible()
  await primary(page).click()
  await expect(
    page.getByRole('heading', { name: /Scan complete|No games found/ }),
  ).toBeVisible()
  // Regression: the globe hanging below the edge gave the full-screen layer
  // scroll room, and focus scrolled the card off-screen. It must not scroll.
  expect(
    await page.locator('.onboarding').evaluate((el) => {
      el.scrollTop = 400
      return el.scrollTop
    }),
  ).toBe(0)
  const card = await page.locator('.onboarding-card').boundingBox()
  expect(card!.y).toBeGreaterThanOrEqual(0)
  expect(card!.y + card!.height).toBeLessThanOrEqual(640)
})

// Regression: the keyframes lived in tailwind.config.js, which a running dev
// server never reloaded, so the scenery classes animated nothing.
test('the space scenery is animated', async ({ page }) => {
  await freshInstall(page)
  await page.goto('/')
  await expect(heading(page, 'Welcome to Orbit')).toBeVisible()
  // Headless browsers rasterize in software, so they get the CSS scenery.
  for (const name of [
    'space-twinkle',
    'space-drift',
    'nebula-drift',
    'meteor',
    'planet-turn',
    'glow-breathe',
    'ember-rise',
  ]) {
    const running = await page
      .locator(`.onboarding .${name}`)
      .first()
      .evaluate((el) => getComputedStyle(el).animationName)
    expect(running, name).toBe(name)
  }
  await expect(page.locator('.space-globe')).toHaveCount(0)
})

test('on a GPU the 3D globe turns and the sparkles draw', async () => {
  test.skip(process.platform !== 'darwin', 'needs a Metal GPU')
  const browser = await chromium.launch({
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await freshInstall(page)
  await page.goto('/')
  await expect(heading(page, 'Welcome to Orbit')).toBeVisible()
  // The startup splash (behind onboarding) has its own globe; this is the
  // onboarding card's, once the card is shown.
  await expect(page.locator('.onboarding-card')).toHaveAttribute('data-ready', 'true', {
    timeout: 15_000,
  })
  const globe = page.locator('.onboarding-effects .space-globe canvas')
  await expect(globe).toBeVisible()
  await expect(page.locator('.onboarding-effects canvas')).toHaveCount(2)
  // The canvas covers the whole card once the reveal has settled, with no
  // strip left at the bottom or right.
  await expect(page.locator('.onboarding-card')).toHaveAttribute('data-ready', 'true')
  await page.waitForTimeout(800)
  const [canvas, effects] = await Promise.all([
    globe.evaluate((el) => [el.clientWidth, el.clientHeight]),
    page
      .locator('.onboarding-effects')
      .evaluate((el) => [
        (el as HTMLElement).offsetWidth,
        (el as HTMLElement).offsetHeight,
      ]),
  ])
  expect(canvas).toEqual(effects)
  const first = await globe.screenshot()
  await expect
    .poll(async () => Buffer.compare(first, await globe.screenshot()) !== 0, {
      timeout: 15_000,
    })
    .toBe(true)
  await browser.close()
})

test('the scenery holds still with reduced motion', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  await freshInstall(page)
  await page.goto('/')
  await expect(heading(page, 'Welcome to Orbit')).toBeVisible()
  const names = await page
    .locator('.onboarding-effects *')
    .evaluateAll((els) => [
      ...new Set(els.map((el) => getComputedStyle(el).animationName)),
    ])
  expect(names).toEqual(['none'])
  await context.close()
})

test('the primary action is liquid glass with no sweeping sheen', async ({ page }) => {
  await freshInstall(page)
  await page.goto('/')
  const cta = primary(page)
  await cta.hover()
  const look = await cta.evaluate((el) => {
    const style = getComputedStyle(el)
    return {
      sheen: getComputedStyle(el, '::after').content,
      backdrop: style.backdropFilter,
      layers: style.backgroundImage.split('linear-gradient').length - 1,
    }
  })
  expect(look.sheen).toBe('none')
  expect(look.backdrop).toContain('blur')
  expect(look.layers).toBe(2)
})

// Regression: the card's reveal scaled it, the scene measured it mid-scale
// (getBoundingClientRect includes transforms) and kept that smaller size, so
// the planet stopped short of the card's bottom and right edges.
test('the planet fills the card once it has appeared', async ({ page }) => {
  await freshInstall(page)
  await page.goto('/')
  const card = page.locator('.onboarding-card')
  await expect(card).toHaveAttribute('data-ready', 'true')
  await page.waitForTimeout(800)
  const sizes = await card.evaluate((el) => {
    const card = el as HTMLElement
    const effects = card.querySelector('.onboarding-effects') as HTMLElement
    const planet = card.querySelector('.planet') as HTMLElement | null
    return {
      card: [card.clientWidth, card.clientHeight],
      effects: [effects.offsetWidth, effects.offsetHeight],
      transform: getComputedStyle(card).transform,
      planetBottom: planet ? planet.offsetTop + planet.offsetHeight : null,
    }
  })
  expect(sizes.effects).toEqual(sizes.card)
  // Fully in place: no scale left on the card.
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(sizes.transform)
  // The planet's rim leaves through the bottom edge, not above it.
  if (sizes.planetBottom !== null)
    expect(sizes.planetBottom).toBeGreaterThan(sizes.card[1])
})

test('the scene measures the card without its reveal transform', async ({ page }) => {
  await freshInstall(page)
  await page.goto('/')
  const card = page.locator('.onboarding-card')
  await expect(card).toHaveAttribute('data-ready', 'true')
  await page.waitForTimeout(800)
  const width = await card.evaluate((el) => (el as HTMLElement).offsetWidth)
  // The CSS planet is sized from the measured card (planetGeometry); scale the
  // card as the reveal did and the planet must not shrink.
  const planet = page.locator('.onboarding-effects .planet')
  const before = await planet.evaluate((el) => (el as HTMLElement).offsetWidth)
  await card.evaluate((el) => {
    ;(el as HTMLElement).style.transform = 'scale(0.9)'
  })
  await card.evaluate((el) => {
    // A resize notification while scaled, as when the card first mounts.
    const fx = el.querySelector('.onboarding-effects') as HTMLElement
    fx.style.paddingRight = '1px'
  })
  await page.waitForTimeout(300)
  const after = await planet.evaluate((el) => (el as HTMLElement).offsetWidth)
  expect(after).toBe(before)
  expect(width).toBeGreaterThan(0)
})
