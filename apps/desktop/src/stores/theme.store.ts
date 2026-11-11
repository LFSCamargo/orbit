import { create } from 'zustand'
import {
  BUILT_IN_THEMES,
  DEFAULT_THEME_ID,
  defaultTheme,
  resolveThemeId,
} from '@/themes/catalog'
import type { ThemeDefinition } from '@/themes/types'
import {
  deleteCustomTheme,
  getSetting,
  listCustomThemes,
  saveCustomTheme,
  setSetting,
} from '@/lib/tauri'
import { loadThemeBranding, bundledThemeBranding } from '@/lib/themeArtwork'
import { cssUrl, mediaSrc } from '@/lib/media'

interface ThemeState {
  themeId: string
  themes: ThemeDefinition[]
  ready: boolean
  loadingTheme: boolean
  themeError: string | null
  applyTheme: (theme: ThemeDefinition) => void
  setThemeId: (id: string) => Promise<void>
  hydrate: () => Promise<void>
  refreshCustomThemes: () => Promise<void>
  saveTheme: (theme: ThemeDefinition) => Promise<ThemeDefinition>
  deleteTheme: (id: string) => Promise<void>
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
  root.style.setProperty('--orbit-radius', theme.radius ?? '1.5rem')
  root.style.setProperty('--orbit-card-radius', theme.cardRadius ?? '1.125rem')
  root.style.setProperty('--orbit-blur', theme.blur ?? '28px')
  root.style.setProperty('--orbit-motion-duration', theme.motion?.duration ?? '0.4s')
  root.style.setProperty(
    '--orbit-motion-easing',
    theme.motion?.easing ?? 'cubic-bezier(0.16, 1, 0.3, 1)',
  )
  const wallpaper = mediaSrc(theme.branding?.wallpaper)
  if (wallpaper) root.style.setProperty('--theme-wallpaper', cssUrl(wallpaper))
  else root.style.removeProperty('--theme-wallpaper')
  root.dataset.theme = theme.id
  root.dataset.themeKind = theme.kind ?? 'custom'

  const display = theme.fonts?.display ?? '-apple-system'
  const body = theme.fonts?.body ?? '-apple-system'
  root.style.setProperty('--orbit-font-display', `"${display}", system-ui, sans-serif`)
  root.style.setProperty('--orbit-font-body', `"${body}", system-ui, sans-serif`)

  // Derive color-scheme from canvas luminance for native form controls.
  const canvasParts = colors.canvas.split(/\s+/).map(Number)
  const luminance =
    canvasParts.length === 3
      ? (0.2126 * canvasParts[0] + 0.7152 * canvasParts[1] + 0.0722 * canvasParts[2]) /
        255
      : 0.05
  root.style.colorScheme = luminance > 0.55 ? 'light' : 'dark'
}

function mergeThemes(
  custom: ThemeDefinition[],
  builtIns = BUILT_IN_THEMES,
): ThemeDefinition[] {
  const byId = new Map<string, ThemeDefinition>()
  for (const theme of [...builtIns, ...custom]) byId.set(theme.id, theme)
  return Array.from(byId.values())
}

let selectionRequest = 0
let catalogRequest: Promise<void> | null = null

export const useThemeStore = create<ThemeState>((set, get) => ({
  themeId: DEFAULT_THEME_ID,
  themes: BUILT_IN_THEMES,
  ready: false,
  loadingTheme: false,
  themeError: null,

  applyTheme: (theme) => {
    applyCssVars(theme)
    set({ themeId: theme.id })
  },

  setThemeId: async (id) => {
    const ticket = ++selectionRequest
    let theme = get().themes.find((t) => t.id === id)
    if (!theme) return
    set({ loadingTheme: false, themeError: null })
    if (theme.kind === 'game' && !theme.branding?.logoImage) {
      set({ loadingTheme: true })
      try {
        const bundled = await bundledThemeBranding(theme.id)
        if (ticket !== selectionRequest) return
        if (bundled?.logoImage || bundled?.wallpaper) {
          theme = {
            ...theme,
            branding: { ...(theme.branding ?? {}), ...bundled },
          }
        } else {
          const branding = await loadThemeBranding(
            theme.branding?.artworkQuery ?? theme.name,
          )
          if (ticket !== selectionRequest) return
          theme = { ...theme, branding }
        }
        set({ themes: get().themes.map((item) => (item.id === id ? theme! : item)) })
      } catch (error) {
        if (ticket === selectionRequest)
          set({ themeError: error instanceof Error ? error.message : String(error) })
        return
      } finally {
        if (ticket === selectionRequest) set({ loadingTheme: false })
      }
    }
    if (ticket !== selectionRequest) return
    get().applyTheme(theme)
    try {
      await setSetting('themeId', id)
    } catch {
      // Browser / non-Tauri preview
      localStorage.setItem('orbit.themeId', id)
    }
  },

  refreshCustomThemes: () => {
    if (catalogRequest) return catalogRequest
    catalogRequest = (async () => {
      try {
        set({
          themes: mergeThemes(
            await listCustomThemes(),
            get().themes.filter((theme) => theme.kind !== 'custom'),
          ),
        })
      } catch {
        set({ themes: BUILT_IN_THEMES })
      } finally {
        catalogRequest = null
      }
    })()
    return catalogRequest
  },

  saveTheme: async (theme) => {
    const saved = await saveCustomTheme(theme)
    set({
      themes: mergeThemes([...get().themes.filter((t) => t.id !== saved.id), saved]),
    })
    await get().setThemeId(saved.id)
    return saved
  },

  deleteTheme: async (id) => {
    await deleteCustomTheme(id)
    set({ themes: get().themes.filter((t) => t.id !== id) })
    if (get().themeId === id) await get().setThemeId(DEFAULT_THEME_ID)
  },

  hydrate: async () => {
    await get().refreshCustomThemes()
    let saved: unknown = null
    try {
      saved = await getSetting<string>('themeId')
    } catch {
      saved = localStorage.getItem('orbit.themeId')
    }
    const themeId = resolveThemeId(saved, get().themes)
    let theme = get().themes.find((t) => t.id === themeId) ?? defaultTheme()
    if (theme.kind === 'game' && !theme.branding?.logoImage) {
      const bundled = await bundledThemeBranding(theme.id)
      if (bundled?.logoImage || bundled?.wallpaper) {
        theme = { ...theme, branding: { ...(theme.branding ?? {}), ...bundled } }
        set({ themes: get().themes.map((item) => (item.id === theme.id ? theme : item)) })
      }
    }
    get().applyTheme(theme)
    set({ ready: true })
    if (theme.kind === 'game' && !theme.branding?.logoImage) {
      await get().setThemeId(theme.id)
    }
  },
}))
