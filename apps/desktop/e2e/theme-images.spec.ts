import { expect, test } from '@playwright/test'

test('theme artwork fills equal frames and contains logos without moving card headers', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.locator('[data-focus-id="settings-tab-themes"]').click()
  const cards = page
    .locator('[data-focus-id^="settings-theme-"]')
    .filter({ has: page.locator('.theme-card-logo') })
  const heights: number[] = []
  for (const card of await cards.all()) {
    await card.scrollIntoViewIfNeeded()
    await expect(card.locator('.theme-card-logo')).toHaveAttribute('data-state', 'ready')
    const artwork = await card.locator('.theme-card-artwork').boundingBox()
    const logo = await card.locator('.theme-card-logo').boundingBox()
    expect(artwork).not.toBeNull()
    expect(logo!.x).toBeGreaterThan(artwork!.x)
    expect(logo!.y).toBeGreaterThan(artwork!.y)
    expect(logo!.x + logo!.width).toBeLessThan(artwork!.x + artwork!.width)
    expect(logo!.y + logo!.height).toBeLessThan(artwork!.y + artwork!.height)
    expect(
      await card
        .locator('.theme-card-logo img')
        .evaluate((el) => getComputedStyle(el).objectFit),
    ).toBe('contain')
    heights.push(artwork!.height)
  }
  expect(heights).toHaveLength(8)
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(2)
})

test('shows a loading animation without shifting the image frame and respects reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(/.*preview-hero-.*\.webp/, async (route) => {
    await gate
    await route.continue()
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.locator('[data-focus-id="settings-tab-themes"]').click()
  const card = page.locator('[data-focus-id="settings-theme-devil-may-cry-5"]')
  const hero = card.locator('.theme-card-hero')
  await expect(hero).toHaveAttribute('data-state', 'loading')
  const before = await card.locator('.theme-card-artwork').boundingBox()
  expect(
    await hero
      .locator('.artwork-skeleton')
      .evaluate((el) => getComputedStyle(el, '::after').animationName),
  ).toBe('none')
  release()
  await expect(hero).toHaveAttribute('data-state', 'ready')
  expect(await card.locator('.theme-card-artwork').boundingBox()).toEqual(before)
})
