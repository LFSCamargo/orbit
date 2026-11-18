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
        const ring = (node: Element | null) => {
          if (!node) return false
          const style = getComputedStyle(node)
          return style.outlineStyle === 'solid' && parseFloat(style.outlineWidth) >= 3
        }
        return ring(el) || ring(el.querySelector('.orbit-art-focus-target'))
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
    let release: (() => void) | null = null
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => {
        const sampled = release
        release = null
        if (sampled) queueMicrotask(sampled)
        return [
          { id: 'Xbox test controller', buttons, axes: [0, 0, 0, 0], connected: true },
        ]
      },
    })
    window.addEventListener('test-pad', (event) => {
      if (!(event instanceof CustomEvent)) return
      const button = buttons[Number(event.detail)]
      button.pressed = true
      button.value = 1
      release = () => {
        button.pressed = false
        button.value = 0
      }
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
    ['settings', 'settings-pref-scanOnStartup'],
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
  await expect(page.locator('[data-screen="game-details"]')).toBeVisible()
  await expect(page.locator('#details-settings')).toBeVisible()
  await pressPad(page, 13)
  await expectRing(page.locator('[data-screen="game-details"] [data-focused="true"]'))
  await page.locator('[data-focus-id="macos-toolbar-add"]').hover()
  await pressPad(page, 0)
  await expect(page.locator('[data-screen="add-game"]')).toBeVisible()
  await pressPad(page, 13)
  await expectRing(page.locator('[data-screen="add-game"] [data-focused="true"]'))
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

test('controller reaches Steam switches and preserves section navigation', async ({
  page,
}) => {
  await page.locator('[data-focus-id="macos-nav-settings"]').click()
  await page.locator('[data-focus-id="settings-tab-steam"]').hover()
  await pressPad(page, 0)
  const offline = page.getByRole('switch', { name: 'Offline mode' })
  await expect(offline).toHaveAttribute('data-focus-id', /settings-control-/)
  await offline.hover()
  await pressPad(page, 0)
  await expect(offline).toBeChecked()
  await expectRing(offline)
  await pressPad(page, 13)
  await expectRing(page.getByRole('switch', { name: 'Verify game files' }))
  await pressPad(page, 14)
  await expectRing(page.locator('[data-focus-id="settings-tab-steam"]'))
})

test('controller opens and closes Settings graphics selectors without leaving the page', async ({
  page,
}) => {
  await page.locator('[data-focus-id="macos-nav-settings"]').click()
  await page.locator('[data-focus-id="settings-tab-graphics"]').hover()
  await pressPad(page, 0)
  const graphics = page.getByRole('combobox', { name: 'Default graphics' })
  await graphics.hover()
  await pressPad(page, 0)
  await expect(page.getByRole('listbox')).toBeVisible()
  await pressPad(page, 13)
  await pressPad(page, 1)
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await pressPad(page, 0)
  await expect(page.getByRole('listbox')).toBeVisible()
  await pressPad(page, 13)
  await pressPad(page, 0)
  await expect(graphics).toHaveText('Wine')
  await expect(page.locator('[data-screen="settings"]')).toBeVisible()
})

test('homepage card activation returns controller focus to its Installed shelf', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Installed', exact: true }).click()
  const card = page.locator('.macos-game-tile').first()
  const entryId = await card.getAttribute('data-loop-entry')
  await card.hover()
  await pressPad(page, 0)
  await expect(page.locator('[data-screen="game-details"]')).toBeVisible()
  await pressPad(page, 1)
  await expect(page.locator('[data-screen="home"]')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Installed', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  const restored = page.locator(
    `.macos-game-tile[data-loop-entry="${entryId}"][data-focused="true"]`,
  )
  await expectRing(restored)
  await expect
    .poll(async () => {
      const box = await restored.boundingBox()
      const viewport = page.viewportSize()?.width ?? 0
      return !!box && box.x + box.width > 0 && box.x < viewport
    })
    .toBe(true)
})
