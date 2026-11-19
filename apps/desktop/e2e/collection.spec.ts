import { expect, test } from './fixtures'

test('search covers installed and owned titles on one grid', async ({ page }) => {
  await page.goto('/')
  await page.locator('[data-focus-id="macos-nav-search"]').click()
  await expect(page.locator('[data-screen="search"]')).toBeVisible()
  const search = page.getByPlaceholder('Search games…')
  await expect(search).toHaveValue('')
  await expect(page.locator('[data-focus-id="search-game-steam:1091500"]')).toBeVisible()
  await search.fill('Zelda')
  await expect(page.getByRole('heading', { name: 'The Legend of Zelda' })).toBeVisible()
  await expect(page.locator('[data-focus-id="search-game-steam:1091500"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await expect(page.locator('[data-focus-id="library-game-steam:1091500"]')).toBeVisible()
})
