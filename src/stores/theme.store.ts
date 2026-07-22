import { create } from 'zustand'
import { BUILT_IN_THEMES, type ThemeDefinition, type ThemeId } from '@/themes/types'
import { getSetting, listCustomThemes, setSetting } from '@/lib/tauri'

interface ThemeState {
  themeId: string
  themes: ThemeDefinition[]
  ready: boolean
  applyTheme: (theme: ThemeDefinition) => void
  setThemeId: (id: string) => Promise<void>
  hydrate: () => Promise<void>
  refreshCustomThemes: () => Promise<void>
}

function applyCssVars(theme: ThemeDefinition) {
  const root = document.documentElement
  const { colors } = theme
  root.style.setProperty('--orbit-canvas', colors.canvas)
  root.style.setProperty('--orbit-surface', colors.surface)
  root.style.setProperty('--orbit-panel', colors.panel)
  root.style.setProperty('--orbit-foreground', colors.foreground)
  root.style.setProperty('--orbit-muted', colors.muted)
  root.style.setProperty('--orbit-accent', colors.accent)
  root.style.setProperty('--orbit-focus', colors.focus)
  root.style.setProperty('--orbit-border', colors.border)
  root.style.setProperty('--orbit-radius', theme.radius ?? '1.25rem')
  root.style.setProperty('--orbit-card-radius', theme.cardRadius ?? '1rem')
  root.style.setProperty('--orbit-blur', theme.blur ?? '24px')
  root.style.setProperty(
    '--orbit-motion-duration',
    theme.motion?.duration ?? '0.35s',
  )
  root.style.setProperty(
    '--orbit-motion-easing',
    theme.motion?.easing ?? 'cubic-bezier(0.22, 1, 0.36, 1)',
  )
  root.dataset.theme = theme.id
  root.dataset.bg = theme.backgroundStyle ?? 'radial'
  root.dataset.layout = theme.layout ?? 'orbit'

  const display = theme.fonts?.display ?? 'DM Sans'
  const body = theme.fonts?.body ?? 'DM Sans'
  root.style.setProperty('--orbit-font-display', `"${display}", system-ui, sans-serif`)
  root.style.setProperty('--orbit-font-body', `"${body}", system-ui, sans-serif`)

  // Derive color-scheme from canvas luminance for native form controls.
  const canvasParts = colors.canvas.split(/\s+/).map(Number)
  const luminance =
    canvasParts.length === 3
      ? (0.2126 * canvasParts[0] + 0.7152 * canvasParts[1] + 0.0722 * canvasParts[2]) / 255
      : 0.05
  root.style.colorScheme = luminance > 0.55 ? 'light' : 'dark'
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  themeId: 'orbit',
  themes: BUILT_IN_THEMES,
  ready: false,

  applyTheme: (theme) => {
    applyCssVars(theme)
    set({ themeId: theme.id })
  },

  setThemeId: async (id) => {
    const theme = get().themes.find((t) => t.id === id)
    if (!theme) return
    get().applyTheme(theme)
    try {
      await setSetting('themeId', id)
    } catch {
      // Browser / non-Tauri preview
      localStorage.setItem('orbit.themeId', id)
    }
  },

  refreshCustomThemes: async () => {
    try {
      const custom = await listCustomThemes()
      const byId = new Map<string, ThemeDefinition>()
      for (const theme of [...BUILT_IN_THEMES, ...custom]) {
        byId.set(theme.id, theme)
      }
      set({ themes: Array.from(byId.values()) })
    } catch {
      set({ themes: BUILT_IN_THEMES })
    }
  },

  hydrate: async () => {
    await get().refreshCustomThemes()
    let themeId: string = 'orbit'
    try {
      const saved = await getSetting<string>('themeId')
      if (typeof saved === 'string') {
        themeId = saved === 'steam-big-picture' ? 'orbit' : saved
      }
    } catch {
      const local = localStorage.getItem('orbit.themeId') ?? 'orbit'
      themeId = local === 'steam-big-picture' ? 'orbit' : local
    }

    const theme =
      get().themes.find((t) => t.id === themeId) ??
      BUILT_IN_THEMES.find((t) => t.id === 'orbit')!

    get().applyTheme(theme)
    set({ ready: true, themeId: theme.id })
  },
}))

export type { ThemeId }
