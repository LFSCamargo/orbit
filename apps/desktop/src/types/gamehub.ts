export type GameHubStore = 'steam' | 'gog' | 'epic'
export interface GameHubEntry {
  id: string
  store: GameHubStore
  title: string
  installed: boolean
  phase: string | null
  percent: number | null
}
export interface GameHubLibrary {
  available: boolean
  running: boolean
  games: GameHubEntry[]
  warnings: string[]
  capturedAt: string
  directInstallSupported: boolean
}
