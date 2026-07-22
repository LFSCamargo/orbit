import { expect, test, type Page } from '@playwright/test'

async function bootSwitch(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('orbit.themeId', 'switch-2')
  })
  await page.goto('/')
  await expect(page.locator('[data-screen="home"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.switch-home')).toBeVisible()
}

async function bootPs5(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('orbit.themeId', 'ps5')
  })
  await page.goto('/')
  await expect(page.locator('[data-screen="home"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.ps5-home')).toBeVisible()
}

test.describe('Switch home experience', () => {
  test.beforeEach(async ({ page }) => {
    await bootSwitch(page)
  })

  test('shows landscape hero art behind the carousel', async ({ page }) => {
    const heroBg = page.locator('.switch-hero-bg')
    await expect(heroBg).toHaveAttribute('data-has-landscape', 'true')

    const styles = await heroBg.evaluate((el) => getComputedStyle(el).backgroundImage)
    expect(styles).toContain('url(')
  })

  test('hero title stays fully visible within the home viewport', async ({ page }) => {
    const title = page.locator('.switch-hero-title')
    const viewport = page.viewportSize()
    expect(viewport).not.toBeNull()
    if (!viewport) return

    const box = await title.boundingBox()
    expect(box).not.toBeNull()
    if (!box) return

    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
  })

  test('updates the hero title when selecting another tile', async ({ page }) => {
    await page.locator('[data-focus-id="switch-game-mock-cyberpunk"]').click()
    await expect(page.locator('.switch-hero-title')).toHaveText('Cyberpunk 2077')
  })

  test('uses native blur with a light frosted tint', async ({ page }) => {
    const panel = page.locator('.switch-glass-panel').first()

    await expect(panel.locator('.native-glass-blur')).toBeVisible()
    await expect(panel.locator('.native-glass-tint')).toBeVisible()
    await expect(panel.locator('.native-glass-sheen')).toBeVisible()

    const backdrop = await panel.evaluate((el) => getComputedStyle(el).backdropFilter)
    expect(backdrop).toBe('none')

    const filter = await panel
      .locator('.native-glass-blur')
      .evaluate((el) => getComputedStyle(el).filter)
    expect(filter).toContain('blur(18px)')
    expect(filter).toMatch(/saturate\(0\.58\)|saturate\(58%\)/)
    expect(filter).toContain('brightness(0.66)')

    const tint = await panel.locator('.native-glass-tint').evaluate((el) => {
      const style = getComputedStyle(el)
      return {
        backgroundImage: style.backgroundImage,
        backgroundColor: style.backgroundColor,
      }
    })
    expect(tint.backgroundImage).toContain('linear-gradient')
    expect(tint.backgroundImage).toMatch(/14,\s*18,\s*28|8,\s*10,\s*16/)

    await expect(page.locator('.switch-glass-card')).toHaveCount(3)
  })

  test('updates the frosted blur when selecting another tile', async ({ page }) => {
    await page.locator('[data-focus-id="switch-game-mock-cyberpunk"]').click()
    await expect(page.locator('.switch-hero-title')).toHaveText('Cyberpunk 2077')

    const blurImg = page.locator('.switch-glass-panel .native-glass-blur')
    await expect(blurImg).toBeVisible()

    const initialSrc = await blurImg.getAttribute('src')
    expect(initialSrc).toBeTruthy()

    await page.locator('[data-focus-id="switch-game-mock-zelda"]').click()
    await expect(page.locator('.switch-hero-title')).toHaveText('The Legend of Zelda')

    await expect
      .poll(async () => blurImg.getAttribute('src'))
      .not.toBe(initialSrc)
  })

  test('carousel tiles use a full cyan ring on focus without clipping', async ({ page }) => {
    const tile = page.locator('[data-focus-id="switch-game-mock-cyberpunk"]')
    await tile.hover()
    await expect(tile).toHaveAttribute('data-focused', 'true')

    const ring = await tile.evaluate((el) => getComputedStyle(el).boxShadow)
    expect(ring).not.toBe('none')
    expect(ring.length).toBeGreaterThan(8)

    const box = await tile.boundingBox()
    expect(box).not.toBeNull()
    if (!box) return

    const panel = page.locator('.switch-glass-panel')
    const panelBox = await panel.boundingBox()
    expect(panelBox).not.toBeNull()
    if (!panelBox) return

    expect(box.y + box.height).toBeLessThanOrEqual(panelBox.y + 2)
  })

  test('options focus does not shift the home layout horizontally', async ({ page }) => {
    const main = page.locator('.switch-main')
    const panel = page.locator('.switch-glass-panel')

    const scrollBefore = await main.evaluate((el) => el.scrollLeft)
    const panelLeftBefore = await panel.evaluate((el) => el.getBoundingClientRect().left)

    await page.locator('[data-focus-id="switch-home-options"]').hover()
    await expect(page.locator('[data-focus-id="switch-home-options"]')).toHaveAttribute(
      'data-focused',
      'true',
    )

    const ring = await page
      .locator('[data-focus-id="switch-home-options"]')
      .evaluate((el) => getComputedStyle(el).boxShadow)
    expect(ring).not.toBe('none')

    const clip = await page
      .locator('[data-focus-id="switch-home-options"]')
      .evaluate((el) => {
        const button = el.getBoundingClientRect()
        const panel = el.closest('.switch-glass-panel')?.getBoundingClientRect()
        if (!panel) return { ok: false }
        return {
          ok: button.right <= panel.right + 1 && button.left >= panel.left - 1,
        }
      })
    expect(clip.ok).toBe(true)

    const scrollAfter = await main.evaluate((el) => el.scrollLeft)
    const panelLeftAfter = await panel.evaluate((el) => el.getBoundingClientRect().left)

    expect(scrollAfter).toBe(scrollBefore)
    expect(Math.abs(panelLeftAfter - panelLeftBefore)).toBeLessThan(2)
  })

  test('uses frosted blur on light hero artwork too', async ({ page }) => {
    await page.locator('[data-focus-id="switch-game-mock-requiem"]').click()
    await expect(page.locator('.switch-hero-title')).toHaveText('Resident Evil Requiem')
    await expect(page.locator('.switch-home')).toHaveAttribute('data-hero-tone', 'light', {
      timeout: 10_000,
    })

    const panel = page.locator('.switch-glass-panel')
    await expect(panel.locator('.native-glass-blur')).toBeVisible()

    const titleColor = await page
      .locator('.switch-hero-title')
      .evaluate((el) => getComputedStyle(el).color)
    expect(titleColor).toBe('rgb(0, 212, 255)')

    const copyColor = await page
      .locator('.switch-glass-panel .switch-hero-copy')
      .first()
      .evaluate((el) => getComputedStyle(el).color)
    expect(copyColor).toBe('rgba(242, 242, 247, 0.88)')
  })

  test('options opens game details and back returns home', async ({ page }) => {
    await page.locator('[data-focus-id="switch-home-options"]').click()
    await expect(page.locator('[data-screen="game-details"]')).toBeVisible()

    await page.locator('[data-focus-id="details-back"]').click()
    await expect(page.locator('[data-screen="home"]')).toBeVisible()
    await expect(page.locator('.switch-home')).toBeVisible()
  })
})

