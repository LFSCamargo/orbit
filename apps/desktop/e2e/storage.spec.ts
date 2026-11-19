import { expect, test } from './fixtures'

test('Storage settings show usage, filter items and confirm an uninstall', async ({
  page,
}) => {
  await page.goto('/')
  await page.locator('[data-focus-id="macos-nav-settings"]').click()
  await page.locator('[data-focus-id="settings-tab-storage"]').click()
  await expect(page.getByRole('heading', { name: 'Storage', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Storage overview' })).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Largest installs' }).getByText('Counter-Strike 2'),
  ).toBeVisible()
  await expect(page.getByTestId('storage-row')).toHaveCount(4)
  await page.getByRole('tab', { name: 'Runtimes (1)' }).click()
  await expect(page.getByTestId('storage-row')).toHaveCount(1)
  await page.getByRole('tab', { name: /All items/ }).click()
  await page.getByLabel('Search installed items').fill('counter')
  await expect(page.getByTestId('storage-row')).toHaveCount(1)
  await page.getByRole('button', { name: 'Uninstall Counter-Strike 2' }).click()
  await expect(
    page.getByRole('heading', { name: 'Uninstall Counter-Strike 2?' }),
  ).toBeVisible()
  await expect(page.getByRole('switch', { name: /Also delete saves/ })).toHaveAttribute(
    'aria-checked',
    'false',
  )
  await page.keyboard.press('Escape')
  await expect(
    page.getByRole('heading', { name: 'Uninstall Counter-Strike 2?' }),
  ).toBeHidden()
  await expect(page.locator('[data-screen="settings"]')).toBeVisible()
})

test('game details measure disk usage from the real game folder', async ({ page }) => {
  await page.goto('/')
  await page.locator('[data-focus-id="macos-nav-library"]').click()
  await page.locator('[data-focus-id="library-game-steam:1091500"]').click()
  await expect(page.locator('#details-title')).toHaveText('Cyberpunk 2077')
  const stats = page.locator('.details-stats')
  await expect(stats.getByText('Disk usage')).toBeVisible()
  await expect(stats.getByText('60 GB')).toBeVisible()
  const folder = page.locator('.details-library-facts').getByText('Game folder')
  await expect(folder).toBeVisible()
})
