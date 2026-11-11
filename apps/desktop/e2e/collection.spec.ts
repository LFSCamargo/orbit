import { expect, test } from '@playwright/test'

test('browses imported and connected games before typing and finds both by title', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  const search = page.getByPlaceholder('Find a game…')
  await expect(search).toHaveValue('')
  await expect(page.locator('[data-focus-id="search-game-mock-cyberpunk"]')).toBeVisible()
  await expect(page.getByText('Sample GOG game')).toBeVisible()
  await search.fill('GOG')
  await expect(page.getByText('Sample GOG game')).toBeVisible()
  await expect(page.locator('[data-focus-id="search-game-mock-cyberpunk"]')).toHaveCount(
    0,
  )
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Connected', exact: true }).click()
  await expect(page.getByText('Sample GOG game')).toBeVisible()
  await page.getByRole('button', { name: 'Manage Sample GOG game in GameHub' }).click()
  await expect(page.getByRole('status')).toContainText('GameHub opened')
})

test('hands a cached Steam title to the native install check', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Connected', exact: true }).click()
  await page
    .getByRole('button', { name: 'Check Mac install for Portal in Steam', exact: true })
    .click()
  await expect(page.getByRole('status')).toHaveText('Preview · Steam install requested.')
})
