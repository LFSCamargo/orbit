interface GameContentSummary {
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
