import type { SteamOwnedGame } from '@/types/steam'

export type SteamOwnedView = 'all' | 'installed' | 'not-installed'

function matchesQuery(game: SteamOwnedGame, term: string) {
  return !term || game.title.toLowerCase().includes(term) || game.appId.includes(term)
}

/** O(n) title/app-id filter plus one title sort. n is the owned catalog (≤ 2,000). */
export function filterSteamOwnedGames(
  games: SteamOwnedGame[],
  query: string,
  view: SteamOwnedView = 'all',
): SteamOwnedGame[] {
  const term = query.trim().toLowerCase()
  return games
    .filter((game) => {
      if (!matchesQuery(game, term)) return false
      if (view === 'installed') return game.installed
      if (view === 'not-installed') return !game.installed
      return true
    })
    .sort((left, right) => left.title.localeCompare(right.title))
}
