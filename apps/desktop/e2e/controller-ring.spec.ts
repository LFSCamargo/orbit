import { expect, test, type Locator, type Page } from '@playwright/test'

async function pressPad(page: Page, button: number) {
  await page.evaluate((index) => {
    window.dispatchEvent(new CustomEvent('test-pad', { detail: index }))
  }, button)
  await page.waitForTimeout(100)
}

async function expectRing(target: Locator) {
  await expect(target).toHaveAttribute('data-focused', 'true')
  await expect
    .poll(() =>
      target.evaluate((el) => {
        const style = getComputedStyle(el)
        return style.outlineStyle === 'solid' && parseFloat(style.outlineWidth) >= 3
      }),
    )
    .toBe(true)
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({
      pressed: false,
      touched: false,
      value: 0,
    }))
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [
        { id: 'Xbox test controller', buttons, axes: [0, 0, 0, 0], connected: true },
      ],
    })
    window.addEventListener('test-pad', (event) => {
      if (!(event instanceof CustomEvent)) return
      const button = buttons[Number(event.detail)]
      button.pressed = true
      button.value = 1
      setTimeout(() => {
        button.pressed = false
        button.value = 0
      }, 65)
    })
  })
  await page.goto('/')
  await expect(page.locator('[data-screen="home"]')).toBeVisible()
})

test('controller rings cover every page and survive section changes', async ({
  page,
}) => {
  for (const [screen, id] of [
    ['library', 'library-sort-alphabetical'],
    ['search', 'search-clear'],
    ['settings', 'settings-fullscreen'],
    ['home', 'macos-play'],
  ]) {
    await pressPad(page, 5)
    await expect(page.locator(`[data-screen="${screen}"]`)).toBeVisible()
    await expectRing(page.locator(`[data-focus-id="${id}"]`))
  }
  await page.locator('[data-focus-id="macos-details"]').hover()
  await pressPad(page, 0)
  await expect(page.locator('[data-screen="game-details"]')).toBeVisible()
  await pressPad(page, 13)
  await expectRing(page.locator('[data-screen="game-details"] [data-focused="true"]'))
  await page.locator('[data-focus-id="details-edit"]').hover()
  await pressPad(page, 0)
  await expect(page.locator('[data-screen="game-edit"]')).toBeVisible()
  await pressPad(page, 13)
  await expectRing(page.locator('[data-screen="game-edit"] [data-focused="true"]'))
  await page.locator('[data-focus-id="macos-toolbar-add"]').hover()
  await pressPad(page, 0)
  await expect(page.locator('[data-screen="add-game"]')).toBeVisible()
  await pressPad(page, 13)
  await expectRing(page.locator('[data-screen="add-game"] [data-focused="true"]'))
  await page.locator('[data-focus-id="macos-nav-library"]').click()
  await page.locator('[data-focus-id="library-gamehub-manager"]').hover()
  await pressPad(page, 0)
  await expect(page.locator('[data-screen="gamehub-library"]')).toBeVisible()
  await pressPad(page, 13)
  await expectRing(page.locator('[data-screen="gamehub-library"] [data-focused="true"]'))
  await page.locator('[data-focus-id="macos-nav-settings"]').click()
  await page.locator('[data-focus-id="settings-tab-library"]').click()
  await page.locator('[data-focus-id="imports-switch-library"]').hover()
  await pressPad(page, 0)
  await expect(page.locator('[data-screen="switch-library"]')).toBeVisible()
  await pressPad(page, 13)
  await expectRing(page.locator('[data-screen="switch-library"] [data-focused="true"]'))
})

test('settings tabs, theme cards, and portaled dialogs retain rings with no browser focus', async ({
  page,
}) => {
  await page.locator('[data-focus-id="macos-nav-settings"]').click()
  const tab = page.locator('[data-focus-id="settings-tab-themes"]')
  await tab.hover()
  await pressPad(page, 0)
  await expectRing(tab)
  const theme = page.locator('[data-focus-id="settings-theme-god-of-war"]')
  await theme.hover()
  await pressPad(page, 0)
  await expectRing(theme)
  await expect(theme).not.toBeFocused()
  await page.locator('[data-focus-id="artwork-web-logo"]').hover()
  await pressPad(page, 0)
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expectRing(dialog.locator('[data-focused="true"]'))
  await page.mouse.move(1, 1)
  await expect(page.locator('html')).toHaveAttribute('data-navigation-input', 'pointer')
  await pressPad(page, 13)
  await expectRing(dialog.locator('[data-focused="true"]'))
})
