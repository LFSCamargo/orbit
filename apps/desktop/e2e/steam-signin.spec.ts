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
  await expect(dialog.getByText(/Steam’s own window/)).toBeVisible()
  const box = await dialog.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(1024)
  expect(box!.y + box!.height).toBeLessThanOrEqual(640)
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
})
