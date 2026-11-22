import { expect, test } from './fixtures'

test('Microsoft Store PC catalog titles appear in All games and open Install flow after sign-in', async ({
  page,
}) => {
  await page.goto('/')

  // Sign in to Microsoft Store PC Installs under Settings → General.
  await page.locator('[data-focus-id="macos-nav-settings"]').click()
  const msStoreRow = page.getByTestId('msstore-settings-row')
  await expect(msStoreRow).toBeVisible()
  await page.locator('[data-focus-id="settings-msstore-sign-in"]').click()
  await expect(msStoreRow.getByText(/Signed in as player@outlook\.com/)).toBeVisible()

  // Navigate to Library → All games and verify the Microsoft Store · PC section.
  await page.locator('[data-focus-id="macos-nav-library"]').click()
  await page.locator('[data-focus-id="library-view-all"]').click()

  const msSection = page.getByRole('region', { name: 'Microsoft Store · PC' })
  await expect(msSection).toBeVisible()
  await msSection.getByRole('heading', { name: 'Pentiment' }).click()

  // Details page offers Install and opens Orbit's Install Location picker.
  const primary = page.locator('[data-focus-id="details-play"]')
  await expect(primary).toHaveText(/Install/)
  await primary.click()

  const picker = page.getByRole('dialog', { name: 'Install Pentiment' })
  await expect(picker).toBeVisible()
  await picker.getByRole('button', { name: 'Install' }).click()
  await expect(picker).toBeHidden()
})