test.describe('Switch shell navigation', () => {
  test.beforeEach(async ({ page }) => {
    await bootSwitch(page)
  })

  test('navigates all shell destinations and keeps switch chrome', async ({ page }) => {
    const destinations: Array<{ nav: string; screen: string; marker: string }> = [
      { nav: 'switch-nav-library', screen: 'library', marker: 'Library' },
      { nav: 'switch-nav-search', screen: 'search', marker: 'Search' },
      { nav: 'switch-nav-settings', screen: 'settings', marker: 'Settings' },
    ]

    for (const dest of destinations) {
      await page.locator(`[data-focus-id="${dest.nav}"]`).click()
      await expect(page.locator(`[data-screen="${dest.screen}"]`)).toBeVisible()
      await expect(page.getByRole('heading', { name: dest.marker })).toBeVisible()
      await expect(page.locator('.switch-shell')).toBeVisible()
      await expect(page.locator('.switch-footer')).toBeVisible()
    }

    await page.locator('[data-focus-id="switch-nav-home"]').click()
    await expect(page.locator('[data-screen="home"]')).toBeVisible()
    await expect(page.locator('.switch-home')).toBeVisible()
  })

  test('library back navigation restores focus shell', async ({ page }) => {
    await page.locator('[data-focus-id="switch-nav-library"]').click()
    await page.locator('[data-focus-id="library-game-mock-zelda"]').click()
    await expect(page.getByRole('heading', { name: 'The Legend of Zelda' })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator('[data-screen="library"]')).toBeVisible()
    await expect(page.locator('[data-focus-id="library-game-mock-zelda"]')).toHaveAttribute(
      'data-focused',
      'true',
    )
  })

  test('home nav stays highlighted on home screen', async ({ page }) => {
    await expect(page.locator('[data-focus-id="switch-nav-home"]')).toHaveClass(/border-\[var\(--switch-cyan\)\]/)
  })
})

test.describe('PS5 glass dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await bootPs5(page)
  })

  test('uses one shared frosted panel with hero blur for dark heroes', async ({ page }) => {
    const panel = page.locator('.ps5-dashboard-glass')
    await expect(panel.locator('.native-glass-blur')).toBeVisible()
    await expect(panel.locator('.native-glass-tint')).toBeVisible()
    await expect(panel.locator('.native-glass-sheen')).toBeVisible()
    await expect(page.locator('.ps5-dashboard-cell')).toHaveCount(3)

    const backdrop = await panel.evaluate((el) => getComputedStyle(el).backdropFilter)
    expect(backdrop).toBe('none')

    const filter = await panel
      .locator('.native-glass-blur')
      .evaluate((el) => getComputedStyle(el).filter)
    expect(filter).toContain('blur(18px)')

    const tint = await panel.locator('.native-glass-tint').evaluate((el) => getComputedStyle(el).backgroundImage)
    expect(tint).toContain('linear-gradient')
    expect(tint).toMatch(/10,\s*22,\s*40|18,\s*32,\s*56/)
  })

  test('uses frosted blur on light heroes too', async ({ page }) => {
    await page.locator('[data-focus-id="ps5-tile-mock-requiem"]').click()
    await expect(page.getByRole('heading', { name: 'Resident Evil Requiem' })).toBeVisible()

    const panel = page.locator('.ps5-dashboard-glass')
    await expect(panel.locator('.native-glass-blur')).toBeVisible()

    const titleColor = await page
      .locator('.ps5-hero-title')
      .evaluate((el) => getComputedStyle(el).color)
    expect(titleColor).toBe('rgb(10, 22, 40)')
  })
})
