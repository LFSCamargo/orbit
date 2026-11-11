import { expect, test } from '@playwright/test'

test('search text accepts shortcut letters, brackets, deletion, and caret navigation', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  const input = page.getByPlaceholder('Find a game…')
  await input.fill('game')
  await input.press('Backspace')
  await expect(input).toHaveValue('gam')
  await input.pressSequentially(' [mfc]')
  await expect(input).toHaveValue('gam [mfc]')
  await input.press('ArrowLeft')
  await input.press('Backspace')
  await expect(input).toHaveValue('gam [mf]')
  await input.dispatchEvent('keydown', { key: 'f', code: 'KeyF', metaKey: true })
  await expect(page.locator('[data-macos-shell]')).toHaveAttribute(
    'data-fullscreen',
    'true',
  )
  await input.press('Escape')
  await expect(page.locator('[data-screen="search"]')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('heading', { name: 'Search', exact: true }).click()
  await page.keyboard.press('Backspace')
  await expect(page.locator('[data-screen="search"]')).toBeVisible()
})

test('theme and artwork text fields preserve editing and dialog state', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.locator('[data-focus-id="settings-tab-themes"]').click()
  const name = page.getByLabel('Theme name', { exact: true })
  await name.fill('My theme')
  await name.press('Backspace')
  await name.pressSequentially(' [mfc]')
  await expect(name).toHaveValue('My them [mfc]')
  await page.locator('[data-focus-id="settings-theme-god-of-war"]').click()
  await page.locator('[data-focus-id="artwork-web-logo"]').click()
  const dialog = page.getByRole('dialog', { name: 'Choose logo artwork' })
  const query = dialog.getByRole('textbox')
  await query.fill('Artwork')
  await query.press('Backspace')
  await query.pressSequentially(' [mfc]')
  await expect(query).toHaveValue('Artwor [mfc]')
  await query.dispatchEvent('keydown', {
    key: 'Escape',
    code: 'Escape',
    isComposing: true,
  })
  await expect(dialog).toBeVisible()
  await expect(page.locator('[data-screen="settings"]')).toBeVisible()
  await query.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.locator('[data-screen="settings"]')).toBeVisible()
})
