import { expect, test } from '@playwright/test'

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1024, height: 640 },
  { width: 390, height: 844 },
]) {
  test(`settings confines scrolling to its content at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await page.locator('[data-focus-id="macos-nav-settings"]').click()
    await page.locator('[data-focus-id="settings-tab-themes"]').click()
    await expect(page.getByRole('button', { name: /^Back/ })).toHaveCount(0)
    const panel = page.locator('.settings-content-scroll')
    await panel.evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    expect(await panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    for (const selector of ['.macos-main', '.settings-layout', '.settings-tabs']) {
      expect(
        await page.locator(selector).evaluate((el) => el.scrollHeight - el.clientHeight),
      ).toBeLessThan(2)
    }
    const tabs = await page.locator('.settings-tabs').boundingBox()
    const content = await page.locator('.settings-content').boundingBox()
    if (viewport.width > 520) {
      expect(Math.abs(tabs!.y - content!.y)).toBeLessThan(2)
      expect(Math.abs(tabs!.height - content!.height)).toBeLessThan(2)
    }
    if (viewport.width >= 1180) {
      const insights = await page.locator('.settings-insights').boundingBox()
      const header = await page.locator('.macos-utilities').boundingBox()
      const leftHeader = await page.locator('.macos-brand').boundingBox()
      expect(tabs!.width).toBeLessThan(content!.width / 2)
      expect(insights!.width).toBeLessThan(content!.width / 2)
      expect(tabs!.x).toBeCloseTo(leftHeader!.x, 0)
      expect(insights!.x + insights!.width).toBeCloseTo(header!.x + header!.width, 0)
    }
    await page.locator('[data-focus-id="macos-window-fullscreen"]').click()
    const brand = await page.locator('.macos-brand').boundingBox()
    const nav = await page.locator('.macos-navigation').boundingBox()
    expect(brand!.x + brand!.width).toBeLessThanOrEqual(nav!.x)
  })
}
