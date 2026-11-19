import { test as base } from '@playwright/test'

export {
  chromium,
  devices,
  expect,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test'

/** Orbit ignores input until its startup splash has gone (app/splash), so
 * every navigation waits for it, as a player would. e2e/splash.spec.ts uses
 * Playwright's own `test` to watch the splash itself. */
export const test = base.extend({
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page)
    // Orbit is ready when the splash leaves, not at the load event, which
    // waits on every image (a test holding one back would never see it).
    page.goto = async (url, options) => {
      const response = await goto(url, { waitUntil: 'domcontentloaded', ...options })
      await page.locator('#orbit-splash').waitFor({ state: 'detached', timeout: 15_000 })
      return response
    }
    await use(page)
  },
})
