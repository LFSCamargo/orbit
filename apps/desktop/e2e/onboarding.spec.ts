import { chromium, expect, test, type Page } from '@playwright/test'

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

  // Account: Steam, with Xbox Cloud Gaming and Epic coming soon, or skip.
  await expect(
    page.getByRole('button', { name: /Xbox Cloud Gaming: coming soon/ }),
  ).toBeDisabled()
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

test('Settings can replay onboarding', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-focus-id="macos-play"]')).toBeVisible()
  await page.locator('[data-focus-id="macos-nav-settings"]').click()
  // Xbox Cloud Gaming is coming soon: no Settings row yet.
  await expect(page.getByRole('heading', { name: 'Xbox Cloud Gaming' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Show onboarding' }).click()
  await expect(heading(page, 'Welcome to Orbit')).toBeVisible()
  await page.getByRole('button', { name: 'Skip setup' }).first().click()
  await page.getByRole('button', { name: 'Skip setup' }).last().click()
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
  const globe = page.locator('.space-globe canvas')
  await expect(globe).toBeVisible()
  await expect(page.locator('.onboarding-effects canvas')).toHaveCount(2)
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
