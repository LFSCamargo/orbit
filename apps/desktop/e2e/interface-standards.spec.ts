import { expect, test } from './fixtures'

test('library toolbar sticks with a fade under the search bar', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 520 })
  await page.goto('/')
  await page.locator('[data-focus-id="macos-nav-library"]').click()
  const toolbar = page.locator('.library-toolbar')
  await expect(toolbar).toBeVisible()
  await expect(toolbar).toHaveCSS('position', 'sticky')
  await expect(page.locator('.library-toolbar-fade')).toHaveCount(0)
  const grids = page.locator('.library-entry-grid')
  await expect(grids).not.toHaveCount(0)
  await expect
    .poll(() =>
      grids.evaluateAll((elements) =>
        elements.every((el) => {
          const style = getComputedStyle(el)
          return (style.webkitMaskImage || style.maskImage).includes('linear-gradient')
        }),
      ),
    )
    .toBe(true)
  const main = page.locator('.macos-main')
  const start = await toolbar.boundingBox()
  await main.evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  const scrolled = await main.evaluate((el) => el.scrollTop > 8)
  if (scrolled) {
    const after = await toolbar.boundingBox()
    const mainBox = await main.boundingBox()
    expect(after!.y).toBeLessThanOrEqual(start!.y)
    expect(after!.y).toBeGreaterThanOrEqual(mainBox!.y - 2)
    expect(after!.y).toBeLessThan(mainBox!.y + 24)
    await expect
      .poll(() =>
        grids.evaluateAll((elements) =>
          elements.every((el) => {
            const style = getComputedStyle(el)
            return (style.webkitMaskPosition || style.maskPosition) !== '0% 0%'
          }),
        ),
      )
      .toBe(true)
  }
})

test('library navigation uses Installed, All games, and Favorites', async ({ page }) => {
  await page.goto('/')
  await page.locator('[data-focus-id="macos-nav-library"]').click()
  const tabs = page.getByRole('group', { name: 'Library view', exact: true })
  await expect(tabs).toHaveCSS('border-radius', '999px')
  await expect(tabs.getByRole('button', { name: 'Installed' })).toBeVisible()
  await expect(page.locator('[data-focus-id="library-game-steam:1091500"]')).toBeVisible()
  await tabs.getByRole('button', { name: 'All games' }).click()
  await expect(page.locator('[data-focus-id="library-game-steam:1091500"]')).toBeVisible()
  await tabs.getByRole('button', { name: 'Favorites' }).click()
  await expect(page.locator('[data-focus-id="library-game-steam:1091500"]')).toBeVisible()
})

test('home shelf hides scrollbar chrome without disabling scrolling', async ({
  page,
}) => {
  await page.goto('/')
  const shelf = page.locator('.macos-game-grid')
  await expect(shelf).toBeVisible()
  expect(await shelf.evaluate((el) => getComputedStyle(el).scrollbarWidth)).toBe('none')
  expect(await shelf.evaluate((el) => getComputedStyle(el).overflowX)).toBe('auto')
})

