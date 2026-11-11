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

test('GameHub manager filters cached stores and hands installations to GameHub honestly', async ({
  page,
}) => {
  await page.goto('/')
  await page.locator('[data-focus-id="macos-nav-library"]').click()
  await page.locator('[data-focus-id="library-gamehub-manager"]').click()
  await expect(
    page.getByRole('heading', { name: 'Local games & downloads', exact: true }),
  ).toBeVisible()
  await expect(page.getByText(/Browser preview · sample library/)).toBeVisible()
  await page.getByLabel('Store', { exact: true }).selectOption('gog')
  await expect(page.getByRole('heading', { name: 'Sample GOG game' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Portal 2' })).toHaveCount(0)
  await expect(
    page.getByRole('progressbar', { name: 'Sample GOG game download progress' }),
  ).toHaveAttribute('value', '42')
  await page.getByPlaceholder('Search GameHub games…').fill('not present')
  await expect(page.getByRole('heading', { name: 'No matching records' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep running in background' }).click()
  await expect(
    page.getByRole('button', { name: 'Disable background mode' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Install / manage in GameHub' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'GameHub was opened' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Sync GameHub shortcuts' }).click()
  await expect(page.getByRole('status').filter({ hasText: /Synced/ })).toBeVisible()
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
