import { expect, test } from '@playwright/test'

test('library navigation uses Installed, All games, and Favorites', async ({ page }) => {
  await page.goto('/')
  await page.locator('[data-focus-id="macos-nav-library"]').click()
  const tabs = page.getByRole('group', { name: 'Library view', exact: true })
  await expect(tabs).toHaveCSS('border-radius', '999px')
  await expect(tabs.getByRole('button', { name: 'Installed' })).toBeVisible()
  await expect(page.locator('[data-focus-id="library-game-steam:1091500"]')).toBeVisible()
  await tabs.getByRole('button', { name: 'All games' }).click()
  await expect(page.locator('[data-focus-id="library-game-steam:1091500"]')).toBeVisible()
  await tabs.getByRole('button', { name: 'Favorites' }).click()
  await expect(page.locator('[data-focus-id="library-game-steam:1091500"]')).toBeVisible()
})

test('home shelf hides scrollbar chrome without disabling scrolling', async ({
  page,
}) => {
  await page.goto('/')
  const shelf = page.locator('.macos-game-grid')
  await expect(shelf).toBeVisible()
  expect(await shelf.evaluate((el) => getComputedStyle(el).scrollbarWidth)).toBe('none')
  expect(await shelf.evaluate((el) => getComputedStyle(el).overflowX)).toBe('auto')
})

test('game details expose launch settings directly', async ({ page }) => {
  await page.goto('/')
  await page.locator('[data-focus-id="macos-nav-library"]').click()
  await page.locator('[data-focus-id="library-game-steam:1091500"]').click()
  const detailsTabs = page.getByRole('tablist', { name: 'Game details' })
  await expect(detailsTabs).toHaveCSS('border-radius', '999px')
  await expect(detailsTabs.getByRole('tab', { name: 'Overview' })).toHaveCSS(
    'border-radius',
    '999px',
  )
  await page.getByRole('tab', { name: 'Settings', exact: true }).click()
  await page.getByRole('tab', { name: 'Launch & Compatibility', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Launch settings', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Save settings', exact: true }),
  ).toBeDisabled()
  const actions = page
    .locator('.orbit-editor-actions')
    .filter({ has: page.getByRole('button', { name: 'Save settings', exact: true }) })
  await expect(actions).toHaveCSS('position', 'static')
  await expect(actions).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await page.getByRole('tab', { name: 'Overview', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'About this game' })).toBeVisible()
})

test('properties keeps metadata drafts while switching to bounded artwork previews', async ({
  page,
}) => {
  await page.goto('/')
  await page.locator('[data-focus-id="macos-nav-library"]').click()
  await page.locator('[data-focus-id="library-game-steam:1091500"]').click()
  await page.locator('[data-focus-id="details-edit"]').click()
  await expect(page.getByRole('tablist', { name: 'Properties' })).toHaveCSS(
    'border-radius',
    '999px',
  )
  await page.getByLabel('Game title', { exact: true }).fill('My draft title')
  await page.getByRole('tab', { name: 'Artwork', exact: true }).click()
  const preview = page
    .locator('[aria-label="Artwork"] [style*="background-image"]')
    .first()
  await expect(preview).toBeVisible()
  expect(Math.round((await preview.boundingBox())!.height)).toBeLessThanOrEqual(280)
  await page.getByRole('tab', { name: 'General', exact: true }).click()
  await expect(page.getByLabel('Game title', { exact: true })).toHaveValue(
    'My draft title',
  )
})

test('adding an existing Steam library folder starts discovery and reports its result', async ({
  page,
}) => {
  await page.goto('/')
  await page.locator('[data-focus-id="macos-nav-settings"]').click()
  await page.locator('[data-focus-id="settings-tab-library"]').click()
  await page.getByLabel('Additional Steam library folder').fill('/Users/player/GameHub')
  await page.getByRole('button', { name: 'Add library folder', exact: true }).click()
  await expect(page.getByText('/Users/player/GameHub', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('status').filter({ hasText: 'Library scan complete' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Scan installed games', exact: true }),
  ).toBeEnabled()
})
