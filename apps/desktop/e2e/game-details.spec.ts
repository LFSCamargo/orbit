import { expect, test } from '@playwright/test'

for (const theme of ['liquid-glass', 'god-of-war']) {
  test(`${theme} details offer complete controls and achievement filters`, async ({
    page,
  }) => {
    await page.addInitScript(
      (theme) => localStorage.setItem('orbit.themeId', theme),
      theme,
    )
    await page.goto('/')
    await page.locator('[data-focus-id="macos-nav-library"]').click()
    await page.locator('[data-focus-id="library-game-mock-cyberpunk"]').click()
    await expect(page.locator('#details-title')).toHaveText('Cyberpunk 2077')
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expect(page.getByRole('heading', { name: 'About this game' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'In your library' })).toBeVisible()
    await expect(
      page.getByText('An open-world RPG in Night City.', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('progressbar', { name: 'Achievement completion' }),
    ).toHaveAttribute('value', '1')
    await page.locator('[data-focus-id="details-achievements-unlocked"]').click()
    await expect(page.getByRole('heading', { name: 'The Streetkid' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Legend', exact: true })).toHaveCount(
      0,
    )
    await page.locator('[data-focus-id="details-favorite"]').click()
    await expect(page.locator('[data-focus-id="details-favorite"]')).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await page.locator('[data-focus-id="details-delete"]').click()
    await expect(page.getByText(/Your installed game files stay untouched/)).toBeVisible()
    await page.locator('[data-focus-id="confirm-cancel"]').click()
    await expect(page.locator('#details-title')).toBeVisible()
    await page.locator('[data-focus-id="details-edit"]').click()
    await expect(page.locator('[data-screen="game-edit"]')).toBeVisible()
    await page.locator('[data-focus-id="edit-back"]').click()
    await expect(page.locator('#details-title')).toBeVisible()
    await page.locator('[data-focus-id="macos-back"]').click()
    await expect(page.locator('[data-screen="library"]')).toBeVisible()
  })
}

test('Liquid Glass details stay useful in a compact window and respect reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.locator('[data-focus-id="macos-nav-library"]').click()
  await page.locator('[data-focus-id="library-game-mock-re4"]').click()
  await expect(page.locator('#details-title')).toHaveText('Resident Evil 4')
  await expect(page.locator('.details-command-bar')).toHaveAttribute(
    'data-glass-mode',
    /pending|simple|opaque/,
  )
  await expect(
    page.getByRole('heading', { name: 'No achievement data yet' }),
  ).toBeVisible()
  const width = await page
    .locator('.macos-main')
    .evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(width).toBeLessThan(2)
  await page.locator('[data-focus-id="details-hide"]').click()
  await expect(
    page.locator('.details-library-facts').getByText('Hidden', { exact: true }),
  ).toBeVisible()
  await page.locator('[data-focus-id="details-hide"]').click()
  await expect(
    page.locator('.details-library-facts').getByText('In library', { exact: true }),
  ).toBeVisible()
  await page.locator('[data-focus-id="details-play"]').click()
  await expect(page.locator('.session-stage')).toBeVisible()
  await page.locator('[data-focus-id="playing-stop"]').click()
  await expect(page.locator('#details-title')).toBeVisible()
})
