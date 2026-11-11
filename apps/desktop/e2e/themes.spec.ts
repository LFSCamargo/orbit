import { expect, test, type Page } from '@playwright/test'
import { BUILT_IN_THEMES } from '../src/themes/catalog'

async function openSettings(page: Page) {
  await page.goto('/')
  await expect(page.locator('[data-macos-shell]')).toBeVisible({ timeout: 15_000 })
  await page.locator('[data-focus-id="macos-nav-settings"]').click()
  await page.locator('[data-focus-id="settings-tab-themes"]').click()
}

test.describe('Themes', () => {
  for (const legacy of ['orbit', 'macos', 'ps5', 'switch-2', 'steam-big-picture']) {
    test(`migrates the retired ${legacy} shell to Liquid Glass`, async ({ page }) => {
      await page.addInitScript((id) => localStorage.setItem('orbit.themeId', id), legacy)
      await page.goto('/')
      await expect(page.locator('[data-macos-shell]')).toBeVisible({ timeout: 15_000 })
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'liquid-glass')
    })
  }

  test('groups color, game, and custom themes in settings', async ({ page }) => {
    await openSettings(page)
    await expect(
      page
        .getByTestId('settings-themes-view')
        .getByRole('heading', { name: 'Liquid Glass', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Game themes' })).toBeVisible()
    for (const id of [
      'devil-may-cry-5',
      'god-of-war',
      'cyberpunk-2077',
      'zelda-ocarina-of-time',
      'gta-v',
      'gta-vi',
      'zelda-breath-of-the-wild',
      'super-mario',
    ]) {
      await expect(page.locator(`[data-focus-id="settings-theme-${id}"]`)).toBeVisible()
    }
  })

  test('applies the selected game palette', async ({ page }) => {
    await openSettings(page)
    await expect(page.locator('[data-focus-id="settings-theme-ps5"]')).toHaveCount(0)
    await expect(page.locator('[data-focus-id="settings-theme-aurora"]')).toHaveCount(0)
    await page.locator('[data-focus-id="settings-theme-god-of-war"]').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'god-of-war')
    expect(
      await page.evaluate(() =>
        document.documentElement.style.getPropertyValue('--orbit-accent'),
      ),
    ).toBe('200 50 50')
  })

  test('game themes replace the Orbit logo and sign the footer', async ({ page }) => {
    await page.route('https://images.igdb.com/**', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        headers: { 'access-control-allow-origin': '*' },
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="100%" height="100%" fill="#203740"/></svg>',
      }),
    )
    await openSettings(page)
    await page.locator('[data-focus-id="settings-theme-devil-may-cry-5"]').click()
    const brand = page.locator('.macos-brand .theme-brand')
    await expect(brand).toHaveAttribute('data-brand', 'image')
    await expect(brand.getByRole('img', { name: 'Devil May Cry 5' })).toBeVisible()
    await expect(page.locator('.macos-console-footer .theme-orbit-mark')).toHaveText(
      'ORBIT',
    )
    await expect(brand.locator('img')).toHaveJSProperty('complete', true)
    expect(
      await brand.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth),
    ).toBeGreaterThan(0)
    await expect(page.locator('html')).toHaveCSS('--theme-wallpaper', /hero.*\.webp/)
    await page.mouse.move(0, 0)
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'devil-may-cry-5')
    await expect(brand.getByRole('img', { name: 'Devil May Cry 5' })).toBeVisible()
    await expect(page.locator('.macos-hero-layer[data-layer="active"]')).toHaveAttribute(
      'src',
      /co2rpf/,
    )
  })

  test('theme studio saves a custom theme with picked artwork and deletes it', async ({
    page,
  }) => {
    await openSettings(page)
    await page.locator('[data-focus-id="settings-theme-devil-may-cry-5"]').click()

    await expect(page.getByLabel('Logo text')).toHaveCount(0)
    await expect(page.getByText('Logo style', { exact: true })).toHaveCount(0)
    await expect(page.getByTestId('theme-studio-preview').getByRole('img')).toBeVisible()
    await page.locator('[data-focus-id="artwork-web-logo"]').click()
    const dialog = page.getByRole('dialog', { name: 'Choose logo artwork' })
    await dialog.getByRole('button', { name: /— SteamGridDB$/ }).click()
    await expect(dialog).toBeHidden()

    await page.locator('[data-focus-id="artwork-web-hero"]').click()
    const heroes = page.getByRole('dialog', { name: 'Choose hero artwork' })
    await expect(heroes).toContainText('3840 × 2160')
    await expect(heroes.getByRole('button', { name: /TheGamesDB \(1\)/ })).toBeVisible()
    await heroes.getByRole('button', { name: /— SteamGridDB$/ }).click()
    await expect(heroes).toBeHidden()
    await page.locator('[data-focus-id="studio-save"]').click()
    const card = page.locator(
      '[data-focus-id="settings-theme-custom-my-devil-may-cry-5"]',
    )
    await expect(card).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('heading', { name: 'Your themes' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      'custom-my-devil-may-cry-5',
    )
    await expect(page.locator('.macos-brand .theme-brand')).toHaveAttribute(
      'data-brand',
      'image',
    )
    await expect(page.locator('.theme-orbit-mark')).toBeVisible()

    await page.locator('[data-focus-id="studio-delete"]').click()
    await expect(card).toHaveCount(0)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'liquid-glass')
  })
})

test('every built-in switches without losing shared navigation or controller focus', async ({
  page,
}) => {
  await openSettings(page)
  for (const theme of BUILT_IN_THEMES) {
    const card = page.locator(`[data-focus-id="settings-theme-${theme.id}"]`)
    await card.click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id)
    await expect(card).toHaveAttribute('data-focused', 'true')
    await page.keyboard.press('BracketLeft')
    await expect(page.locator('[data-screen="search"]')).toBeVisible()
    await page.keyboard.press('BracketRight')
    await expect(page.locator('[data-screen="settings"]')).toBeVisible()
  }
})
