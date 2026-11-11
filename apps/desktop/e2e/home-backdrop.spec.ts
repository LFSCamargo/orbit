import { expect, test } from '@playwright/test'

const activeImage = '.macos-hero-layer[data-layer="active"]'

test('Home uses selected game art under a branded theme and adapts glass to lighting', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('orbit.themeId', 'super-mario'))
  await page.route('https://images.igdb.com/**', async (route) => {
    const bright = route.request().url().includes('co5vmg')
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="100%" height="100%" fill="${bright ? '#f5f4ed' : '#141c22'}"/></svg>`,
      headers: { 'access-control-allow-origin': '*' },
    })
  })
  await page.goto('/')
  await expect(page.locator('.macos-brand img')).toHaveAttribute(
    'alt',
    'Super Mario Odyssey',
  )
  await expect(page.locator(activeImage)).toHaveAttribute('src', /co2rpf/)
  const glass = page.locator('.macos-navigation')
  const opacity = () =>
    glass.evaluate((el) =>
      Number(getComputedStyle(el).backgroundColor.match(/, ([\d.]+)\)$/)?.[1] ?? 1),
    )
  await expect.poll(opacity).toBeLessThan(0.4)
  await page.locator('[data-focus-id="macos-game-mock-re4"]').hover()
  await expect(page.locator(activeImage)).toHaveAttribute('src', /co5vmg/)
  await expect.poll(opacity).toBeGreaterThan(0.7)
  const radius = await page
    .locator('[data-focus-id="macos-game-mock-re4"] .square-game-art')
    .evaluate((el) => parseFloat(getComputedStyle(el).borderRadius))
  expect(radius).toBeGreaterThan(20)
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await expect(page.locator(activeImage)).toHaveAttribute('src', /hero.*\.webp/)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator(activeImage)).toHaveAttribute('src', /co5vmg/)
})

test('keeps the current art while the next image loads and skips fades for reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('https://images.igdb.com/**', async (route) => {
    if (route.request().url().includes('co5vmg')) await gate
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="100%" height="100%" fill="#387488"/></svg>',
      headers: { 'access-control-allow-origin': '*' },
    })
  })
  await page.goto('/')
  await expect(page.locator(activeImage)).toHaveAttribute('src', /co2rpf/)
  await page.locator('[data-focus-id="macos-game-mock-re4"]').hover()
  await expect(page.locator('#macos-feature-title')).toHaveText('Resident Evil 4')
  await expect(page.locator(activeImage)).toHaveAttribute('src', /co2rpf/)
  release()
  await expect(page.locator(activeImage)).toHaveAttribute('src', /co5vmg/)
  await expect(page.locator(activeImage)).toHaveCSS('animation-name', 'none')
  await expect(page.locator('.macos-hero-layer')).toHaveCount(1)
})
