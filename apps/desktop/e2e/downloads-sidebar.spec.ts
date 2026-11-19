import { expect, test } from './fixtures'

const rgba = (value: string) => {
  const [r, g, b, a = 1] = value.match(/[\d.]+/g)!.map(Number)
  return { r, g, b, a }
}
const brightness = (filter: string) =>
  Number(filter.match(/brightness\(([\d.]+)\)/)?.[1] ?? 1)

// Regression: the sheet read lighter than the blurred backdrop behind it, as
// its glass brightened and saturated the page through a light tint.
test('the downloads sheet sits darker than the backdrop behind it', async ({ page }) => {
  await page.goto('/')
  await page.locator('[data-focus-id="macos-toolbar-downloads"]').click()
  const drawer = page.getByRole('dialog', { name: 'Downloads' })
  await expect(drawer).toBeVisible()
  const sheet = await drawer.evaluate((el) => {
    const style = getComputedStyle(el)
    return {
      background: style.backgroundColor,
      filter: style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter'),
    }
  })
  const tint = rgba(sheet.background)
  expect(tint.a).toBeGreaterThanOrEqual(0.6)
  expect(Math.max(tint.r, tint.g, tint.b)).toBeLessThanOrEqual(24)
  expect(brightness(sheet.filter)).toBeLessThan(1)
  const cards = drawer.locator('.orbit-glass-control')
  await expect(cards.first()).toBeVisible()
  for (const filter of await cards.evaluateAll((els) =>
    els.map((el) => getComputedStyle(el).backdropFilter),
  )) {
    expect(brightness(filter)).toBeLessThanOrEqual(1)
  }
})
