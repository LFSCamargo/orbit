import { expect, test } from '@playwright/test'

test.describe('macOS Liquid Glass console', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('orbit.themeId', 'macos'))
    await page.route('https://images.igdb.com/**', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        headers: { 'access-control-allow-origin': '*' },
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="100%" height="100%" fill="#203740"/></svg>',
      }),
    )
    await page.goto('/')
    await expect(page.locator('[data-macos-shell]')).toBeVisible()
    await expect(page.locator('.macos-feature')).toBeVisible()
  })

  test('fills the viewport with artwork and provides working glass navigation', async ({
    page,
  }) => {
    await expect(page.locator('.macos-sidebar, .macos-window, .macos-dock')).toHaveCount(
      0,
    )
    await expect(page.locator('.macos-navigation')).toHaveAttribute(
      'data-glass-mode',
      /pending|simple|opaque/,
    )
    const heroImage = () =>
      page.locator('.macos-hero-layer[data-layer="active"]').getAttribute('src')
    await expect.poll(heroImage).toContain('co2rpf')
    await expect
      .poll(async () => {
        const rect = await page.locator('[data-macos-shell]').boundingBox()
        const viewport = page.viewportSize()!
        return rect
          ? Math.abs(rect.width - viewport.width) +
              Math.abs(rect.height - viewport.height) +
              Math.abs(rect.x) +
              Math.abs(rect.y)
          : 999
      })
      .toBeLessThan(2)
    await page.locator('[data-focus-id="macos-nav-library"]').click()
    await expect(page.locator('[data-screen="library"]')).toBeVisible()
    await page.locator('[data-focus-id="macos-nav-search"]').click()
    await page.getByPlaceholder('Find a game…').fill('Resident')
    await expect(page.locator('[data-focus-id="search-game-mock-re4"]')).toBeVisible()
    await page.locator('[data-focus-id="macos-nav-settings"]').click()
    await page.locator('[data-focus-id="settings-tab-themes"]').click()
    await expect(
      page.locator('[data-focus-id="settings-theme-liquid-glass"]'),
    ).toBeVisible()
    await page.reload()
    await expect(page.locator('[data-macos-shell]')).toBeVisible()
  })

  test('selects games through the shelf and opens details without launching', async ({
    page,
  }) => {
    const heroImage = () =>
      page.locator('.macos-hero-layer[data-layer="active"]').getAttribute('src')
    await expect.poll(heroImage).toContain('co2rpf')
    const initialArt = await heroImage()
    await page.locator('[data-focus-id="macos-game-mock-re4"]').hover()
    await expect(page.locator('#macos-feature-title')).toHaveText('Resident Evil 4')
    await expect(page.locator('[data-focus-id="macos-game-mock-re4"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect.poll(heroImage).not.toBe(initialArt)
    await page.locator('[data-focus-id="macos-details"]').click()
    await expect(page.locator('[data-screen="game-details"]')).toBeVisible()
    await page.locator('[data-focus-id="macos-back"]').click()
    await expect(page.locator('[data-screen="home"]')).toBeVisible()
    await expect(page.locator('[data-focus-id="macos-game-mock-re4"]')).toHaveAttribute(
      'data-focused',
      'true',
    )
  })

  test('keeps glass controls reachable in a compact window with reduced motion', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.locator('.macos-navigation')).toBeVisible()
    const overflow = await page
      .locator('.macos-shell')
      .evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow).toBeLessThan(2)
    await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Enter fullscreen', exact: true }),
    ).toBeVisible()
    await page.locator('[data-focus-id="macos-nav-library"]').click()
    await expect(page.locator('[data-screen="library"]')).toBeVisible()
    const duration = await page
      .locator('.macos-wallpaper span')
      .first()
      .evaluate((el) => getComputedStyle(el).animationDuration)
    expect(parseFloat(duration)).toBeLessThan(0.01)
  })

  test('supports controller section navigation and game focus', async ({ page }) => {
    await page.keyboard.press('BracketRight')
    await expect(page.locator('[data-screen="library"]')).toBeVisible()
    await expect(
      page.locator('[data-focus-id="library-sort-alphabetical"]'),
    ).toHaveAttribute('data-focused', 'true')
    await page.keyboard.press('BracketLeft')
    await expect(page.locator('[data-screen="home"]')).toBeVisible()
    await expect(page.locator('[data-focus-id="macos-play"]')).toHaveAttribute(
      'data-focused',
      'true',
    )
  })
})
