import type { InfiniteData } from '@tanstack/react-query'
import type { LibraryPageResult } from '@/types/library'
import type { SteamOwnedGame } from '@/types/steam'

/** Steam apps the store types as "game" that are tools, so the backend's
 * app-type filter lets them through. Hidden from every Orbit list. */
const NON_GAME_APP_IDS = new Set([
  '920490', // Driver Booster for Steam
])
const NON_GAME_TITLES = [/\bdriver booster\b/i]

export function isNonGameApp(appId: string | null | undefined, title: string): boolean {
  return (
    (appId != null && NON_GAME_APP_IDS.has(appId)) ||
    NON_GAME_TITLES.some((pattern) => pattern.test(title))
  )
}

export function withoutNonGameEntries(
  data: InfiniteData<LibraryPageResult, number>,
): InfiniteData<LibraryPageResult, number> {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      entries: page.entries.filter(
        (entry) => !isNonGameApp(entry.steamAppId, entry.game.title),
      ),
    })),
  }
}

export function withoutNonGameOwned(games: SteamOwnedGame[]): SteamOwnedGame[] {
  return games.filter((game) => !isNonGameApp(game.appId, game.title))
}
