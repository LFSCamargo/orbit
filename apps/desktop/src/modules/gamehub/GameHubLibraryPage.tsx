import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Download,
  ExternalLink,
  Gamepad2,
  RefreshCw,
  Search,
  Check,
  Power,
} from 'lucide-react'
import { ThemePage } from '@/themes/ThemePage'
import { Focusable } from '@/components/focus/Focusable'
import { getGameHubLibrary, getSetting, openGameHub, setSetting } from '@/lib/tauri'
import { isTauriRuntime } from '@/lib/devMockApi'
import { useGameActions } from '@/hooks/useGames'
import type { GameHubStore } from '@/types/gamehub'

const stores = [
  { id: 'steam', label: 'Steam' },
  { id: 'gog', label: 'GOG' },
  { id: 'epic', label: 'Epic Games' },
] as const
const pageSize = 12
export function GameHubLibraryPage() {
  const client = useQueryClient()
  const [query, setQuery] = useState('')
  const [store, setStore] = useState<'all' | GameHubStore>('all')
  const [view, setView] = useState<'all' | 'installed' | 'downloads'>('all')
  const [page, setPage] = useState(0)
  const [handoff, setHandoff] = useState(false)
  const { scanGamehub } = useGameActions()
  const library = useQuery({
    queryKey: ['gamehub-library'],
    queryFn: getGameHubLibrary,
    refetchInterval: 5000,
  })
  const background = useQuery({
    queryKey: ['settings', 'gameHubBackground'],
    queryFn: () => getSetting<boolean>('gameHubBackground'),
  })
  const start = useMutation({
    mutationFn: async () => {
      await openGameHub(false)
      await setSetting('gameHubBackground', true)
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['settings', 'gameHubBackground'] })
      await library.refetch()
    },
  })
  const disable = useMutation({
    mutationFn: () => setSetting('gameHubBackground', false),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['settings', 'gameHubBackground'] }),
  })
  const manage = useMutation({
    mutationFn: () => openGameHub(true),
    onSuccess: () => setHandoff(true),
  })
  const games = library.data?.games
  const filtered = useMemo(
    () =>
      (games ?? []).filter(
        (game) =>
          (store === 'all' || game.store === store) &&
          game.title.toLowerCase().includes(query.trim().toLowerCase()) &&
          (view === 'all' ||
            (view === 'installed'
              ? game.installed
              : game.phase && game.phase !== 'completed')),
      ),
    [games, query, store, view],
  )
  const lastPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1)
  const currentPage = Math.min(page, lastPage)
  const error =
    library.error || start.error || disable.error || manage.error || scanGamehub.error
  return (
    <ThemePage
      title="GameHub library"
      eyebrow="CONNECTED PLAY"
      subtitle="Your Steam, GOG, and Epic games. GameHub handles installations; Orbit keeps you close to your collection."
    >
      {!isTauriRuntime() && (
        <p className="orbit-glass-control mb-5 rounded-xl bg-amber-300/10 p-3 text-xs text-amber-100">
          Browser preview · sample library and download status. No games are installed or
          external apps opened.
        </p>
      )}
      <section
        className="orbit-panel mb-6 rounded-theme p-6"
        aria-label="GameHub connection"
      >
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold">
              <span
                className={`h-2 w-2 rounded-full ${library.data?.running ? 'bg-emerald-300' : 'orbit-glass-control bg-white/30'}`}
              />
              {library.isPending
                ? 'Checking GameHub…'
                : library.data?.running
                  ? 'GameHub is running'
                  : library.data?.available
                    ? 'GameHub is stopped'
                    : 'GameHub not detected'}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-orbit-muted">
              {background.data
                ? 'Background mode enabled. Orbit restarts GameHub if it closes while Orbit is open.'
                : 'Enable background mode to keep GameHub ready while you browse Orbit.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Focusable
              focusId="gamehub-background"
              group="gamehub-actions"
              order={0}
              noScale
              disabled={!library.data?.available || start.isPending || disable.isPending}
              onClick={() => (background.data ? disable.mutate() : start.mutate())}
              className="orbit-glass-control flex items-center gap-2 rounded-xl bg-orbit-accent/15 px-4 py-3 text-xs font-semibold text-orbit-accent"
            >
              <Power size={15} />
              {start.isPending || disable.isPending
                ? 'Updating…'
                : background.data
                  ? 'Disable background mode'
                  : 'Keep running in background'}
            </Focusable>
            <Focusable
              focusId="gamehub-open"
              group="gamehub-actions"
              order={1}
              noScale
              disabled={!library.data?.available || manage.isPending}
              onClick={() => manage.mutate()}
              className="orbit-glass-control flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-xs font-semibold"
            >
              <ExternalLink size={15} />
              {manage.isPending ? 'Opening…' : 'Install / manage in GameHub'}
            </Focusable>
          </div>
        </div>
      </section>
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-white/10 p-5">
          <Download className="mb-3 h-5 w-5 text-orbit-accent" />
          <h2 className="text-sm font-semibold">Install with GameHub</h2>
          <p className="mt-2 text-xs leading-6 text-orbit-muted">
            Open GameHub, connect your store account, and choose a game to install. Return
            to Orbit to monitor cached download progress. GameHub does not expose a
            supported external installer; Orbit cannot start, pause, or cancel its
            downloads.
          </p>
          {handoff && (
            <p role="status" className="mt-3 text-xs text-orbit-accent">
              GameHub was opened. Start the installation there; this page refreshes every
              five seconds.
            </p>
          )}
        </section>
        <section className="rounded-2xl border border-white/10 p-5">
          <Gamepad2 className="mb-3 h-5 w-5 text-orbit-accent" />
          <h2 className="text-sm font-semibold">Bring installed games into Orbit</h2>
          <p className="mt-2 text-xs leading-6 text-orbit-muted">
            Create a desktop shortcut in GameHub, then sync shortcuts to add its launch
            action and artwork to your Orbit collection.
          </p>
          <Focusable
            focusId="gamehub-sync"
            group="gamehub-actions"
            order={2}
            noScale
            disabled={scanGamehub.isPending}
            onClick={() => scanGamehub.mutate(undefined)}
            className="orbit-glass-control mt-3 rounded-xl bg-white/10 px-4 py-2 text-xs"
          >
            {scanGamehub.isPending ? 'Syncing…' : 'Sync GameHub shortcuts'}
          </Focusable>
          {scanGamehub.data && (
            <p role="status" className="mt-3 text-xs text-orbit-muted">
              Synced {scanGamehub.data.imported} shortcuts.
            </p>
          )}
        </section>
      </div>
      {error && (
        <p
          role="alert"
          className="orbit-glass-control mb-4 rounded-xl bg-rose-400/10 p-4 text-sm text-rose-200"
        >
          {String(error)}
        </p>
      )}
      {library.data?.warnings.map((warning) => (
        <p key={warning} role="status" className="mb-3 text-xs text-amber-100">
          {warning}
        </p>
      ))}
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            Local games & downloads
          </h2>
          <p className="mt-1 text-xs text-orbit-muted">
            Cached GameHub records, not your full owned store library.{' '}
            {library.data &&
              `Checked ${new Date(library.data.capturedAt).toLocaleTimeString()}.`}
          </p>
        </div>
        <Focusable
          focusId="gamehub-refresh"
          group="gamehub-actions"
          order={3}
          noScale
          disabled={library.isFetching}
          onClick={() => void library.refetch()}
          className="orbit-glass-control bg-white/8 flex items-center gap-2 rounded-xl px-4 py-2 text-xs"
        >
          <RefreshCw size={14} />
          Refresh
        </Focusable>
      </header>
      <div className="mb-4 flex flex-wrap gap-3">
        <label className="relative min-w-48 flex-1">
          <Search size={16} className="absolute left-3 top-3 text-orbit-muted" />
          <span className="sr-only">Search GameHub games</span>
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(0)
            }}
            placeholder="Search GameHub games…"
            className="orbit-glass-control w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-orbit-focus"
          />
        </label>
        <label>
          <span className="sr-only">Store</span>
          <select
            aria-label="Store"
            value={store}
            onChange={(event) => {
              setStore(event.target.value as typeof store)
              setPage(0)
            }}
            className="h-10 rounded-xl border border-white/10 bg-orbit-surface px-3 text-sm"
          >
            <option value="all">All stores</option>
            {stores.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Show games</span>
          <select
            aria-label="Show games"
            value={view}
            onChange={(event) => {
              setView(event.target.value as typeof view)
              setPage(0)
            }}
            className="h-10 rounded-xl border border-white/10 bg-orbit-surface px-3 text-sm"
          >
            <option value="all">All records</option>
            <option value="installed">Installed paths</option>
            <option value="downloads">Downloads</option>
          </select>
        </label>
      </div>
      {library.isPending ? (
        <p role="status" className="py-12 text-center text-orbit-muted">
          Reading GameHub’s local library…
        </p>
      ) : !filtered.length ? (
        <div className="rounded-2xl border border-dashed border-white/15 px-6 py-12 text-center">
          <Gamepad2 className="mx-auto mb-4 text-orbit-muted" />
          <h3 className="font-semibold">
            {query || store !== 'all' || view !== 'all'
              ? 'No matching records'
              : 'No cached games yet'}
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-orbit-muted">
            Open GameHub and install or sync a game there, then refresh. Games that only
            exist in your online account are managed in GameHub.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered
            .slice(currentPage * pageSize, (currentPage + 1) * pageSize)
            .map((game) => (
              <article key={game.id} className="orbit-panel rounded-2xl p-5">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-orbit-accent">
                    {stores.find((item) => item.id === game.store)?.label}
                  </span>
                  {game.installed && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-200">
                      <Check size={12} />
                      Path available
                    </span>
                  )}
                </div>
                <h3 className="text-base font-semibold">{game.title}</h3>
                {game.phase && (
                  <div className="mt-4">
                    <p className="mb-2 flex justify-between text-xs text-orbit-muted">
                      <span className="capitalize">{game.phase}</span>
                      <span>
                        {game.percent == null
                          ? 'Progress unavailable'
                          : `${Math.round(game.percent)}%`}
                      </span>
                    </p>
                    {game.percent != null && (
                      <progress
                        aria-label={`${game.title} download progress`}
                        value={game.percent}
                        max={100}
                        className="h-1.5 w-full accent-orbit-accent"
                      />
                    )}
                  </div>
                )}
              </article>
            ))}
        </div>
      )}
      {filtered.length > pageSize && (
        <nav
          aria-label="GameHub pagination"
          className="mt-6 flex items-center justify-center gap-4"
        >
          <Focusable
            focusId="gamehub-previous"
            group="gamehub-pagination"
            order={0}
            noScale
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
            className="orbit-glass-control rounded-xl bg-white/10 px-4 py-2 text-xs disabled:opacity-30"
          >
            Previous
          </Focusable>
          <span className="text-xs text-orbit-muted">
            Page {currentPage + 1} of {lastPage + 1}
          </span>
          <Focusable
            focusId="gamehub-next"
            group="gamehub-pagination"
            order={1}
            noScale
            disabled={currentPage === lastPage}
            onClick={() => setPage(currentPage + 1)}
            className="orbit-glass-control rounded-xl bg-white/10 px-4 py-2 text-xs disabled:opacity-30"
          >
            Next
          </Focusable>
        </nav>
      )}
    </ThemePage>
  )
}
