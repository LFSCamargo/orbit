import { useMemo } from 'react'
import { Search } from 'lucide-react'
import { GameCard } from '@/components/game/GameCard'
import { Focusable } from '@/components/focus/Focusable'
import { useGames } from '@/hooks/useGames'
import { useUiStore } from '@/stores/ui.store'
import { ThemePage } from '@/themes/ThemePage'
import { useThemeLayout } from '@/themes/useThemeLayout'

export function SearchPage() {
  const { data: games = [] } = useGames()
  const filters = useUiStore((s) => s.libraryFilters)
  const setLibraryFilters = useUiStore((s) => s.setLibraryFilters)
  const openGameDetails = useUiStore((s) => s.openGameDetails)
  const setHeroGameId = useUiStore((s) => s.setHeroGameId)
  const layout = useThemeLayout()
  const isThemedShell = layout === 'switch' || layout === 'ps5'
  const cardVariant = isThemedShell ? 'square' : 'portrait'

  const results = useMemo(() => {
    const q = filters.query.trim().toLowerCase()
    if (!q) return []
    return games
      .filter((game) => !game.hidden)
      .filter(
        (game) =>
          game.title.toLowerCase().includes(q) ||
          game.provider.toLowerCase().includes(q) ||
          game.platform.toLowerCase().includes(q),
      )
      .slice(0, 40)
  }, [games, filters.query])

  const inputClass = isThemedShell
    ? 'w-full rounded-xl border border-white/10 bg-white/5 py-4 pl-12 pr-4 text-lg text-[var(--ps5-ink,var(--switch-ink))] outline-none ring-white/40 focus:ring-2'
    : 'w-full rounded-card border border-orbit-border bg-orbit-surface py-4 pl-12 pr-4 text-lg text-orbit-foreground outline-none ring-orbit-focus focus:ring-2'

  const gridClass = isThemedShell
    ? 'mt-10 grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-4'
    : 'mt-10 grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-4'

  return (
    <ThemePage title="Search" subtitle="Find games in your library" eyebrow="Library">
      <div className="relative max-w-2xl">
        <Search
          className={`pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 ${
            isThemedShell ? 'text-white/45' : 'text-orbit-muted'
          }`}
        />
        <input
          value={filters.query}
          onChange={(event) => setLibraryFilters({ query: event.target.value })}
          placeholder="Find a game…"
          className={inputClass}
          autoFocus
        />
      </div>

      <div className="mt-4 flex gap-2">
        <Focusable
          focusId="search-clear"
          group="search-actions"
          order={0}
          noScale
          noRing
          onClick={() => setLibraryFilters({ query: '' })}
          className={`rounded-card px-4 py-2 text-sm ${
            isThemedShell ? 'bg-white/10 text-white/70' : 'bg-white/8 text-orbit-muted'
          }`}
        >
          Clear
        </Focusable>
      </div>

      <div className={gridClass}>
        {results.map((game, index) => (
          <GameCard
            key={game.id}
            game={game}
            variant={cardVariant}
            className="w-full"
            focusId={`search-game-${game.id}`}
            group="search-grid"
            order={index}
            onSelect={() => setHeroGameId(game.id)}
            onOpen={() => openGameDetails(game.id)}
          />
        ))}
      </div>

      {filters.query && results.length === 0 && (
        <p className={`mt-10 ${isThemedShell ? 'text-white/55' : 'text-orbit-muted'}`}>
          No games matched “{filters.query}”.
        </p>
      )}
    </ThemePage>
  )
}
