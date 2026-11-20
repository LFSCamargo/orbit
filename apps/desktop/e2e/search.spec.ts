import { expect, test } from './fixtures'

test('Search finds titles without accents, whatever the Library platform filter', async ({
  page,
}) => {
  // Regression: "Brutal Legend" found nothing ("Brütal Legend"), and Search
  // inherited the Library page's platform filter, hiding cloud titles.
  await page.goto('/')
  await page.locator('[data-focus-id="macos-nav-library"]').click()
  await page.getByLabel('Filter platform').click()
  await page.getByRole('option', { name: 'macOS', exact: true }).click()

  await page.locator('[data-focus-id="macos-nav-search"]').click()
  await page.getByPlaceholder('Search games…').fill('pokemon cafe')
  await expect(page.getByRole('heading', { name: 'Pokémon Café Mix' })).toBeVisible()
})
