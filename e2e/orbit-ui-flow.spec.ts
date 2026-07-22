import { expect, test, type Page } from '@playwright/test'

async function bootOrbit(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('orbit.themeId', 'orbit')
  })
  await page.goto('/')
  await expect(page.locator('[data-screen="home"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.orbit-home')).toBeVisible()
}

test.describe('Orbit home experience', () => {
  test.beforeEach(async ({ page }) => {
    await bootOrbit(page)
  })

  test('renders hero with a dark scrim over landscape art', async ({ page }) => {
    const scrim = page.locator('.orbit-hero-scrim')
    await expect(scrim).toBeVisible()

    const background = await scrim.evaluate((el) => {
      const style = getComputedStyle(el)
      return `${style.backgroundImage} ${style.background}`
    })
    expect(background).toMatch(/gradient|rgba?\(\s*0,\s*0,\s*0/)
  })

  test('shows a frosted activity dashboard inside the hero', async ({ page }) => {
    const panel = page.locator('.orbit-dashboard-glass')
    await expect(panel).toBeVisible()
    await expect(panel).toHaveClass(/native-glass-backdrop/)
    await expect(panel.locator('.native-glass-blur')).toHaveCount(0)
    await expect(panel.locator('.native-glass-tint')).toBeVisible()
    await expect(page.locator('.orbit-dashboard-cell')).toHaveCount(3)

    const backdrop = await panel.evaluate((el) => getComputedStyle(el).backdropFilter)
    expect(backdrop).toContain('blur')
  })

  test('keeps recent game order stable while updating the hero', async ({ page }) => {
    const cards = page.locator('.orbit-game-card')
    const firstIdBefore = await cards.first().getAttribute('data-focus-id')

    await page.locator('[data-focus-id="orbit-recent-mock-re4"]').click()
    await expect(page.locator('.orbit-hero-title')).toHaveText('Resident Evil 4')

    const firstIdAfter = await cards.first().getAttribute('data-focus-id')
    expect(firstIdAfter).toBe(firstIdBefore)

    await expect(page.locator('[data-focus-id="orbit-recent-mock-re4"]')).toHaveClass(
      /orbit-game-card-selected/,
    )
    await expect(page.getByText(/Last two weeks ·/)).toBeVisible()
  })

  test('shows controller focus ring on recent game cards', async ({ page }) => {
    const card = page.locator('[data-focus-id="orbit-recent-mock-re4"]')
    await card.hover()
    await expect(card).toHaveAttribute('data-focused', 'true')

    const ring = await card.evaluate((el) => getComputedStyle(el).boxShadow)
    expect(ring).not.toBe('none')
    expect(ring.length).toBeGreaterThan(8)

    // No Tailwind ring-offset yellow underline artifact.
    const offset = await card.evaluate((el) => getComputedStyle(el).getPropertyValue('--tw-ring-offset-width'))
    expect(offset.trim() === '' || offset === '0px').toBe(true)
  })

  test('scales the selected recent game card', async ({ page }) => {
    await page.locator('[data-focus-id="orbit-recent-mock-cyberpunk"]').click()
    const selected = page.locator('.orbit-game-card-selected')
    await expect(selected).toHaveCount(1)

    const scale = await selected.evaluate((el) => getComputedStyle(el).transform)
    expect(scale).toContain('matrix')
    expect(scale).not.toBe('none')
  })

  test('nav focus does not shift the navbar horizontally', async ({ page }) => {
    const nav = page.locator('.nav-surface')
    const leftBefore = await nav.evaluate((el) => el.getBoundingClientRect().left)

    await page.locator('[data-focus-id="nav-library"]').hover()
    await expect(page.locator('[data-focus-id="nav-library"]')).toHaveAttribute(
      'data-focused',
      'true',
    )

    const leftAfter = await nav.evaluate((el) => el.getBoundingClientRect().left)
    expect(Math.abs(leftAfter - leftBefore)).toBeLessThan(2)

    const ring = await page
      .locator('[data-focus-id="nav-library"]')
      .evaluate((el) => getComputedStyle(el).boxShadow)
    expect(ring).not.toBe('none')
  })

  test('does not duplicate the Menu controller hint label', async ({ page }) => {
    const hints = page.locator('.nav-hints')
    await expect(hints).toBeVisible()
    await expect(hints).toContainText('Menu')
    await expect(hints).not.toContainText('Menu Menu')
  })

  test('hero art swaps instantly without background-image transition', async ({ page }) => {
    const art = page.locator('.orbit-hero-art')
    await expect(art).toBeVisible()

    const transition = await art.evaluate((el) => getComputedStyle(el).transitionProperty)
    expect(transition).not.toContain('background-image')

    await page.locator('[data-focus-id="orbit-recent-mock-re4"]').click()
    await expect(page.locator('.orbit-hero-title')).toHaveText('Resident Evil 4')
    await page.locator('[data-focus-id="orbit-recent-mock-cyberpunk"]').click()
    await expect(page.locator('.orbit-hero-title')).toHaveText('Cyberpunk 2077')
  })

  test('hero art layer is contained within the rounded frame', async ({ page }) => {
    const overflow = await page
      .locator('.orbit-hero-frame-inner')
      .evaluate((el) => getComputedStyle(el).overflow)
    expect(overflow).toMatch(/hidden|clip/)

    await expect(page.locator('.orbit-hero-art')).toBeAttached()
  })

  test('play and options stay clickable after changing the hero', async ({ page }) => {
    await page.locator('[data-focus-id="orbit-recent-mock-re4"]').click()
    await expect(page.locator('.orbit-hero-title')).toHaveText('Resident Evil 4')

    await expect(page.locator('[data-focus-id="orbit-play"]')).toBeVisible()
    await page.locator('[data-focus-id="orbit-more"]').click()
    await expect(page.locator('[data-screen="game-details"]')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Resident Evil 4' })).toBeVisible()
  })
})

async function expectWhiteFocusRing(page: Page, focusId: string) {
  const target = page.locator(`[data-focus-id="${focusId}"]`)
  await target.hover()
  await expect(target).toHaveAttribute('data-focused', 'true')

  const ring = await target.evaluate((el) => {
    const read = (node: Element) => getComputedStyle(node).boxShadow
    const candidates = [read(el)]
    const inner = el.querySelector(':scope > div')
    if (inner) candidates.push(read(inner))
    return candidates.find((shadow) => /255,\s*255,\s*255|rgb\(255 255 255|#fff/i.test(shadow)) ?? read(el)
  })
  expect(ring).toMatch(/255,\s*255,\s*255|rgb\(255 255 255|#fff/i)
}

async function expectNavHairline(page: Page) {
  const shadow = await page
    .locator('.nav-surface')
    .evaluate((el) => getComputedStyle(el).boxShadow)
  expect(shadow).toMatch(/255,\s*255,\s*255|rgb\(255 255 255/)
}

test.describe('Orbit shell navigation', () => {
  test.beforeEach(async ({ page }) => {
    await bootOrbit(page)
  })

  test('active nav tab stays distinct from hovered focus ring', async ({ page }) => {
    await page.locator('[data-focus-id="nav-settings"]').click()
    await expect(page.locator('[data-screen="settings"]')).toBeVisible()

    const settingsNav = page.locator('[data-focus-id="nav-settings"]')
    await expect(settingsNav).toHaveAttribute('data-focused', 'true')
    await expect(settingsNav).toHaveClass(/bg-white\/15/)

    await page.locator('[data-focus-id="nav-library"]').hover()
    await expect(page.locator('[data-focus-id="nav-library"]')).toHaveAttribute(
      'data-focused',
      'true',
    )
    // Active route styling remains on Settings even while Library is focused.
    await expect(settingsNav).toHaveClass(/bg-white\/15/)
    await expect(page.locator('[data-focus-id="nav-library"]')).not.toHaveClass(/bg-white\/15/)
  })

  test('navigates library and opens game details', async ({ page }) => {
    await page.locator('[data-focus-id="nav-library"]').click()
    await expect(page.locator('[data-screen="library"]')).toBeVisible()

    const card = page.locator('[data-focus-id="library-game-mock-cyberpunk"]')
    await card.hover()
    await expect(card).toHaveAttribute('data-focused', 'true')

    const ring = await card.locator(':scope > div').evaluate((el) => getComputedStyle(el).boxShadow)
    expect(ring).not.toBe('none')

    await card.click()
    await expect(page.locator('[data-screen="game-details"]')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Cyberpunk 2077' })).toBeVisible()

    await page.locator('[data-focus-id="details-back"]').click()
    await expect(page.locator('[data-screen="library"]')).toBeVisible()
  })

  test('library header aligns with the navigation shell padding', async ({ page }) => {
    await page.locator('[data-focus-id="nav-library"]').click()
    await expect(page.locator('[data-screen="library"]')).toBeVisible()

    const navLeft = await page
      .locator('.nav-surface')
      .evaluate((el) => el.getBoundingClientRect().left)
    const titleLeft = await page
      .locator('[data-screen="library"] h1')
      .first()
      .evaluate((el) => el.getBoundingClientRect().left)

    expect(Math.abs(titleLeft - navLeft)).toBeLessThan(2)
  })

  test('search finds games and back returns to search', async ({ page }) => {
    await page.locator('[data-focus-id="nav-search"]').click()
    await expect(page.locator('[data-screen="search"]')).toBeVisible()

    await page.getByPlaceholder('Find a game…').fill('Resident')
    await page.locator('[data-focus-id="search-game-mock-re4"]').click()
    await expect(page.locator('[data-screen="game-details"]')).toBeVisible()

    await page.locator('[data-focus-id="details-back"]').click()
    await expect(page.locator('[data-screen="search"]')).toBeVisible()
  })

  test('settings screen stays interactive and includes imports', async ({ page }) => {
    await page.locator('[data-focus-id="nav-settings"]').click()
    await expect(page.locator('[data-screen="settings"]')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(page.locator('[data-focus-id="settings-theme-orbit"]')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Import games' })).toBeVisible()
    await expect(page.locator('[data-focus-id="imports-add"]')).toBeVisible()
    await expect(page.locator('[data-focus-id="import-steam"]')).toBeVisible()
  })

  test('non-home routes use orbit-route padding aligned with home shell', async ({ page }) => {
    await page.locator('[data-focus-id="nav-library"]').click()
    const route = page.locator('[data-screen="library"] .orbit-route')
    await expect(route).toBeVisible()

    const paddingTop = await route.evaluate((el) => parseFloat(getComputedStyle(el).paddingTop))
    const paddingX = await route.evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft))
    expect(paddingTop).toBeGreaterThanOrEqual(8)
    expect(paddingX).toBeGreaterThanOrEqual(40)
  })

  test('navbar hairline border matches the hints bar treatment', async ({ page }) => {
    await expectNavHairline(page)

    const hintsShadow = await page
      .locator('.nav-hints')
      .evaluate((el) => getComputedStyle(el).boxShadow)
    expect(hintsShadow).toMatch(/255,\s*255,\s*255|rgb\(255 255 255/)
  })

  test('controller section keys cycle every shell route', async ({ page }) => {
    const screens = ['library', 'search', 'settings', 'home'] as const

    for (const screen of screens) {
      await page.keyboard.press('BracketRight')
      await expect(page.locator(`[data-screen="${screen}"]`)).toBeVisible({ timeout: 10_000 })
      await page.waitForTimeout(400)
    }
  })

  test('section keys focus page content instead of leaving a stale nav ring', async ({ page }) => {
    await page.keyboard.press('BracketRight')
    await expect(page.locator('[data-screen="library"]')).toBeVisible()
    await expect(page.locator('[data-focus-id="library-sort-alphabetical"]')).toHaveAttribute(
      'data-focused',
      'true',
      { timeout: 5000 },
    )
    await expect(page.locator('[data-focus-id="nav-home"]')).toHaveAttribute('data-focused', 'false')

    for (let i = 0; i < 2; i += 1) {
      await page.keyboard.press('BracketRight')
    }

    await expect(page.locator('[data-screen="settings"]')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('[data-focus-id="settings-fullscreen"]')).toHaveAttribute(
      'data-focused',
      'true',
      { timeout: 5000 },
    )
    await expect(page.locator('[data-focus-id="nav-home"]')).toHaveAttribute('data-focused', 'false')
    await expect(page.locator('[data-focus-id="nav-settings"]')).toHaveAttribute(
      'data-focused',
      'false',
    )
  })

  test('controller arrows move focus across library filters and grid', async ({ page }) => {
    await page.locator('[data-focus-id="nav-library"]').click()
    await expect(page.locator('[data-screen="library"]')).toBeVisible()

    await expectWhiteFocusRing(page, 'library-sort-alphabetical')

    const before = await page.locator('[data-focused="true"]').getAttribute('data-focus-id')
    await page.keyboard.press('ArrowDown')
    const after = await page.locator('[data-focused="true"]').getAttribute('data-focus-id')
    expect(after).not.toBe(before)
  })

  test('settings focusables expose white controller rings', async ({ page }) => {
    await page.locator('[data-focus-id="nav-settings"]').click()
    await expectWhiteFocusRing(page, 'settings-theme-orbit')
    await expectWhiteFocusRing(page, 'import-steam')
    await expectWhiteFocusRing(page, 'imports-add')
  })

  test('game details actions stay reachable with controller back navigation', async ({ page }) => {
    await page.locator('[data-focus-id="nav-library"]').click()
    await page.locator('[data-focus-id="library-game-mock-cyberpunk"]').click()
    await expect(page.locator('[data-screen="game-details"]')).toBeVisible()
    await expect(page.locator('.orbit-route')).toBeVisible()

    await expectWhiteFocusRing(page, 'details-back')
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-screen="library"]')).toBeVisible()
    await expect(page.locator('[data-focus-id="library-game-mock-cyberpunk"]')).toHaveAttribute(
      'data-focused',
      'true',
    )
  })
})
