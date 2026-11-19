import { CloudOff, Search, SearchX } from 'lucide-react'
import { EmptyState } from '@/components/feedback/EmptyState'
import { LibrarySkeleton } from './LibrarySkeleton'
import { useMemo, useState } from 'react'
import { LIBRARY_SQUARE_GRID_CLASS } from '@/components/game/SquareGameArt'
import { Focusable } from '@/components/focus/Focusable'
import { useSteamWindows } from '@/hooks/useSteamWindows'
import { filterSteamOwnedGames, type SteamOwnedView } from '@/lib/steamOwnedFilter'
import { useUiStore } from '@/stores/ui.store'
import { SteamGameCard } from './SteamGameCard'

const VIEWS: Array<{ id: SteamOwnedView; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'not-installed', label: 'Not installed' },
  { id: 'installed', label: 'Installed' },
]

/** Owned Windows Steam games. Search covers the full catalog (≤ 2,000). */
export function NotInstalledGames({ refreshing = false }: { refreshing?: boolean }) {
  const { status, library } = useSteamWindows()
  const openSteamGame = useUiStore((state) => state.openSteamGame)
  const signedIn = status.data?.signedIn === true
  const loading = signedIn && (refreshing || library.isPending || library.isFetching)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<SteamOwnedView>('all')
  const pending = useMemo(
    () => filterSteamOwnedGames(library.data ?? [], query, view),
    [library.data, query, view],
  )

  return (
    <section className="relative mb-8" aria-labelledby="library-not-installed-title">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 id="library-not-installed-title" className="text-xl font-semibold">
          Steam games
        </h2>
        {pending.length > 0 && !loading && (
          <p className="text-sm text-orbit-muted">
            {pending.length} of {(library.data ?? []).length}{' '}
            {(library.data ?? []).length === 1 ? 'game' : 'games'}
          </p>
        )}
      </div>
      <p className="mb-4 mt-1 text-sm text-orbit-muted">
        {status.data?.signedIn
          ? 'Search your full owned library. Open a game to download it or play an install Orbit already has.'
          : 'Sign in from Settings → Steam. Steam’s own window opens, then Orbit closes it and keeps the login.'}
      </p>
      {signedIn && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="relative min-w-48 flex-1">
            <Search size={16} className="absolute left-3 top-3 text-orbit-muted" />
            <span className="sr-only">Search Steam games</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title or app id"
              className="orbit-glass-control w-full rounded-xl bg-white/5 py-2.5 pl-9 pr-3 text-sm"
            />
          </label>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Steam library view"
          >
            {VIEWS.map((item, order) => (
              <Focusable
                key={item.id}
                focusId={`library-steam-view-${item.id}`}
                group="library-steam-view"
                order={order}
                noScale
                aria-pressed={view === item.id}
                onClick={() => setView(item.id)}
                className={
                  view === item.id
                    ? 'rounded-full bg-orbit-accent px-3 py-1.5 text-xs text-orbit-canvas'
                    : 'orbit-glass-control rounded-full bg-white/10 px-3 py-1.5 text-xs'
                }
              >
                {item.label}
              </Focusable>
            ))}
          </div>
        </div>
      )}
      <div className="relative min-h-[12rem]" aria-busy={loading ? 'true' : 'false'}>
        {loading && !library.data && <LibrarySkeleton label="Loading Steam library" />}
        {loading && library.data && (
          <p role="status" className="mb-3 text-orbit-muted">
            Updating Steam library…
          </p>
        )}
        {library.isError && (
          <p role="alert" className="mb-3 text-rose-300">
            Could not load Steam games. Use Refresh Steam library to try again.
          </p>
        )}
        {!loading && signedIn && !library.isError && pending.length === 0 && (
          <EmptyState
            icon={query ? SearchX : CloudOff}
            title={
              query ? `No Steam games match “${query}”` : 'Everything here is installed'
            }
            description={
              query
                ? 'Check the spelling, or try a shorter title.'
                : 'Games you own on Steam but have not installed appear here.'
            }
          />
        )}
        <div className={LIBRARY_SQUARE_GRID_CLASS}>
          {pending.map((game, index) => (
            <SteamGameCard
              key={game.appId}
              game={game}
              order={index}
              onOpen={(next) =>
                openSteamGame({
                  appId: next.appId,
                  title: next.title,
                  description: next.description,
                  coverUrl: next.coverUrl,
                  heroUrl: next.heroUrl,
                  installed: next.installed,
                })
              }
            />
          ))}
        </div>
      </div>
    </section>
  )
}
