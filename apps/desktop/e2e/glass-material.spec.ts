import { expect, test } from '@playwright/test'

test('translucent panels and controls share Liquid Glass without SVG refraction', async ({
  page,
}) => {
  await page.goto('/')
  const navigation = page.locator('.macos-navigation')
  await expect(navigation).toHaveAttribute('data-glass-mode', 'simple')
  const filter = await navigation.evaluate((el) => getComputedStyle(el).backdropFilter)
  expect(filter).toMatch(/blur\(12px\)/)
  expect(filter).not.toContain('url(')
  await expect(page.locator('.orbit-glass svg filter, .orbit-glass canvas')).toHaveCount(
    0,
  )
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  const cards = page.locator('.orbit-panel')
  await expect(cards.first()).toBeVisible()
  for (const card of await cards.all()) {
    expect(await card.evaluate((el) => getComputedStyle(el).backdropFilter)).toContain(
      'blur(8px)',
    )
  }
  await expect(page.locator('[data-focus-id="library-steam-library"]')).toHaveClass(
    /orbit-glass-control/,
  )
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByPlaceholder('Find a game…')).toHaveClass(/orbit-glass-control/)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.locator('.settings-content')).toHaveAttribute(
    'data-glass-surface',
    'panel',
  )
  await expect(page.locator('.settings-content svg filter')).toHaveCount(0)
})

test('high contrast uses an opaque readable surface', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' })
  await page.goto('/')
  await expect(page.locator('.macos-navigation')).toHaveAttribute(
    'data-glass-mode',
    'opaque',
  )
  expect(
    await page
      .locator('.macos-navigation')
      .evaluate((el) => getComputedStyle(el).backdropFilter),
  ).toBe('none')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await expect(page.locator('[data-screen="library"]')).toBeVisible()
})

test('a panel click keeps its focus when a pending section transition completes', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.locator('[data-focus-id="settings-tab-themes"]').click()
  await page.keyboard.press('BracketLeft')
  await expect(page.locator('[data-screen="search"]')).toBeVisible()
  await page.keyboard.press('BracketRight')
  const card = page.locator('[data-focus-id="settings-theme-god-of-war"]')
  await card.click()
  await page.waitForTimeout(450)
  await expect(card).toHaveAttribute('data-focused', 'true')
})

test('session controls and quick menu use the same Liquid Glass surface', async ({
  page,
}) => {
  await page.goto('/')
  await page.locator('[data-focus-id="macos-play"]').click()
  await expect(page.locator('.session-actions')).toHaveClass(/orbit-glass/)
  await page.locator('[data-focus-id="playing-menu"]').click()
  await expect(page.getByRole('dialog', { name: 'Orbit menu' })).toHaveClass(
    /orbit-glass/,
  )
})
