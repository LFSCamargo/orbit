import { useThemeStore } from '@/stores/theme.store'
import type { ThemeDefinition } from '@/themes/types'

export type ThemeLayout = 'orbit' | 'ps5' | 'switch'

export function useThemeLayout(): ThemeLayout {
  const themeId = useThemeStore((s) => s.themeId)
  const themes = useThemeStore((s) => s.themes)
  const layout = themes.find((theme) => theme.id === themeId)?.layout ?? 'orbit'
  if (layout === 'ps5' || layout === 'switch') return layout
  return 'orbit'
}

export function resolveLayout(theme: ThemeDefinition): ThemeLayout {
  if (theme.layout === 'ps5' || theme.layout === 'switch') return theme.layout
  return 'orbit'
}
