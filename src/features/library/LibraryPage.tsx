import { useMemo } from 'react'
import { clsx } from 'clsx'
import type { Game, GameProvider, LibrarySort } from '@/types/game'
import { GameCard } from '@/components/game/GameCard'
import { Focusable } from '@/components/focus/Focusable'
import { useGames } from '@/hooks/useGames'
import { useUiStore } from '@/stores/ui.store'
import { ThemePage } from '@/themes/ThemePage'
import { useThemeLayout } from '@/themes/useThemeLayout'

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
  const openGameDetails = useUiStore((s) => s.openGameDetails)
  const setHeroGameId = useUiStore((s) => s.setHeroGameId)
  const layout = useThemeLayout()
  const cardVariant = layout === 'switch' || layout === 'ps5' ? 'square' : 'portrait'

  const filtered = useMemo(() => {
    let list = [...games]
    if (!filters.showHidden) list = list.filter((game) => !game.hidden)
    if (filters.favoritesOnly) list = list.filter((game) => game.favorite)
    if (filters.providers.length > 0) {
      list = list.filter((game) => filters.providers.includes(game.provider))
    }
    if (filters.query.trim()) {
      const q = filters.query.trim().toLowerCase()
      list = list.filter((game) => game.title.toLowerCase().includes(q))
    }

    list.sort((a, b) => sortGames(a, b, filters.sort))
    return list
  }, [games, filters])

  return (
    <ThemePage title="Library" subtitle={`${filtered.length} games`}>
      <div className="mb-6 flex flex-wrap gap-2">
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
                ? 'bg-orbit-accent/20 text-orbit-accent'
                : 'bg-white/8 text-orbit-muted',
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
            filters.favoritesOnly ? 'bg-rose-500/30 text-rose-100' : 'bg-white/8 text-orbit-muted',
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
                active ? 'bg-orbit-accent/90 text-orbit-canvas' : 'bg-white/8 text-orbit-muted',
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
        <div
          className={clsx(
            'gap-4',
            layout === 'ps5'
              ? 'grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))]'
              : layout === 'switch'
                ? 'grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]'
                : 'grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]',
          )}
        >
          {filtered.map((game, index) => (
            <GameCard
              key={game.id}
              game={game}
              variant={cardVariant}
              className="w-full"
              focusId={`library-game-${game.id}`}
              group="library-grid"
              order={index}
              onSelect={() => setHeroGameId(game.id)}
              onOpen={() => openGameDetails(game.id)}
            />
          ))}
        </div>
      )}
    </ThemePage>
  )
}

function sortGames(a: Game, b: Game, sort: LibrarySort) {
  switch (sort) {
    case 'recently-played':
      return (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? '')
    case 'recently-added':
      return b.dateAdded.localeCompare(a.dateAdded)
    case 'playtime':
      return b.totalPlaytimeSeconds - a.totalPlaytimeSeconds
    case 'provider':
      return a.provider.localeCompare(b.provider) || a.sortTitle.localeCompare(b.sortTitle)
    case 'alphabetical':
    default:
      return a.sortTitle.localeCompare(b.sortTitle)
  }
}
