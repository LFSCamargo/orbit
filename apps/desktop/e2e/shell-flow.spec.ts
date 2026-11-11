import { expect, test, type Page } from '@playwright/test'

async function boot(page: Page) {
  await page.goto('/')
  await expect(page.locator('[data-macos-shell]')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('[data-screen="home"]')).toBeVisible()
}

async function openCyberpunkDetails(page: Page) {
  await page.locator('[data-focus-id="macos-nav-library"]').click()
  await page.locator('[data-focus-id="library-game-mock-cyberpunk"]').click()
  await expect(page.locator('[data-screen="game-details"]')).toBeVisible()
}

test.describe('Liquid Glass shell flows', () => {
  test.beforeEach(async ({ page }) => {
    await boot(page)
  })

  test('boots into Liquid Glass with the Orbit wordmark by default', async ({ page }) => {
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'liquid-glass')
    await expect(page.locator('.macos-brand .theme-brand')).toHaveAttribute(
      'data-brand',
      'orbit',
    )
    await expect(page.locator('.theme-orbit-mark')).toHaveCount(0)
  })

  test('navigates library to details and back', async ({ page }) => {
    await openCyberpunkDetails(page)
    await expect(page.getByRole('heading', { name: 'Cyberpunk 2077' })).toBeVisible()
    await page.locator('[data-focus-id="macos-back"]').click()
    await expect(page.locator('[data-screen="library"]')).toBeVisible()
  })

  test('search finds games and back returns to search', async ({ page }) => {
    await page.locator('[data-focus-id="macos-nav-search"]').click()
    await page.getByPlaceholder('Find a game…').fill('Resident')
    await page.locator('[data-focus-id="search-game-mock-re4"]').click()
    await expect(page.locator('[data-screen="game-details"]')).toBeVisible()
    await page.locator('[data-focus-id="macos-back"]').click()
    await expect(page.locator('[data-screen="search"]')).toBeVisible()
  })

  test('settings lists themes and imports', async ({ page }) => {
    await page.locator('[data-focus-id="macos-nav-settings"]').click()
    await page.locator('[data-focus-id="settings-tab-themes"]').click()
    await expect(
      page.locator('[data-focus-id="settings-theme-liquid-glass"]'),
    ).toBeVisible()
    await page.locator('[data-focus-id="settings-tab-library"]').click()
    await expect(page.getByRole('heading', { name: 'Import games' })).toBeVisible()
    await expect(page.locator('[data-focus-id="import-steam"]')).toBeVisible()
  })

  test('controller section keys cycle every shell route', async ({ page }) => {
    for (const screen of ['library', 'search', 'settings', 'home'] as const) {
      await page.keyboard.press('BracketRight')
      await expect(page.locator(`[data-screen="${screen}"]`)).toBeVisible({
        timeout: 10_000,
      })
      await page.waitForTimeout(400)
    }
  })

  test('section keys focus page content instead of the navigation', async ({ page }) => {
    for (let i = 0; i < 3; i += 1) await page.keyboard.press('BracketRight')
    await expect(page.locator('[data-screen="settings"]')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('[data-focus-id="settings-fullscreen"]')).toHaveAttribute(
      'data-focused',
      'true',
      { timeout: 5000 },
    )
    await expect(page.locator('[data-focus-id="macos-nav-settings"]')).toHaveAttribute(
      'data-focused',
      'false',
    )
  })

  test('controller arrows move focus across library filters and grid', async ({
    page,
  }) => {
    await page.locator('[data-focus-id="macos-nav-library"]').click()
    await page.locator('[data-focus-id="library-sort-alphabetical"]').hover()
    await page.keyboard.press('ArrowDown')
    const focused = await page
      .locator('[data-focused="true"]')
      .getAttribute('data-focus-id')
    expect(focused).not.toBe('library-sort-alphabetical')
  })

  test('Escape from details restores focus to the library card', async ({ page }) => {
    await openCyberpunkDetails(page)
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-screen="library"]')).toBeVisible()
    await expect(
      page.locator('[data-focus-id="library-game-mock-cyberpunk"]'),
    ).toHaveAttribute('data-focused', 'true')
  })

  test('edit properties can fetch metadata', async ({ page }) => {
    await openCyberpunkDetails(page)
    await page.locator('[data-focus-id="details-edit"]').click()
    await expect(page.locator('[data-screen="game-edit"]')).toBeVisible()
    await page.locator('[data-focus-id="edit-enrich"]').click()
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: /Updated|TheGamesDB|SteamGridDB|enriched/i }),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('edit properties can browse artwork sources and randomize from SteamGridDB', async ({
    page,
  }) => {
    await openCyberpunkDetails(page)
    await page.locator('[data-focus-id="details-edit"]').click()
    await page.locator('[data-focus-id="artwork-web-cover"]').click()
    const dialog = page.getByRole('dialog', { name: 'Choose cover artwork' })
    await expect(dialog.getByText('4 images available')).toBeVisible()
    await dialog.getByRole('button', { name: /^TheGamesDB \(1\)$/ }).click()
    await expect(dialog.getByText('1 images available')).toBeVisible()
    await dialog.getByRole('button', { name: /— TheGamesDB$/ }).click()
    await expect(dialog).toBeHidden()

    await page.locator('[data-focus-id="artwork-random-hero"]').click()
    await expect(page.locator('[data-focus-id="artwork-random-hero"]')).toHaveText(
      'Random SteamGridDB',
    )
    await expect(page.getByRole('alert')).toHaveCount(0)
  })
})
