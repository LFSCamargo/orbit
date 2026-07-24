import { useEffect, useState } from 'react'
import { Focusable } from '@/components/focus/Focusable'
import {
  getMetadataCacheStats,
  getSetting,
  setSetting,
  testMetadataApiKeys,
} from '@/lib/tauri'

export function ApiKeySettings() {
  const [rawgApiKey, setRawgApiKey] = useState('')
  const [rawgSaved, setRawgSaved] = useState(false)
  const [theGamesDbApiKey, setTheGamesDbApiKey] = useState('')
  const [theGamesDbSaved, setTheGamesDbSaved] = useState(false)
  const [steamGridDbApiKey, setSteamGridDbApiKey] = useState('')
  const [steamGridSaved, setSteamGridSaved] = useState(false)
  const [autoEnrichOnImport, setAutoEnrichOnImport] = useState(true)
  const [cacheGameCount, setCacheGameCount] = useState<number | null>(null)
  const [apiTestMessage, setApiTestMessage] = useState<string | null>(null)

  useEffect(() => {
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
  }, [])

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
    <>
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
    </>
  )
}
