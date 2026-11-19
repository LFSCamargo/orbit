import { expect, test, type Page } from './fixtures'

/** Text buttons that are not pills: corner radius under half their height.
 * Tiles, rows and cards keep their own corners: taller than 72 px, holding an
 * image, switches, or marked `data-shape="row"` (a title over a description). */
async function squareButtons(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, [role="button"], a.button')]
      .filter((el) => {
        const rect = el.getBoundingClientRect()
        if (!rect.width || !rect.height || rect.height > 72) return false
        if (el.getAttribute('role') === 'switch' || el.getAttribute('role') === 'tab')
          return false
        if (el.querySelector('img, canvas, video')) return false
        if (el.dataset.shape === 'row') return false
        if (!(el.textContent ?? '').trim()) return false
        const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0
        return radius < rect.height / 2 - 1
      })
      .map(
        (el) =>
          `${el.dataset.focusId ?? el.tagName}: "${(el.textContent ?? '').trim().slice(0, 30)}"`,
      ),
  )
}

test('every text button is a pill, across Orbit', async ({ page }) => {
  await page.goto('/')
  const found = new Set<string>()
  const collect = async () => (await squareButtons(page)).forEach((b) => found.add(b))
  await collect()
  await page.locator('[data-focus-id="macos-nav-library"]').click()
  await expect(page.locator('[data-screen="library"]')).toBeVisible()
  await collect()
  await page.locator('[data-focus-id="macos-nav-settings"]').click()
  for (const tab of await page.locator('[data-focus-id^="settings-tab-"]').all()) {
    await tab.click()
    await page.waitForTimeout(300)
    await collect()
  }
  await page.locator('[data-focus-id="macos-nav-library"]').click()
  await page.locator('[data-focus-id="library-game-steam:1091500"]').click()
  await expect(page.locator('[data-screen="game-details"]')).toBeVisible()
  await collect()
  for (const tab of await page.getByRole('tab').all()) {
    await tab.click()
    await page.waitForTimeout(300)
    await collect()
  }
  await page.locator('[data-focus-id="macos-toolbar-add"]').click()
  await expect(page.locator('[data-screen="add-game"]')).toBeVisible()
  await collect()
  expect([...found]).toEqual([])
})
