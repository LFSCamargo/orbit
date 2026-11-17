import { expect, test } from '@playwright/test'

for (const theme of ['liquid-glass', 'cyberpunk-2077']) {
  test(`${theme} session controls and quick menu`, async ({ page }) => {
    await page.addInitScript(
      (theme) => localStorage.setItem('orbit.themeId', theme),
      theme,
    )
    await page.goto('/')
    await page.locator('[data-focus-id="macos-play"]').click()
    await expect(page.locator('.session-stage')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Cyberpunk 2077' })).toBeVisible()
    await page.locator('[data-focus-id="playing-menu"]').click()
    const menu = page.getByRole('dialog', { name: 'Orbit menu' })
    await expect(menu).toBeVisible()
    await expect(menu.locator('.session-artwork')).toHaveCount(1)
    await expect(menu.locator('[data-focused="true"]')).toHaveCount(1)
    await menu.getByRole('button', { name: 'Close menu' }).focus()
    await page.keyboard.press('Shift+Tab')
    await expect(menu.getByRole('button', { name: /Quit Orbit/ })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(page.locator('.session-stage')).toBeVisible()
    await page.locator('[data-focus-id="playing-menu"]').click()
    await menu.locator('[data-focus-id="home-menu-stop"]').click()
    await expect(menu).toBeHidden()
    await expect(page.locator('.session-stage')).toBeHidden()
    await expect(page.locator('[data-screen="home"]')).toBeVisible()
  })
}

test('Steam library folders discover existing installs from Settings', async ({
  page,
}) => {
  await page.goto('/')
  await page.locator('[data-focus-id="macos-nav-settings"]').click()
  await page.locator('[data-focus-id="settings-tab-library"]').click()
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible()
  await page
    .getByLabel('Additional Steam library folder')
    .fill('/Users/player/SteamLibrary')
  await page.getByRole('button', { name: 'Add library folder', exact: true }).click()
  await expect(
    page.getByText('/Users/player/SteamLibrary', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('status').filter({ hasText: 'Library scan complete' }),
  ).toBeVisible()
})

test('Orbit wordmark stays at top left in compact Liquid Glass', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const logo = page.locator('.macos-brand .theme-brand[data-brand="orbit"]')
  await expect(logo).toBeVisible()
  const bounds = await logo.boundingBox()
  expect(bounds!.x).toBeLessThan(35)
  expect(bounds!.y).toBeLessThan(60)
})
