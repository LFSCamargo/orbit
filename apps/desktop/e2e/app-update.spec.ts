import { expect, test } from './fixtures'

test('Settings → General shows Orbit updates and checks GitHub on request', async ({
  page,
}) => {
  await page.goto('/')
  await page.locator('[data-focus-id="macos-nav-settings"]').click()
  await expect(
    page.getByRole('switch', { name: 'Update Orbit automatically' }),
  ).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('heading', { name: 'Orbit updates' })).toBeVisible()
  await page.locator('[data-focus-id="settings-update-check"]').click()
  await expect(page.getByText(/Orbit is up to date/)).toBeVisible()
})
