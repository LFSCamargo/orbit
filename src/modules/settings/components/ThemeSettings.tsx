import { motion } from 'framer-motion'
import { Focusable } from '@/components/focus/Focusable'
import { themesDirectory } from '@/lib/tauri'
import { useThemeStore } from '@/stores/theme.store'
import { useEffect, useState } from 'react'

export function ThemeSettings() {
  const themes = useThemeStore((s) => s.themes)
  const themeId = useThemeStore((s) => s.themeId)
  const setThemeId = useThemeStore((s) => s.setThemeId)
  const refreshCustomThemes = useThemeStore((s) => s.refreshCustomThemes)
  const [themesPath, setThemesPath] = useState<string | null>(null)

  useEffect(() => {
    void refreshCustomThemes()
    void themesDirectory()
      .then(setThemesPath)
      .catch(() => setThemesPath(null))
  }, [refreshCustomThemes])

  return (
    <div className="orbit-panel rounded-theme p-5">
      <h2 className="font-display text-xl font-semibold">Interface theme</h2>
      <p className="mt-1 text-sm text-orbit-muted">
        Pick a built-in look or drop a JSON theme into your Orbit themes folder. Themes
        change the entire app layout — not just colors. See{' '}
        <span className="text-orbit-foreground">docs/THEMES.md</span> for the full
        authoring guide.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {themes.map((theme, index) => {
          const active = theme.id === themeId
          return (
            <Focusable
              key={theme.id}
              focusId={`settings-theme-${theme.id}`}
              group="settings-themes"
              order={index}
              noScale
              noRing
              onClick={() => void setThemeId(theme.id)}
              className={`orbit-transition rounded-card p-4 text-left ring-1 ${
                active
                  ? 'bg-transparent ring-orbit-accent'
                  : 'bg-transparent ring-white/10'
              }`}
            >
              <div className="mb-3 flex gap-1.5">
                {[
                  theme.colors.canvas,
                  theme.colors.panel,
                  theme.colors.accent,
                  theme.colors.foreground,
                ].map((swatch) => (
                  <span
                    key={swatch}
                    className="h-4 w-4 rounded-full ring-1 ring-black/20"
                    style={{ background: `rgb(${swatch})` }}
                  />
                ))}
              </div>
              <p className="font-display text-lg font-semibold">{theme.name}</p>
              <p className="mt-1 text-xs leading-relaxed text-orbit-muted">
                {theme.description}
              </p>
              {active && (
                <motion.span
                  layoutId="theme-active"
                  className="mt-3 inline-block text-[10px] uppercase tracking-wider text-orbit-accent"
                >
                  Active
                </motion.span>
              )}
            </Focusable>
          )
        })}
      </div>

      <div className="mt-5 rounded-card bg-white/5 p-4 text-sm text-orbit-muted">
        <p className="font-medium text-orbit-foreground">Custom theme</p>
        <p className="mt-1">
          Create a <code className="text-orbit-accent">.json</code> file in your themes
          folder, then reload themes below.
        </p>
        {themesPath && <p className="mt-2 truncate text-xs opacity-80">{themesPath}</p>}
        <Focusable
          focusId="settings-refresh-themes"
          group="settings"
          order={20}
          noScale
          noRing
          onClick={() => void refreshCustomThemes()}
          className="mt-3 rounded-card bg-white/10 px-4 py-2 text-sm"
        >
          Reload custom themes
        </Focusable>
      </div>
    </div>
  )
}
