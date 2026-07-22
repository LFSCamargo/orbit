import { expect, test, type Page } from '@playwright/test'

async function bootWithTheme(page: Page, themeId: 'ps5' | 'switch-2' | 'orbit') {
  await page.addInitScript((theme) => {
    localStorage.setItem('orbit.themeId', theme)
  }, themeId)
  await page.goto('/')
  await expect(page.locator('[data-screen="home"]')).toBeVisible({ timeout: 15_000 })
}

test.describe('PS5 hero contrast', () => {
  test.beforeEach(async ({ page }) => {
    await bootWithTheme(page, 'ps5')
  })

  test('reverses hero-zone text on light artwork', async ({ page }) => {
    await page.locator('[data-focus-id="ps5-tile-mock-requiem"]').click()
    await expect(page.getByRole('heading', { name: 'Resident Evil Requiem' })).toBeVisible()
    await expect(page.locator('.ps5-home')).toHaveAttribute('data-hero-tone', 'light', {
      timeout: 10_000,
    })

    const title = page.locator('.ps5-hero-title')
    await expect(title).toHaveCSS('color', 'rgb(10, 22, 40)')

    const description = page.locator('.ps5-hero-description')
    await expect(description).toHaveCSS('color', 'rgba(10, 22, 40, 0.72)')

    const cardLabel = page.locator('.ps5-hero-card-label').first()
    await expect(cardLabel).toHaveCSS('color', 'rgba(255, 255, 255, 0.55)')
  })

  test('keeps white hero copy on dark artwork', async ({ page }) => {
    await page.locator('[data-focus-id="ps5-tile-mock-cyberpunk"]').click()
    await expect(page.getByRole('heading', { name: 'Cyberpunk 2077' })).toBeVisible()

    const title = page.locator('.ps5-hero-title')
    await expect(title).toHaveCSS('color', 'rgb(255, 255, 255)')
  })
})

test.describe('PS5 shell UI flow', () => {
  test.beforeEach(async ({ page }) => {
    await bootWithTheme(page, 'ps5')
  })

  test('navigates library → details → back to library', async ({ page }) => {
    await page.locator('[data-focus-id="ps5-nav-library"]').click()
    await expect(page.locator('[data-screen="library"]')).toBeVisible()

    await page.locator('[data-focus-id="library-game-mock-cyberpunk"]').click()
    await expect(page.locator('[data-screen="game-details"]')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator('[data-screen="library"]')).toBeVisible()
  })

  test('home more menu opens game details and back returns home', async ({ page }) => {
    await page.locator('[data-focus-id="ps5-more"]').click()
    await expect(page.locator('[data-screen="game-details"]')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator('[data-screen="home"]')).toBeVisible()
  })

  test('search finds games and opens details', async ({ page }) => {
    await page.locator('[data-focus-id="ps5-search"]').click()
    await expect(page.locator('[data-screen="search"]')).toBeVisible()

    await page.getByPlaceholder('Find a game…').fill('Resident')
    await expect(page.locator('[data-focus-id="search-game-mock-re4"]')).toBeVisible()

    await page.locator('[data-focus-id="search-game-mock-re4"]').click()
    await expect(page.locator('[data-screen="game-details"]')).toBeVisible()
  })

  test('delete dialog traps focus and cancels with Escape', async ({ page }) => {
    await page.locator('[data-focus-id="ps5-nav-library"]').click()
    await page.locator('[data-focus-id="library-game-mock-cyberpunk"]').click()
    await page.locator('[data-focus-id="details-delete"]').click()

    await expect(page.locator('[data-focus-id="confirm-cancel"]')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-focus-id="confirm-cancel"]')).toHaveCount(0)
  })
})

test.describe('Switch shell UI flow', () => {
  test.beforeEach(async ({ page }) => {
    await bootWithTheme(page, 'switch-2')
  })

  test('library back navigation restores the switch shell', async ({ page }) => {
    await page.locator('[data-focus-id="switch-nav-library"]').click()
    await expect(page.locator('[data-screen="library"]')).toBeVisible()

    await page.locator('[data-focus-id="library-game-mock-cyberpunk"]').click()
    await expect(page.locator('[data-screen="game-details"]')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator('[data-screen="library"]')).toBeVisible()
    await expect(page.locator('.switch-shell')).toBeVisible()
  })
})
