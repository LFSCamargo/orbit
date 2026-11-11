import type { Game } from '@/types/game'

export function homeHero(games: Game[], selectedId: string | null): Game | undefined {
  let latest: Game | undefined
  for (const game of games) {
    if (game.hidden) continue
    if (game.id === selectedId) return game
    if (!latest || (game.lastPlayedAt ?? '') > (latest.lastPlayedAt ?? '')) latest = game
  }
  return latest
}
