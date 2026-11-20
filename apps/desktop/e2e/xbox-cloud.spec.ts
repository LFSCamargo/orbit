import { expect, test } from './fixtures'

test('Game Pass titles live in All games; Add or Play puts them in Installed', async ({
  page,
  context,
}) => {
  // Play never opens a web page or browser tab: it streams in Orbit's player.
  const tabs: string[] = []
  context.on('page', (tab) => tabs.push(tab.url()))
  await page.goto('/')
  await page.locator('[data-focus-id="macos-nav-library"]').click()

  await page.locator('[data-focus-id="library-view-installed"]').click()
  await expect(page.getByRole('button', { name: /Xbox Cloud Gaming/ })).toHaveCount(0)

  await page.locator('[data-focus-id="library-view-all"]').click()
  const cloud = page.getByRole('region', { name: 'Xbox Cloud Gaming' })
  await expect(cloud.getByText('Cloud · Game Pass').first()).toBeVisible()
  // Cloud tiles carry no buttons; actions live on the game's page.
  await expect(cloud.getByRole('button', { name: /^Play / })).toHaveCount(0)

  await cloud.getByRole('heading', { name: '33 Immortals' }).click()
  await page.getByRole('button', { name: 'Add 33 Immortals to library' }).click()
  await expect(
    page.getByRole('button', { name: 'Remove 33 Immortals from library' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')

  await cloud.getByRole('heading', { name: 'Forza Horizon 5' }).click()
  await page.locator('[data-focus-id="details-play"]').click()
  const player = page.getByRole('dialog', { name: 'Forza Horizon 5' })
  await expect(player).toBeVisible()
  // Esc (like Home) pauses into Orbit's menu; Stop game ends the stream.
  await page.keyboard.press('Escape')
  await expect(player).toBeHidden()
  await page.getByRole('button', { name: /^Stop game/ }).click()
  await expect(player).toHaveCount(0)
  expect(tabs).toEqual([])
  await expect(
    page.getByRole('button', { name: 'Remove Forza Horizon 5 from library' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')

  await page.locator('[data-focus-id="library-view-installed"]').click()
  await expect(page.getByRole('heading', { name: '33 Immortals' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Forza Horizon 5' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pokémon Café Mix' })).toHaveCount(0)
})

test('Xbox sign-in shows a code for microsoft.com/link', async ({ page }) => {
  await page.goto('/')
  await page.locator('[data-focus-id="macos-nav-settings"]').click()
  await page.locator('[data-focus-id="settings-xbox-sign-in"]').click()
  await expect(page.getByLabel('Sign-in code')).toHaveText('ORBIT123')
  await expect(page.getByText(/Signed in as Orbit Player/)).toBeVisible()
})
