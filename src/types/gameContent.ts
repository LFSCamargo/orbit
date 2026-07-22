export interface GameContentSummary {
  gameId: string
  versionLabel?: string
  versionDetail?: string
  dlcCount: number
  updateCount: number
  dlcNames: string[]
  hasBase: boolean
}

export interface HomeContentInventory {
  summaries: GameContentSummary[]
}

export type GameContentMap = Record<string, GameContentSummary>

export function toContentMap(inventory: HomeContentInventory): GameContentMap {
  return Object.fromEntries(inventory.summaries.map((summary) => [summary.gameId, summary]))
}
