import { useEffect, useMemo, useState } from 'react'
import { Focusable } from '@/components/focus/Focusable'
import { useActiveTheme } from '@/hooks/useActiveTheme'
import { isTauriRuntime } from '@/lib/devMockApi'
import { themesDirectory } from '@/lib/tauri'
import { useThemeStore } from '@/stores/theme.store'
import type { ThemeDefinition } from '@/themes/types'
import { ThemeCard } from './ThemeCard'
import { useThemePreviews } from '../hooks/useThemePreviews'
import { ThemeStudio } from './ThemeStudio'

const SECTIONS = [
  { kind: 'color', title: 'Liquid Glass' },
  { kind: 'game', title: 'Game themes' },
  { kind: 'custom', title: 'Your themes' },
] as const

export function ThemeSettings() {
  const { previews, preparing } = useThemePreviews()
  const themes = useThemeStore((s) => s.themes)
  const setThemeId = useThemeStore((s) => s.setThemeId)
  const refreshCustomThemes = useThemeStore((s) => s.refreshCustomThemes)
  const active = useActiveTheme()
  const loadingTheme = useThemeStore((s) => s.loadingTheme)
  const themeError = useThemeStore((s) => s.themeError)
  const [themesPath, setThemesPath] = useState<string | null>(null)

  useEffect(() => {
    void themesDirectory()
      .then(setThemesPath)
      .catch(() => setThemesPath(null))
  }, [])

  const sections = useMemo(() => {
    const byKind = new Map<string, ThemeDefinition[]>()
    for (const theme of themes) {
      const kind = theme.kind ?? 'custom'
      const section = byKind.get(kind)
      if (section) section.push(theme)
      else byKind.set(kind, [theme])
    }
    let order = 0
    return SECTIONS.map((section) => ({
      ...section,
      themes: (byKind.get(section.kind) ?? []).map((theme) => ({
        theme,
        order: order++,
      })),
    })).filter((section) => section.themes.length > 0)
  }, [themes])

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-orbit-muted">
          Built-in themes include their artwork. Use Theme Studio to create a theme with
          images from connected sources.
        </p>

        {!isTauriRuntime() && (
          <p className="mt-2 text-sm text-orbit-muted">
            Artwork searches use sample results in the browser preview.
          </p>
        )}
        {loadingTheme && (
          <p role="status" className="mt-3 text-sm text-orbit-muted">
            Loading theme artwork…
          </p>
        )}
        {themeError && (
          <p role="alert" className="mt-3 text-sm text-rose-300">
            {themeError}
          </p>
        )}
      </div>

      {sections.map((section) => (
        <div key={section.kind} className="space-y-3">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-[0.2em] text-orbit-muted">
            {section.title}
          </h3>
          <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(min(100%,13rem),1fr))] gap-3">
            {section.themes.map(({ theme, order }) => (
              <ThemeCard
                key={theme.id}
                theme={theme}
                order={order}
                active={theme.id === active.id}
                prepared={previews[theme.id]}
                preparing={theme.kind === 'game' && preparing && !previews[theme.id]}
                onSelect={(id) => void setThemeId(id)}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="orbit-glass-control rounded-card border border-orbit-border/50 bg-orbit-canvas/30 p-4 text-sm text-orbit-muted">
        <p className="font-medium text-orbit-foreground">Theme files</p>
        <p className="mt-1">
          Saved and hand-written <code className="text-orbit-accent">.json</code> themes
          live in your themes folder. See docs/THEMES.md for the format.
        </p>
        {themesPath && <p className="mt-2 truncate text-xs opacity-80">{themesPath}</p>}
        <Focusable
          focusId="settings-refresh-themes"
          group="settings"
          order={20}
          noScale
          noRing
          onClick={() => void refreshCustomThemes()}
          className="orbit-glass-control mt-3 rounded-card bg-white/10 px-4 py-2 text-sm"
        >
          Reload custom themes
        </Focusable>
      </div>

      <ThemeStudio key={active.id} base={active} />
    </div>
  )
}
