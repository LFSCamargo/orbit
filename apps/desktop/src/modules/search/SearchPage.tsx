import { useMemo } from 'react'
import { Search } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { useGames } from '@/hooks/useGames'
import { CollectionGrid } from '@/modules/library/components/CollectionGrid'
import { ConnectedGames } from '@/modules/library/components/ConnectedGames'
import { useUiStore } from '@/stores/ui.store'
import { ThemePage } from '@/themes/ThemePage'

export function SearchPage() {
  const { data: games = [] } = useGames()
  const query = useUiStore((s) => s.libraryFilters.query)
  const setLibraryFilters = useUiStore((s) => s.setLibraryFilters)

  const results = useMemo(() => {
    const term = query.trim().toLowerCase()
    return games
      .filter(
        (game) =>
          !game.hidden &&
          (!term ||
            [game.title, game.provider, game.platform].some((value) =>
              value.toLowerCase().includes(term),
            )),
      )
      .sort((a, b) => a.sortTitle.localeCompare(b.sortTitle))
  }, [games, query])

  return (
    <ThemePage title="Search">
      <h1 className="mb-5 text-3xl font-semibold tracking-tight">Search</h1>
      <div className="mb-8 flex items-center gap-3">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search your collection</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/45" />
          <input
            value={query}
            onChange={(event) => setLibraryFilters({ query: event.target.value })}
            placeholder="Find a game…"
            className="orbit-glass-control w-full rounded-full border border-white/10 bg-white/5 py-4 pl-12 pr-4 text-lg outline-none ring-white/40 focus:ring-2"
          />
        </label>
        <Focusable
          focusId="search-clear"
          group="search-actions"
          order={0}
          noScale
          onClick={() => setLibraryFilters({ query: '' })}
          className="orbit-glass-control rounded-card bg-white/10 px-4 py-2 text-sm"
        >
          Clear
        </Focusable>
      </div>
      <CollectionGrid games={results} screen="search" />
      <ConnectedGames query={query} screen="search" />
    </ThemePage>
  )
}
