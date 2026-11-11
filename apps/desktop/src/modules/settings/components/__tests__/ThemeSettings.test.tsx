import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DrawerProvider } from '@/components/layout/DrawerProvider'
import { listCustomThemes, themesDirectory } from '@/lib/tauri'
import { useThemeStore } from '@/stores/theme.store'
import { BUILT_IN_THEMES } from '@/themes/catalog'
import { ThemeSettings } from '../ThemeSettings'

vi.mock('@/lib/tauri', () => ({
  listCustomThemes: vi.fn().mockResolvedValue([]),
  themesDirectory: vi.fn().mockResolvedValue('/themes'),
  isTauriRuntime: () => false,
}))
vi.mock('../../hooks/useThemePreviews', () => ({
  useThemePreviews: () => ({ previews: {}, preparing: false }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  useThemeStore.setState({ themes: BUILT_IN_THEMES, themeId: 'liquid-glass' })
})
afterEach(cleanup)

it('reuses the hydrated catalog on entry and remount, reloading only on request', async () => {
  const view = () =>
    render(
      <DrawerProvider>
        <ThemeSettings />
      </DrawerProvider>,
    )
  const first = view()
  await waitFor(() => expect(themesDirectory).toHaveBeenCalledTimes(1))
  first.unmount()
  view()
  await waitFor(() => expect(themesDirectory).toHaveBeenCalledTimes(2))
  expect(listCustomThemes).not.toHaveBeenCalled()
  vi.mocked(listCustomThemes).mockResolvedValueOnce([
    {
      ...BUILT_IN_THEMES[0],
      id: 'custom-refreshed',
      name: 'Refreshed theme',
      kind: 'custom',
    },
  ])
  fireEvent.click(screen.getByRole('button', { name: 'Reload custom themes' }))
  await screen.findByText('Refreshed theme')
  expect(listCustomThemes).toHaveBeenCalledTimes(1)
  expect(
    useThemeStore.getState().themes.some((theme) => theme.id === 'custom-refreshed'),
  ).toBe(true)
})
