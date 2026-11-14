import { expect, test } from '@playwright/test'

test('compatibility settings keep setup simple and advanced options optional', async ({
  page,
}) => {
  await page.goto('/')
  await page.locator('[data-focus-id="macos-nav-settings"]').click()
  await page.getByRole('button', { name: 'Compatibility', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Windows compatibility' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Install compatibility' })).toBeVisible()
  await expect(
    page.getByText(/No terminal, Homebrew, or separate launcher needed/),
  ).toBeVisible()
  await page.getByText('Advanced runtime options').click()
  await expect(page.getByText('No Wine runtime detected.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Detect again' }).click()
  await expect(page.getByText('No Wine runtime detected.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'General', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Fullscreen', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Compatibility', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Install compatibility' })).toBeVisible()
})

test('graphics defaults save explicitly and drafts survive section navigation', async ({
  page,
}) => {
  await page.goto('/')
  await page.locator('[data-focus-id="macos-nav-settings"]').click()
  await page.getByRole('button', { name: 'Game graphics', exact: true }).click()
  await page.getByLabel('Default synchronization').click()
  await page.getByRole('option', { name: 'MSync', exact: true }).click()
  await expect(page.getByText('You have unsaved changes')).toBeVisible()
  await page.getByRole('button', { name: 'General', exact: true }).click()
  await page.getByRole('button', { name: 'Game graphics', exact: true }).click()
  await expect(page.getByLabel('Default synchronization')).toHaveText('MSync')
  await page.getByRole('button', { name: 'Discard changes' }).click()
  await expect(page.getByLabel('Default synchronization')).toHaveText(
    'Default · Recommended',
  )
  await page.getByRole('switch', { name: 'High Resolution Mode', exact: true }).click()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Changes saved.')).toBeVisible()
  await page.getByRole('button', { name: 'General', exact: true }).click()
  await page.getByRole('button', { name: 'Game graphics', exact: true }).click()
  await expect(
    page.getByRole('switch', { name: 'High Resolution Mode', exact: true }),
  ).toBeChecked()
})

test('one graphics selector lists engines with version status and replaces the selection', async ({
  page,
}) => {
  await page.goto('/')
  await page.locator('[data-focus-id="macos-nav-settings"]').click()
  await page.getByRole('button', { name: 'Compatibility', exact: true }).click()
  const selector = page.getByRole('combobox', { name: 'Graphics engine version' })
  await expect(selector).toHaveCount(1)
  await selector.click()
  const options = page.getByRole('listbox')
  await expect(options).toBeVisible()
  await expect(
    options.getByRole('option').filter({ hasText: 'DXMT' }).first(),
  ).toContainText('Not installed')
  await options.getByRole('option').filter({ hasText: 'DXMT' }).first().click()
  await expect(selector).toContainText('DXMT')
  await selector.press('Enter')
  await page.getByRole('option').filter({ hasText: 'DXVK' }).first().click()
  await expect(selector).toContainText('DXVK')
  await expect(selector).not.toContainText('DXMT')
  await selector.press('Enter')
  await page.keyboard.press('Escape')
  await expect(selector).toBeFocused()
  await expect(page.getByRole('listbox')).not.toBeVisible()
})

test('a browsed component version survives switching settings tabs', async ({ page }) => {
  await page.goto('/')
  await page.locator('[data-focus-id="macos-nav-settings"]').click()
  await page.getByRole('button', { name: 'Compatibility', exact: true }).click()
  await page.getByText('Compatibility components').waitFor()
  const picker = page.getByRole('combobox', { name: 'Graphics engine version' })
  await picker.click()
  await page.getByRole('option').filter({ hasText: 'DXVK' }).first().click()
  await expect(picker).toContainText('DXVK')
  await page.getByRole('button', { name: 'General', exact: true }).click()
  await page.getByRole('button', { name: 'Compatibility', exact: true }).click()
  await expect(
    page.getByRole('combobox', { name: 'Graphics engine version' }),
  ).toContainText('DXVK')
})

test('component rows expose a per-row install action and honest preview errors', async ({
  page,
}) => {
  await page.goto('/')
  await page.locator('[data-focus-id="macos-nav-settings"]').click()
  await page.getByRole('button', { name: 'Compatibility', exact: true }).click()
  await page.getByText('Compatibility components').waitFor()
  const install = page.locator('[data-focus-id="runtime-install-wine"]')
  await expect(install).toBeVisible()
  await expect(install).toContainText('Install')
  await install.click()
  await expect(page.getByRole('alert')).toContainText(
    'Managed downloads require the Orbit desktop app',
  )
  await expect(page.locator('[data-focus-id="runtime-install-wine"]')).toContainText(
    'Retry',
  )
})
