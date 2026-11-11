import { beforeEach, expect, it, vi } from 'vitest'
import { BUILT_IN_THEMES } from '@/themes/catalog'
import { useThemeStore } from '../theme.store'
import { loadThemeBranding, bundledThemeBranding } from '@/lib/themeArtwork'
import { listCustomThemes } from '@/lib/tauri'
vi.mock('@/lib/themeArtwork', () => ({
  loadThemeBranding: vi.fn(),
  bundledThemeBranding: vi.fn(),
}))
vi.mock('@/lib/tauri', () => ({
  setSetting: vi.fn().mockResolvedValue(undefined),
  getSetting: vi.fn().mockResolvedValue('ps5'),
  listCustomThemes: vi.fn().mockResolvedValue([]),
  saveCustomTheme: vi.fn(),
  deleteCustomTheme: vi.fn(),
}))
beforeEach(() => {
  vi.mocked(loadThemeBranding).mockReset()
  vi.mocked(bundledThemeBranding).mockReset().mockResolvedValue(undefined)
  vi.mocked(listCustomThemes).mockClear()
  useThemeStore.setState({
    themes: BUILT_IN_THEMES,
    themeId: 'liquid-glass',
    loadingTheme: false,
    themeError: null,
  })
})
it('leaves the current theme active when required artwork is missing', async () => {
  vi.mocked(loadThemeBranding).mockRejectedValue(new Error('No qualifying hero'))
  await useThemeStore.getState().setThemeId('god-of-war')
  expect(useThemeStore.getState().themeId).toBe('liquid-glass')
  expect(useThemeStore.getState().themeError).toBe('No qualifying hero')
  expect(useThemeStore.getState().loadingTheme).toBe(false)
})
it('ignores a late artwork download after selecting Liquid Glass', async () => {
  let finish!: (value: { logoImage: string; wallpaper: string }) => void
  vi.mocked(loadThemeBranding).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const pending = useThemeStore.getState().setThemeId('god-of-war')
  await useThemeStore.getState().setThemeId('liquid-glass')
  finish({ logoImage: 'logo', wallpaper: 'hero' })
  await pending
  expect(useThemeStore.getState().themeId).toBe('liquid-glass')
  expect(document.documentElement.dataset.theme).toBe('liquid-glass')
})
it('preserves downloaded artwork when refreshing custom themes', async () => {
  vi.mocked(loadThemeBranding).mockResolvedValue({ logoImage: 'logo', wallpaper: 'hero' })
  await useThemeStore.getState().setThemeId('god-of-war')
  await useThemeStore.getState().refreshCustomThemes()
  expect(
    useThemeStore.getState().themes.find((t) => t.id === 'god-of-war')?.branding
      ?.logoImage,
  ).toBe('logo')
  await useThemeStore.getState().setThemeId('god-of-war')
  expect(loadThemeBranding).toHaveBeenCalledTimes(1)
})

it('shares an in-flight catalog read across concurrent bootstrap or reload requests', async () => {
  let finish!: (themes: typeof BUILT_IN_THEMES) => void
  vi.mocked(listCustomThemes).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const first = useThemeStore.getState().refreshCustomThemes()
  const second = useThemeStore.getState().refreshCustomThemes()
  expect(listCustomThemes).toHaveBeenCalledTimes(1)
  finish([])
  await Promise.all([first, second])
})
it('hydrates retired presets as Liquid Glass without fetching artwork', async () => {
  await useThemeStore.getState().hydrate()
  expect(useThemeStore.getState().themeId).toBe('liquid-glass')
  expect(loadThemeBranding).not.toHaveBeenCalled()
})

it('applies custom theme colors to CSS variables', () => {
  const custom = {
    ...BUILT_IN_THEMES[0],
    id: 'custom-red',
    kind: 'custom' as const,
    colors: {
      canvas: '20 0 0',
      surface: '40 0 0',
      panel: '60 0 0',
      foreground: '255 220 220',
      muted: '200 150 150',
      accent: '255 0 0',
      focus: '255 100 100',
      border: '100 50 50',
    },
  }
  useThemeStore.getState().applyTheme(custom)
  const root = document.documentElement
  expect(root.style.getPropertyValue('--orbit-canvas')).toBe('20 0 0')
  expect(root.style.getPropertyValue('--orbit-accent')).toBe('255 0 0')
  expect(root.style.getPropertyValue('--orbit-foreground')).toBe('255 220 220')
})

it('selects bundled artwork, persists the selection, and restores it on hydrate', async () => {
  const { getSetting, setSetting } = await import('@/lib/tauri')
  vi.mocked(bundledThemeBranding).mockResolvedValue({
    logoImage: 'logo',
    wallpaper: 'hero',
  })
  await useThemeStore.getState().setThemeId('cyberpunk-2077')
  expect(useThemeStore.getState().themeId).toBe('cyberpunk-2077')
  expect(setSetting).toHaveBeenLastCalledWith('themeId', 'cyberpunk-2077')
  expect(document.documentElement.style.getPropertyValue('--theme-wallpaper')).toContain(
    'hero',
  )
  vi.mocked(getSetting).mockResolvedValueOnce('cyberpunk-2077')
  useThemeStore.setState({ themeId: 'liquid-glass', themes: BUILT_IN_THEMES })
  await useThemeStore.getState().hydrate()
  expect(useThemeStore.getState().themeId).toBe('cyberpunk-2077')
  expect(document.documentElement.dataset.theme).toBe('cyberpunk-2077')
  expect(loadThemeBranding).not.toHaveBeenCalled()
})
