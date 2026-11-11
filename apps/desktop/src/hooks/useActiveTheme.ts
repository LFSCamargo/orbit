import { useThemeStore } from '@/stores/theme.store'
import { defaultTheme } from '@/themes/catalog'
import type { ThemeDefinition } from '@/themes/types'

export function useActiveTheme(): ThemeDefinition {
  const themeId = useThemeStore((s) => s.themeId)
  const themes = useThemeStore((s) => s.themes)
  return themes.find((theme) => theme.id === themeId) ?? defaultTheme()
}