test('home shelf scrolls sideways with vertical and horizontal mouse wheels', async ({
  page,
}) => {
  await page.setViewportSize({ width: 600, height: 850 })
  await page.goto('/')
  const shelf = page.locator('.macos-game-grid')
  await expect(shelf).toBeVisible()
  const box = (await shelf.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  const scrollLeft = () => shelf.evaluate((el) => el.scrollLeft)
  const pageScroll = () => page.evaluate(() => document.scrollingElement!.scrollTop)

  const start = await scrollLeft()
  const pageStart = await pageScroll()
  // A small nudge still moves a whole card instead of springing back.
  await page.mouse.wheel(0, 30)
  await expect.poll(scrollLeft).not.toBe(start)
  expect(await pageScroll()).toBe(pageStart)
  // The spring settles on the shelf's end, which the mock shelf is within one step of.
  const end = await shelf.evaluate((el) => el.scrollWidth - el.clientWidth)
  await expect.poll(scrollLeft).toBe(end)

  // Back the other way: the mock shelf overflows less than one wheel step.
  const afterVertical = await scrollLeft()
  await page.mouse.wheel(-200, 0)
  await expect.poll(scrollLeft).toBeLessThan(afterVertical)
})

test('game details expose launch settings directly', async ({ page }) => {
  await page.goto('/')
  await page.locator('[data-focus-id="macos-nav-library"]').click()
  await page.locator('[data-focus-id="library-game-steam:1091500"]').click()
  const detailsTabs = page.getByRole('tablist', { name: 'Game details' })
  await expect(detailsTabs).toHaveCSS('border-radius', '999px')
  await expect(detailsTabs.getByRole('tab', { name: 'Overview' })).toHaveCSS(
    'border-radius',
    '999px',
  )
  await page.getByRole('tab', { name: 'Settings', exact: true }).click()
  await page.getByRole('tab', { name: 'Launch & Compatibility', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Launch settings', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Save settings', exact: true }),
  ).toBeDisabled()
  const actions = page
    .locator('.orbit-editor-actions')
    .filter({ has: page.getByRole('button', { name: 'Save settings', exact: true }) })
  await expect(actions).toHaveCSS('position', 'static')
  await expect(actions).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await page.getByRole('tab', { name: 'Overview', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'About this game' })).toBeVisible()
})

test('properties keeps metadata drafts while switching to bounded artwork previews', async ({
  page,
}) => {
  await page.goto('/')
  await page.locator('[data-focus-id="macos-nav-library"]').click()
  await page.locator('[data-focus-id="library-game-steam:1091500"]').click()
  await page.locator('[data-focus-id="details-edit"]').click()
  await expect(page.getByRole('tablist', { name: 'Properties' })).toHaveCSS(
    'border-radius',
    '999px',
  )
  await page.getByLabel('Game title', { exact: true }).fill('My draft title')
  await page.getByRole('tab', { name: 'Artwork', exact: true }).click()
  const preview = page
    .locator('[aria-label="Artwork"] [style*="background-image"]')
    .first()
  await expect(preview).toBeVisible()
  expect(Math.round((await preview.boundingBox())!.height)).toBeLessThanOrEqual(280)
  await page.getByRole('tab', { name: 'General', exact: true }).click()
  await expect(page.getByLabel('Game title', { exact: true })).toHaveValue(
    'My draft title',
  )
})

