import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { Focusable } from '@/components/focus/Focusable'
import { useGameActions } from '@/hooks/useGames'
import { useFullscreen } from '@/hooks/useFullscreen'
import { getSetting, setSetting, themesDirectory } from '@/lib/tauri'
import { useThemeStore } from '@/stores/theme.store'
import { useUiStore } from '@/stores/ui.store'
import { useSessionStore } from '@/stores/session.store'
import { ThemePage } from '@/themes/ThemePage'
import { ImportsSection } from '@/features/imports/ImportsPage'

export function SettingsPage() {
  const { fullscreen, setFullscreen } = useFullscreen()
  const setScreen = useUiStore((s) => s.setScreen)
  const setSelectedGameId = useUiStore((s) => s.setSelectedGameId)
  const setHeroGameId = useUiStore((s) => s.setHeroGameId)
  const themes = useThemeStore((s) => s.themes)
  const themeId = useThemeStore((s) => s.themeId)
  const setThemeId = useThemeStore((s) => s.setThemeId)
  const refreshCustomThemes = useThemeStore((s) => s.refreshCustomThemes)
  const [themesPath, setThemesPath] = useState<string | null>(null)
  const [rawgApiKey, setRawgApiKey] = useState('')
  const [rawgSaved, setRawgSaved] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const { clear } = useGameActions()
  const activeSession = useSessionStore((s) => s.activeSession)

  useEffect(() => {
    void refreshCustomThemes()
    void themesDirectory()
      .then(setThemesPath)
      .catch(() => setThemesPath(null))
    void getSetting<string>('rawgApiKey')
      .then((value) => setRawgApiKey(value ?? ''))
      .catch(() => setRawgApiKey(''))
  }, [refreshCustomThemes])

  const saveRawgKey = async () => {
    await setSetting('rawgApiKey', rawgApiKey.trim())
    setRawgSaved(true)
    window.setTimeout(() => setRawgSaved(false), 2000)
  }

  return (
    <ThemePage
      title="Settings"
      subtitle="Controller-first launcher preferences, including fully customizable themes."
    >
      <div className="max-w-3xl space-y-4">
        <SettingRow
          title="Fullscreen"
          description="Borderless fullscreen suited for couch play. Toggle with F11."
          action={
            <Focusable
              focusId="settings-fullscreen"
              group="settings"
              order={0}
              noScale
              noRing
              onClick={() => setFullscreen(!fullscreen)}
              className="rounded-card bg-orbit-accent px-4 py-2 text-sm font-semibold text-orbit-canvas"
            >
              {fullscreen ? 'On' : 'Off'}
            </Focusable>
          }
        />

        <div className="orbit-panel rounded-theme p-5">
          <h2 className="font-display text-xl font-semibold">Interface theme</h2>
          <p className="mt-1 text-sm text-orbit-muted">
            Pick a built-in look or drop a JSON theme into your Orbit themes folder. Themes change
            the entire app layout — not just colors. See{' '}
            <span className="text-orbit-foreground">docs/THEMES.md</span> for the full authoring
            guide.
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
                  className={`rounded-card p-4 text-left ring-1 orbit-transition ${
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
              Create a <code className="text-orbit-accent">.json</code> file in your themes folder,
              then reload themes below.
            </p>
            {themesPath && (
              <p className="mt-2 truncate text-xs opacity-80">{themesPath}</p>
            )}
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

        <ImportsSection />

        <div className="orbit-panel rounded-theme p-5">
          <h2 className="font-display text-xl font-semibold">Artwork search</h2>
          <p className="mt-1 text-sm text-orbit-muted">
            Optional RAWG API key for higher-quality cover art in Edit Properties. Wikimedia Commons
            works without a key.
          </p>
          <label className="mt-4 block text-sm text-orbit-muted">
            RAWG API key
            <input
              type="password"
              value={rawgApiKey}
              onChange={(event) => setRawgApiKey(event.target.value)}
              placeholder="Paste your key from rawg.io/apidocs"
              className="mt-2 w-full rounded-card border border-orbit-border bg-orbit-surface px-4 py-3 text-orbit-foreground outline-none ring-orbit-focus focus:ring-2"
            />
          </label>
          <div className="mt-3 flex items-center gap-3">
            <Focusable
              focusId="settings-save-rawg"
              group="settings"
              order={21}
              noScale
              noRing
              onClick={() => void saveRawgKey()}
              className="rounded-card bg-orbit-accent px-4 py-2 text-sm font-semibold text-orbit-canvas"
            >
              Save key
            </Focusable>
            {rawgSaved && <span className="text-sm text-emerald-300">Saved</span>}
          </div>
        </div>

        <SettingRow
          title="Clear library"
          description="Remove every game and Orbit play record. Game files stay untouched."
          action={
            <Focusable
              focusId="settings-clear-library"
              group="settings"
              order={29}
              noScale
              disabled={Boolean(activeSession)}
              onClick={() => setConfirmClear(true)}
              className="rounded-card bg-rose-500/12 px-4 py-2 text-sm font-semibold text-rose-300 disabled:opacity-40"
            >
              {activeSession ? 'Stop game first' : 'Clear'}
            </Focusable>
          }
        />

        <SettingRow
          title="Back to Home"
          description="Return to the cinematic home rows."
          action={
            <Focusable
              focusId="settings-home"
              group="settings"
              order={30}
              noScale
              noRing
              onClick={() => setScreen('home')}
              className="rounded-card bg-white/10 px-4 py-2 text-sm"
            >
              Home
            </Focusable>
          }
        />
      </div>
      <ConfirmDialog
        open={confirmClear}
        title="Clear your entire library?"
        description="All games, play sessions, and property overrides will be removed from Orbit. Installed game files are never deleted."
        confirmLabel="Clear library"
        busy={clear.isPending}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          void clear.mutateAsync().then(() => {
            setConfirmClear(false)
            setSelectedGameId(null)
            setHeroGameId(null)
            setScreen('home')
          })
        }}
      />
    </ThemePage>
  )
}

function SettingRow({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action: ReactNode
}) {
  return (
    <div className="orbit-panel flex items-center justify-between gap-6 rounded-theme p-5">
      <div>
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-orbit-muted">{description}</p>
      </div>
      {action}
    </div>
  )
}
