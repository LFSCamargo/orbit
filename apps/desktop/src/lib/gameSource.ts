import type { Game } from '@/types/game'

/** Where a game plays from, shown as a tile icon and a Library section. */
export type GameSource = 'steam-mac' | 'steam-windows' | 'astris' | 'xcloud' | 'other'

const SOURCE_ORDER: GameSource[] = [
  'steam-mac',
  'steam-windows',
  'astris',
  'xcloud',
  'other',
]

export const SOURCE_LABELS: Record<GameSource, string> = {
  'steam-mac': 'Steam · Mac',
  'steam-windows': 'Steam · Windows',
  astris: 'Astris',
  xcloud: 'Xbox Cloud Gaming',
  other: 'Other games',
}

export function gameSource(game: Pick<Game, 'provider' | 'platform'>): GameSource {
  if (game.provider === 'steam') {
    if (game.platform === 'macos') return 'steam-mac'
    if (game.platform === 'windows') return 'steam-windows'
  }
  if (game.provider === 'astris') return 'astris'
  if (game.provider === 'xcloud') return 'xcloud'
  return 'other'
}

/** One section per source in `SOURCE_ORDER`, keeping the entries' order. O(n). */
export function groupBySource<T extends { game: Pick<Game, 'provider' | 'platform'> }>(
  entries: T[],
): { source: GameSource; entries: T[] }[] {
  const groups = new Map<GameSource, T[]>()
  for (const entry of entries) {
    const source = gameSource(entry.game)
    const group = groups.get(source)
    if (group) group.push(entry)
    else groups.set(source, [entry])
  }
  return SOURCE_ORDER.filter((source) => groups.has(source)).map((source) => ({
    source,
    entries: groups.get(source)!,
  }))
}