test('adding an existing Steam library folder starts discovery and reports its result', async ({
  page,
}) => {
  await page.goto('/')
  await page.locator('[data-focus-id="macos-nav-settings"]').click()
  await page.locator('[data-focus-id="settings-tab-library"]').click()
  await page
    .getByLabel('Additional Steam library folder')
    .fill('/Users/player/SteamLibrary')
  await page.getByRole('button', { name: 'Add library folder', exact: true }).click()
  await expect(
    page.getByText('/Users/player/SteamLibrary', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('status').filter({ hasText: 'Library scan complete' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Scan installed games', exact: true }),
  ).toBeEnabled()
})

test('homepage fits its title and opens cards from Installed without launching', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Installed', exact: true }).click()
  const title = page.locator('#macos-feature-title')
  await expect(title).toHaveCSS('white-space', 'nowrap')
  expect(await title.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  const card = page.locator('.macos-game-tile').first()
  await expect(card).toBeVisible()
  await card.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('tablist', { name: 'Game details' })).toBeVisible()
})

test('homepage game tiles ring the cover instead of the title', async ({ page }) => {
  await page.goto('/')
  const tile = page.locator('.macos-game-tile').first()
  await tile.focus()
  expect(await tile.evaluate((el) => getComputedStyle(el).outlineStyle === 'none')).toBe(
    true,
  )
  await expect
    .poll(() =>
      tile.locator('.orbit-art-focus-target').evaluate((el) => {
        const style = getComputedStyle(el)
        return style.outlineStyle === 'solid' && parseFloat(style.outlineWidth) >= 3
      }),
    )
    .toBe(true)
})

test('long homepage titles fit after resize', async ({ page }) => {
  await page.goto('/')
  const title = page.locator('#macos-feature-title')
  await expect(title).toBeVisible()
  await title.evaluate((el) => {
    el.textContent =
      'A very long adventure title with a subtitle and a definitive edition'
  })
  await page.setViewportSize({ width: 800, height: 700 })
  await expect
    .poll(() => title.evaluate((el) => el.scrollWidth <= el.clientWidth + 1))
    .toBe(true)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true)
  await page.screenshot({ path: '/tmp/orbit-lit212-home.png' })
})

test('homepage carousel reaches screen borders and fades only overflowing edges', async ({
  page,
}) => {
  await page.setViewportSize({ width: 600, height: 850 })
  await page.goto('/')
  const shelf = page.locator('.macos-game-grid')
  await expect(shelf).toBeVisible()
  const looping = await shelf.getAttribute('data-shelf-looping')
  const box = await shelf.boundingBox()
  if (looping === 'true') {
    expect(box!.x).toBeCloseTo(0, 0)
    expect(box!.width).toBeCloseTo(600, 0)
    await expect(shelf).toHaveCSS('padding-left', '0px')
  } else {
    expect(box!.x).toBeGreaterThan(8)
    expect(box!.width).toBeLessThan(600)
  }
  await expect(page.locator('[data-edge-particles]')).toHaveCount(0)
  const overflowing = await shelf.evaluate((el) => el.scrollWidth > el.clientWidth + 1)
  const mask = await shelf.evaluate((el) => {
    const style = getComputedStyle(el)
    return style.webkitMaskImage || style.maskImage
  })
  if (looping === 'true' && overflowing) expect(mask).toContain('linear-gradient')
  else expect(mask === 'none' || mask === '').toBe(true)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true)
})

test('homepage carousel stays a finite strip when there are seven or fewer games', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 850 })
  await page.goto('/')
  const shelf = page.locator('.macos-game-grid')
  await expect(shelf).toBeVisible()
  const count = await shelf.locator('.macos-game-tile').count()
  expect(count).toBeGreaterThan(0)
  expect(count).toBeLessThanOrEqual(7)
  await expect.poll(() => shelf.evaluate((el) => el.scrollLeft)).toBe(0)
  const mask = await shelf.evaluate((el) => {
    const style = getComputedStyle(el)
    return style.webkitMaskImage || style.maskImage
  })
  expect(mask === 'none' || mask === '').toBe(true)
  await shelf.evaluate((el) => {
    el.scrollLeft = 0
  })
  await expect.poll(() => shelf.evaluate((el) => el.scrollLeft)).toBe(0)
  await shelf.evaluate((el) => {
    el.scrollLeft = el.scrollWidth
  })
  await expect
    .poll(() =>
      shelf.evaluate((el) => el.scrollLeft + el.clientWidth >= el.scrollWidth - 1),
    )
    .toBe(true)
  expect(await shelf.locator('.macos-game-tile').count()).toBe(count)
})

test('the search field shows one rounded focus ring, not a box inside the pill', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  const input = page.getByRole('textbox', { name: 'Search your collection' })
  const pill = page.locator('.library-search')
  const outline = (el: HTMLElement | SVGElement) => getComputedStyle(el).outlineStyle
  for (const select of [
    // Typing focus.
    () => input.focus(),
    // Controller focus: the ring follows the focused node, without DOM focus.
    async () => {
      await page.evaluate(() => {
        ;(document.activeElement as HTMLElement | null)?.blur()
        document.documentElement.dataset.navigationInput = 'controller'
      })
      await input.evaluate((el) => el.setAttribute('data-focused', 'true'))
    },
  ]) {
    await select()
    await expect.poll(() => input.evaluate(outline)).toBe('none')
    await expect.poll(() => pill.evaluate(outline)).toBe('solid')
  }
})
