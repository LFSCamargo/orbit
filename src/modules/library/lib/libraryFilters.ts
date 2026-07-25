import type { Game, LibrarySort } from '@/types/game'
import type { LibraryFilters } from '@/types/game'

export function filterLibraryGames(games: Game[], filters: LibraryFilters): Game[] {
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
}

export function sortGames(a: Game, b: Game, sort: LibrarySort) {
  switch (sort) {
    case 'recently-played':
      return (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? '')
    case 'recently-added':
      return b.dateAdded.localeCompare(a.dateAdded)
    case 'playtime':
      return b.totalPlaytimeSeconds - a.totalPlaytimeSeconds
    case 'provider':
      return (
        a.provider.localeCompare(b.provider) || a.sortTitle.localeCompare(b.sortTitle)
      )
    case 'alphabetical':
    default:
      return a.sortTitle.localeCompare(b.sortTitle)
  }
}
