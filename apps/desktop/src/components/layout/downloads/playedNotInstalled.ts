import { isNonGameApp } from '@/lib/nonGames'
import type { LibraryEntry } from '@/types/library'

/** How many played-but-not-installed games the sidebar suggests. */
const PLAYED_LIMIT = 5

/** Games you have played that are not on this Mac: most played first, then
 * the ones played without tracked time by recency. O(n log n). */
export function playedNotInstalled(entries: LibraryEntry[], limit = PLAYED_LIMIT) {
  return entries
    .filter(
      ({ game, steamAppId, installations }) =>
        !game.hidden &&
        !isNonGameApp(steamAppId, game.title) &&
        !installations.some((installation) => installation.available) &&
        (game.totalPlaytimeSeconds > 0 || Boolean(game.lastPlayedAt)),
    )
    .sort(
      (a, b) =>
        b.game.totalPlaytimeSeconds - a.game.totalPlaytimeSeconds ||
        (b.game.lastPlayedAt ?? '').localeCompare(a.game.lastPlayedAt ?? ''),
    )
    .slice(0, limit)
}
