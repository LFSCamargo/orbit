import { groupBySource, SOURCE_LABELS, type GameSource } from '@/lib/gameSource'
import { isNonGameApp } from '@/lib/nonGames'
import type { LibraryEntry } from '@/types/library'

export type ScanPhaseId = 'paths' | 'detect' | 'details'
export type ScanPhaseState = 'waiting' | 'running' | 'done' | 'failed'

/** In order; weights sum to 100 and drive the overall bar. */
export const SCAN_PHASES: { id: ScanPhaseId; label: string; weight: number }[] = [
  { id: 'paths', label: 'Scanning library paths', weight: 40 },
  { id: 'detect', label: 'Detecting installed games', weight: 30 },
  { id: 'details', label: 'Fetching game details', weight: 30 },
]

/** Scans report no byte progress, so a running phase counts as half done. */
export function scanPercent(states: Record<ScanPhaseId, ScanPhaseState>): number {
  return Math.round(
    SCAN_PHASES.reduce((sum, phase) => {
      const state = states[phase.id]
      if (state === 'done' || state === 'failed') return sum + phase.weight
      if (state === 'running') return sum + phase.weight / 2
      return sum
    }, 0),
  )
}

const LABELS: Record<GameSource, string> = {
  ...SOURCE_LABELS,
  other: 'Mac apps & other games',
}

/** Installed games after the scan, by where they play from. */
export function summarizeFound(entries: LibraryEntry[]) {
  const games = entries.filter(
    (entry) => !isNonGameApp(entry.steamAppId, entry.game.title),
  )
  return {
    games,
    total: games.length,
    bySource: groupBySource(games).map(({ source, entries: group }) => ({
      source,
      label: LABELS[source],
      count: group.length,
    })),
  }
}
