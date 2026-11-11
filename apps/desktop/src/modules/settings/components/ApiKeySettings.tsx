import { useEffect, useState } from 'react'
import { Check, KeyRound, TestTube } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import {
  getMetadataCacheStats,
  getSetting,
  setSetting,
  testMetadataApiKeys,
} from '@/lib/tauri'

interface KeyFieldProps {
  id: string
  label: string
  description: string
  value: string
  placeholder: string
  saved: boolean
  order: number
  onChange: (value: string) => void
  onSave: () => void
}

function KeyField({
  id,
  label,
  description,
  value,
  placeholder,
  saved,
  order,
  onChange,
  onSave,
}: KeyFieldProps) {
  return (
    <div className="settings-key-field orbit-glass">
      <div className="flex items-start gap-3">
        <div className="orbit-glass-control mt-0.5 grid h-9 w-9 place-items-center rounded-full bg-orbit-accent/10 text-orbit-accent">
          <KeyRound size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-semibold">{label}</h3>
          <p className="mt-0.5 text-sm text-orbit-muted">{description}</p>
          <input
            type="password"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            className="orbit-glass-control mt-3 w-full rounded-card border border-orbit-border bg-orbit-canvas/50 px-4 py-3 text-sm text-orbit-foreground outline-none ring-orbit-focus focus:ring-2"
          />
          <div className="mt-3 flex items-center gap-3">
            <Focusable
              focusId={id}
              group="settings"
              order={order}
              noScale
              noRing
              onClick={() => void onSave()}
              className="rounded-card bg-orbit-accent px-4 py-2 text-sm font-semibold text-orbit-canvas"
            >
              Save key
            </Focusable>
            {saved && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-300">
                <Check size={14} />
                Saved
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

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
    <div className="space-y-5">
      <div>
        <p className="text-sm text-orbit-muted">
          Orbit fetches descriptions from{' '}
          <a
            href="https://api.thegamesdb.net/"
            className="text-orbit-accent underline-offset-2 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            TheGamesDB
          </a>{' '}
          and artwork from{' '}
          <a
            href="https://www.steamgriddb.com/"
            className="text-orbit-accent underline-offset-2 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            SteamGridDB
          </a>
          . Add keys here or in your project{' '}
          <code className="text-orbit-accent">.env</code>.
        </p>
        <p className="mt-2 text-sm text-orbit-muted">
          Cached metadata entries:{' '}
          <span className="font-medium text-orbit-foreground">
            {cacheGameCount == null ? '—' : cacheGameCount}
          </span>
        </p>
      </div>

      <KeyField
        id="settings-save-steamgrid"
        label="SteamGridDB API key"
        description="Bearer token from steamgriddb.com/profile/preferences. Required for game themes and artwork search."
        value={steamGridDbApiKey}
        placeholder="Paste your SteamGridDB bearer token"
        saved={steamGridSaved}
        order={21}
        onChange={setSteamGridDbApiKey}
        onSave={saveSteamGridKey}
      />

      <KeyField
        id="settings-save-thegamesdb"
        label="TheGamesDB API key"
        description="From api.thegamesdb.net. Used for game descriptions and metadata."
        value={theGamesDbApiKey}
        placeholder="Paste your TheGamesDB API key"
        saved={theGamesDbSaved}
        order={22}
        onChange={setTheGamesDbApiKey}
        onSave={saveTheGamesDbKey}
      />

      <KeyField
        id="settings-save-rawg"
        label="RAWG API key"
        description="Optional. Enables extra artwork sources in Edit Properties. Wikimedia Commons works without a key."
        value={rawgApiKey}
        placeholder="Paste your key from rawg.io/apidocs"
        saved={rawgSaved}
        order={25}
        onChange={setRawgApiKey}
        onSave={saveRawgKey}
      />

      <div className="orbit-glass-control flex flex-col gap-4 rounded-card border border-orbit-border/50 bg-orbit-canvas/30 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-display text-base font-semibold">
            Auto-enrich new imports
          </h3>
          <p className="mt-0.5 text-sm text-orbit-muted">
            Automatically fetch metadata when new games are imported.
          </p>
        </div>
        <Focusable
          focusId="settings-auto-enrich"
          group="settings"
          order={24}
          noScale
          noRing
          onClick={() => void toggleAutoEnrich()}
          className="orbit-glass-control rounded-card bg-white/10 px-4 py-2 text-sm"
        >
          {autoEnrichOnImport ? 'On' : 'Off'}
        </Focusable>
      </div>

      <div className="orbit-glass-control rounded-card border border-orbit-border/50 bg-orbit-canvas/30 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display text-base font-semibold">Test connections</h3>
            <p className="mt-0.5 text-sm text-orbit-muted">
              Verify your configured API keys are working.
            </p>
          </div>
          <Focusable
            focusId="settings-test-metadata-apis"
            group="settings"
            order={23}
            noScale
            noRing
            onClick={() => void runApiTest()}
            className="orbit-glass-control flex items-center gap-2 rounded-card bg-white/10 px-4 py-2 text-sm"
          >
            <TestTube size={15} />
            Test connections
          </Focusable>
        </div>
        {apiTestMessage && (
          <p className="mt-4 text-sm text-orbit-muted">{apiTestMessage}</p>
        )}
      </div>
    </div>
  )
}
