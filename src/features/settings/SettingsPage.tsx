import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { Focusable } from '@/components/focus/Focusable'
import { useGameActions } from '@/hooks/useGames'
import { useFullscreen } from '@/hooks/useFullscreen'
import {
  getMetadataCacheStats,
  getSetting,
  setSetting,
  testMetadataApiKeys,
  themesDirectory,
} from '@/lib/tauri'
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
  const [theGamesDbApiKey, setTheGamesDbApiKey] = useState('')
  const [theGamesDbSaved, setTheGamesDbSaved] = useState(false)
  const [steamGridDbApiKey, setSteamGridDbApiKey] = useState('')
  const [steamGridSaved, setSteamGridSaved] = useState(false)
  const [autoEnrichOnImport, setAutoEnrichOnImport] = useState(true)
  const [cacheGameCount, setCacheGameCount] = useState<number | null>(null)
  const [apiTestMessage, setApiTestMessage] = useState<string | null>(null)
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
    void getSetting<string>('theGamesDbApiKey')
      .then((value) => setTheGamesDbApiKey(value ?? ''))
      .catch(() => setTheGamesDbApiKey(''))
    void getSetting<string>('steamGridDbApiKey')
      .then((value) => setSteamGridDbApiKey(value ?? ''))
      .catch(() => setSteamGridDbApiKey(''))
    void getSetting<boolean>('autoEnrichOnImport')
      .then((value) => setAutoEnrichOnImport(value ?? true))
      .catch(() => setAutoEnrichOnImport(true))
    void getMetadataCacheStats()
      .then((stats) => setCacheGameCount(stats.gameCount))
      .catch(() => setCacheGameCount(null))
  }, [refreshCustomThemes])

  const saveRawgKey = async () => {
    await setSetting('rawgApiKey', rawgApiKey.trim())
    setRawgSaved(true)
    window.setTimeout(() => setRawgSaved(false), 2000)
  }

  const saveTheGamesDbKey = async () => {
    await setSetting('theGamesDbApiKey', theGamesDbApiKey.trim())
    setTheGamesDbSaved(true)
    window.setTimeout(() => setTheGamesDbSaved(false), 2000)
  }

  const saveSteamGridKey = async () => {
    await setSetting('steamGridDbApiKey', steamGridDbApiKey.trim())
    setSteamGridSaved(true)
    window.setTimeout(() => setSteamGridSaved(false), 2000)
  }

  const toggleAutoEnrich = async () => {
    const next = !autoEnrichOnImport
    setAutoEnrichOnImport(next)
    await setSetting('autoEnrichOnImport', next)
  }

  const runApiTest = async () => {
    setApiTestMessage(null)
    try {
      const result = await testMetadataApiKeys()
      setApiTestMessage(result.message)
    } catch (error) {
      setApiTestMessage(error instanceof Error ? error.message : 'Connection test failed')
    }
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
            Pick a built-in look or drop a JSON theme into your Orbit themes folder.
            Themes change the entire app layout — not just colors. See{' '}
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
              Create a <code className="text-orbit-accent">.json</code> file in your
              themes folder, then reload themes below.
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
          <h2 className="font-display text-xl font-semibold">Metadata & artwork</h2>
          <p className="mt-1 text-sm text-orbit-muted">
            Orbit fetches game descriptions from{' '}
            <a
              href="https://api.thegamesdb.net/"
              className="text-orbit-accent underline-offset-2 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              TheGamesDB
            </a>{' '}
            and Steam artwork from{' '}
            <a
              href="https://www.steamgriddb.com/"
              className="text-orbit-accent underline-offset-2 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              SteamGridDB
            </a>
            . Keys can live in your project <code className="text-orbit-accent">.env</code>{' '}
            (<code>THE_GAMES_DB_API_KEY</code>, <code>STEAMGRIDDB_API_KEY</code>) or be saved
            here.
          </p>
          <p className="mt-2 text-sm text-orbit-muted">
            Cached metadata entries:{' '}
            <span className="text-orbit-foreground">
              {cacheGameCount == null ? '—' : cacheGameCount}
            </span>
          </p>

          <label className="mt-4 block text-sm text-orbit-muted">
            TheGamesDB API key
            <input
              type="password"
              value={theGamesDbApiKey}
              onChange={(event) => setTheGamesDbApiKey(event.target.value)}
              placeholder="From api.thegamesdb.net (or THE_GAMES_DB_API_KEY in .env)"
              className="mt-2 w-full rounded-card border border-orbit-border bg-orbit-surface px-4 py-3 text-orbit-foreground outline-none ring-orbit-focus focus:ring-2"
            />
          </label>
          <label className="mt-4 block text-sm text-orbit-muted">
            SteamGridDB API key
            <input
              type="password"
              value={steamGridDbApiKey}
              onChange={(event) => setSteamGridDbApiKey(event.target.value)}
              placeholder="Bearer token from steamgriddb.com/profile/preferences"
              className="mt-2 w-full rounded-card border border-orbit-border bg-orbit-surface px-4 py-3 text-orbit-foreground outline-none ring-orbit-focus focus:ring-2"
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Focusable
              focusId="settings-save-thegamesdb"
              group="settings"
              order={21}
              noScale
              noRing
              onClick={() => void saveTheGamesDbKey()}
              className="rounded-card bg-orbit-accent px-4 py-2 text-sm font-semibold text-orbit-canvas"
            >
              Save TheGamesDB key
            </Focusable>
            {theGamesDbSaved && <span className="text-sm text-emerald-300">Saved</span>}
            <Focusable
              focusId="settings-save-steamgrid"
              group="settings"
              order={22}
              noScale
              noRing
              onClick={() => void saveSteamGridKey()}
              className="rounded-card bg-orbit-accent px-4 py-2 text-sm font-semibold text-orbit-canvas"
            >
              Save SteamGridDB key
            </Focusable>
            {steamGridSaved && <span className="text-sm text-emerald-300">Saved</span>}
            <Focusable
              focusId="settings-test-metadata-apis"
              group="settings"
              order={23}
              noScale
              noRing
              onClick={() => void runApiTest()}
              className="rounded-card bg-white/10 px-4 py-2 text-sm"
            >
              Test connections
            </Focusable>
            <Focusable
              focusId="settings-auto-enrich"
              group="settings"
              order={24}
              noScale
              noRing
              onClick={() => void toggleAutoEnrich()}
              className="rounded-card bg-white/10 px-4 py-2 text-sm"
            >
              Auto-enrich new imports: {autoEnrichOnImport ? 'On' : 'Off'}
            </Focusable>
          </div>
          {apiTestMessage && (
            <p className="mt-3 text-sm text-orbit-muted">{apiTestMessage}</p>
          )}
        </div>

        <div className="orbit-panel rounded-theme p-5">
          <h2 className="font-display text-xl font-semibold">Artwork search</h2>
          <p className="mt-1 text-sm text-orbit-muted">
            Optional RAWG API key for manual artwork search in Edit Properties. Wikimedia
            Commons works without a key.
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
              order={25}
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
              className="bg-rose-500/12 rounded-card px-4 py-2 text-sm font-semibold text-rose-300 disabled:opacity-40"
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
