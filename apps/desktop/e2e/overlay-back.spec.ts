import { expect, test } from '@playwright/test'

test('back closes the downloads drawer without leaving the screen', async ({ page }) => {
  await page.goto('/')
  await page.locator('[data-focus-id="macos-nav-library"]').click()
  await expect(page.locator('[data-screen="library"]')).toBeVisible()
  await page.locator('[data-focus-id="macos-toolbar-downloads"]').click()
  const drawer = page.getByRole('dialog', { name: 'Downloads' })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText('Connect your Steam account')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(page.locator('[data-screen="library"]')).toBeVisible()
})

test('back closes a confirm dialog before the details screen', async ({ page }) => {
  await page.goto('/')
  await page.locator('[data-focus-id="macos-nav-library"]').click()
  await page.locator('[data-focus-id="library-game-steam:1091500"]').click()
  await expect(page.locator('#details-title')).toHaveText('Cyberpunk 2077')
  await page.locator('[data-focus-id="details-delete"]').click()
  const confirm = page.getByRole('heading', { name: /Remove Cyberpunk 2077/ })
  await expect(confirm).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(confirm).toBeHidden()
  await expect(page.locator('#details-title')).toHaveText('Cyberpunk 2077')
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-screen="library"]')).toBeVisible()
})
