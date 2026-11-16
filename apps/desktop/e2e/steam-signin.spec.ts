import { expect, test } from '@playwright/test'

test('Steam sign-in stays in a modal host and closes cleanly at the minimum desktop size', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 640 })
  await page.goto('/')
  await page.locator('[data-focus-id="macos-nav-settings"]').click()
  await page.getByRole('button', { name: 'Steam', exact: true }).click()
  await page.getByRole('button', { name: 'Sign in with Steam' }).click()
  const dialog = page.getByRole('dialog', { name: 'Sign in to Steam' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('aria-busy', 'false')
  await expect(dialog.getByText(/Scan the QR/)).toBeVisible()
  const host = await dialog.getByTestId('steam-login-host').boundingBox()
  expect(host).not.toBeNull()
  expect(host!.x).toBeGreaterThanOrEqual(0)
  expect(host!.y).toBeGreaterThanOrEqual(0)
  expect(host!.x + host!.width).toBeLessThanOrEqual(1024)
  expect(host!.y + host!.height).toBeLessThanOrEqual(640)
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
})
