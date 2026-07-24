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

  test('keeps light hero copy even on bright artwork', async ({ page }) => {
    await page.locator('[data-focus-id="ps5-tile-mock-requiem"]').click()
    await expect(
      page.getByRole('heading', { name: 'Resident Evil Requiem' }),
    ).toBeVisible()

    const title = page.locator('.ps5-hero-title')
    await expect(title).toHaveCSS('color', 'rgb(255, 255, 255)')

    const description = page.locator('.ps5-hero-description')
    await expect(description).toHaveCSS('color', 'rgba(255, 255, 255, 0.7)')

    const cardLabel = page.locator('.ps5-hero-card-label').first()
    await expect(cardLabel).toHaveCSS('color', 'rgba(255, 255, 255, 0.55)')
  })

  test('keeps white hero copy on dark artwork', async ({ page }) => {
    await page.locator('[data-focus-id="ps5-tile-mock-cyberpunk"]').click()
    await expect(page.getByRole('heading', { name: 'Cyberpunk 2077' })).toBeVisible()

    const title = page.locator('.ps5-hero-title')
    await expect(title).toHaveCSS('color', 'rgb(255, 255, 255)')
  })

  test('places selected game title under the next tile', async ({ page }) => {
    const selected = page.locator(
      '[data-focus-id^="ps5-tile-"][data-ps5-tile="selected"]',
    )
    await expect(selected).toBeVisible()
    await page.waitForTimeout(350)

    const title = page.locator('.ps5-tile-title')
    await expect(title).toBeVisible()

    const geometry = await page.evaluate(() => {
      const selectedEl = document.querySelector(
        '[data-focus-id^="ps5-tile-"][data-ps5-tile="selected"]',
      ) as HTMLElement | null
      const titleEl = document.querySelector('.ps5-tile-title') as HTMLElement | null
      if (!selectedEl || !titleEl) return null

      const tiles = [
        ...document.querySelectorAll('[data-focus-id^="ps5-tile-"]'),
      ] as HTMLElement[]
      const index = tiles.indexOf(selectedEl)
      const nextEl = tiles[index + 1]
      if (!nextEl) return null

      const selectedRect = selectedEl.getBoundingClientRect()
      const nextArt =
        (nextEl.querySelector('.ps5-tile-art') as HTMLElement | null) ?? nextEl
      const nextRect = nextArt.getBoundingClientRect()
      const titleRect = titleEl.getBoundingClientRect()

      return {
        titleLeft: titleRect.left,
        nextLeft: nextRect.left,
        titleTop: titleRect.top,
        nextBottom: nextRect.bottom,
        selectedRight: selectedRect.right,
        selectedBottom: selectedRect.bottom,
      }
    })

    expect(geometry).not.toBeNull()
    // Under the next tile: to the right of the selected cover, aligned with next art.
    expect(geometry!.titleLeft).toBeGreaterThan(geometry!.selectedRight - 8)
    expect(Math.abs(geometry!.titleLeft - geometry!.nextLeft)).toBeLessThan(8)
    expect(Math.abs(geometry!.titleTop - geometry!.nextBottom)).toBeLessThan(16)
    expect(geometry!.titleTop).toBeLessThan(geometry!.selectedBottom)
  })

  test('places last-tile title on the left edge of the selected cover', async ({
    page,
  }) => {
    const tiles = page.locator('[data-focus-id^="ps5-tile-"]')
    const count = await tiles.count()
    expect(count).toBeGreaterThan(1)

    await tiles.nth(count - 1).click()
    await expect(page.locator('.ps5-game-row')).toHaveAttribute(
      'data-ps5-title-mode',
      'last',
    )
    await expect(page.locator('.ps5-tile-title-last')).toBeVisible()

    await page.waitForTimeout(350)

    const geometry = await page.evaluate(() => {
      const selectedEl = document.querySelector(
        '[data-focus-id^="ps5-tile-"][data-ps5-tile="selected"]',
      ) as HTMLElement | null
      const titleEl = document.querySelector('.ps5-tile-title') as HTMLElement | null
      if (!selectedEl || !titleEl) return null

      const art = selectedEl.querySelector('.ps5-tile-art') as HTMLElement | null
      const artRect = (art ?? selectedEl).getBoundingClientRect()
      const titleRect = titleEl.getBoundingClientRect()

      return {
        titleLeft: titleRect.left,
        artLeft: artRect.left,
        artRight: artRect.right,
      }
    })

    expect(geometry).not.toBeNull()
    // Last item: label aligns to the left side of the focused cover (not out in empty space).
    expect(Math.abs(geometry!.titleLeft - geometry!.artLeft)).toBeLessThan(6)
    expect(geometry!.titleLeft).toBeLessThan(geometry!.artRight - 40)
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
