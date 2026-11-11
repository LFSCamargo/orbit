import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import type { GameProvider, LibrarySort } from '@/types/game'
import { useMutation } from '@tanstack/react-query'
import { openSteamLibrary, isTauriRuntime } from '@/lib/tauri'
import { ConnectedGames } from './components/ConnectedGames'
import { CollectionGrid } from './components/CollectionGrid'
import { Focusable } from '@/components/focus/Focusable'
import { useGameActions, useGames } from '@/hooks/useGames'
import { filterLibraryGames } from '@/modules/library/lib/libraryFilters'
import { useUiStore } from '@/stores/ui.store'
import { ThemePage } from '@/themes/ThemePage'

const PROVIDERS: GameProvider[] = ['astris', 'steam', 'gamehub', 'native', 'manual']
const SORTS: Array<{ id: LibrarySort; label: string }> = [
  { id: 'alphabetical', label: 'A–Z' },
  { id: 'recently-played', label: 'Recent' },
  { id: 'recently-added', label: 'Added' },
  { id: 'playtime', label: 'Playtime' },
  { id: 'provider', label: 'Provider' },
]

export function LibraryPage() {
  const { data: games = [], isLoading } = useGames()
  const filters = useUiStore((s) => s.libraryFilters)
  const setLibraryFilters = useUiStore((s) => s.setLibraryFilters)
  const setScreen = useUiStore((s) => s.setScreen)

  const [view, setView] = useState<'All games' | 'Orbit' | 'Connected'>('All games')
  const { scanSteam } = useGameActions()
  const steam = useMutation({ mutationFn: openSteamLibrary })
  const filtered = useMemo(
    () => filterLibraryGames(games, { ...filters, query: '' }),
    [games, filters],
  )

  return (
    <ThemePage title="Library" subtitle={`${filtered.length} games`}>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Library</h1>
        <div className="flex flex-wrap gap-2">
          <Focusable
            focusId="library-steam-library"
            group="library-stores"
            order={0}
            noScale
            disabled={steam.isPending}
            onClick={() => steam.mutate()}
            className="orbit-glass-control rounded-xl bg-white/10 px-4 py-2 text-sm"
          >
            Open Steam library
          </Focusable>
          <Focusable
            focusId="library-steam-sync"
            group="library-stores"
            order={1}
            noScale
            disabled={scanSteam.isPending}
            onClick={() => scanSteam.mutate()}
            className="orbit-glass-control rounded-xl bg-white/10 px-4 py-2 text-sm"
          >
            {scanSteam.isPending ? 'Syncing Steam…' : 'Sync Steam installs'}
          </Focusable>
          <Focusable
            focusId="library-gamehub-manager"
            group="library-stores"
            order={2}
            noScale
            onClick={() => setScreen('gamehub-library')}
            className="orbit-glass-control rounded-xl bg-white/10 px-4 py-2 text-sm"
          >
            GameHub downloads
          </Focusable>
        </div>
      </header>
      {scanSteam.isError && (
        <p role="alert" className="mb-3 text-sm text-rose-300">
          {String(scanSteam.error)}
        </p>
      )}
      {scanSteam.isSuccess && (
        <p role="status" className="mb-3 text-sm text-orbit-muted">
          Steam sync complete · {scanSteam.data.imported} imported.
        </p>
      )}
      {steam.isError && (
        <p role="alert" className="mb-3 text-sm text-rose-300">
          {String(steam.error)}
        </p>
      )}
      {steam.isSuccess && !isTauriRuntime() && (
        <p role="status" className="mb-3 text-sm text-orbit-muted">
          Preview · Steam library requested.
        </p>
      )}
      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Library view">
        {(['All games', 'Orbit', 'Connected'] as const).map((item, order) => (
          <Focusable
            key={item}
            focusId={`library-view-${order}`}
            group="library-view"
            order={order}
            noScale
            aria-pressed={view === item}
            onClick={() => setView(item)}
            className={clsx(
              'rounded-full px-4 py-2 text-sm',
              view === item
                ? 'bg-orbit-accent text-orbit-canvas'
                : 'orbit-glass-control bg-white/10',
            )}
          >
            {item}
          </Focusable>
        ))}
      </div>
      {view !== 'Connected' && (
        <>
          <div
            className="mb-4 flex flex-wrap gap-2"
            role="group"
            aria-label="Sort Orbit games"
          >
            {SORTS.map((sort, index) => (
              <Focusable
                key={sort.id}
                focusId={`library-sort-${sort.id}`}
                group="library-filters"
                order={index}
                noScale
                noRing
                onClick={() => setLibraryFilters({ sort: sort.id })}
                className={clsx(
                  'rounded-xl px-3 py-2 text-sm',
                  filters.sort === sort.id
                    ? 'orbit-glass-control bg-orbit-accent/20 text-orbit-accent'
                    : 'orbit-glass-control bg-white/8 text-orbit-muted',
                )}
              >
                {sort.label}
              </Focusable>
            ))}
            <Focusable
              focusId="library-favorites"
              group="library-filters"
              order={SORTS.length}
              noScale
              noRing
              onClick={() => setLibraryFilters({ favoritesOnly: !filters.favoritesOnly })}
              className={clsx(
                'rounded-xl px-3 py-2 text-sm',
                filters.favoritesOnly
                  ? 'orbit-glass-control bg-rose-500/30 text-rose-100'
                  : 'orbit-glass-control bg-white/8 text-orbit-muted',
              )}
            >
              Favorites
            </Focusable>
          </div>

          <div className="mb-6 flex flex-wrap gap-2">
            {PROVIDERS.map((provider, index) => {
              const active = filters.providers.includes(provider)
              return (
                <Focusable
                  key={provider}
                  focusId={`library-provider-${provider}`}
                  group="library-providers"
                  order={index}
                  noScale
                  noRing
                  onClick={() => {
                    const next = active
                      ? filters.providers.filter((item) => item !== provider)
                      : [...filters.providers, provider]
                    setLibraryFilters({ providers: next })
                  }}
                  className={clsx(
                    'rounded-full px-3 py-1.5 text-xs uppercase tracking-wider',
                    active
                      ? 'orbit-glass-control bg-orbit-accent/90 text-orbit-canvas'
                      : 'orbit-glass-control bg-white/8 text-orbit-muted',
                  )}
                >
                  {provider}
                </Focusable>
              )
            })}
          </div>

          {isLoading ? (
            <p className="text-orbit-muted">Loading…</p>
          ) : (
            <CollectionGrid games={filtered} screen="library" />
          )}
        </>
      )}
      {view !== 'Orbit' && <ConnectedGames query="" screen="library" />}
    </ThemePage>
  )
}
