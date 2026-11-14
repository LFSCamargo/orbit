import type { Game, GamePlatform } from './game'

export interface LibraryInstallation {
  id: string
  gameId: string
  platform: GamePlatform
  path: string | null
  available: boolean
  launchType: string
}
export interface LibraryRunInfo {
  minimum?: string | null
  recommended?: string | null
  protonTier?: string | null
}
export interface LibraryEntry {
  id: string
  game: Game
  steamAppId: string | null
  owned: boolean
  installations: LibraryInstallation[]
  preferredInstallationId: string | null
  runInfo?: LibraryRunInfo | null
}
export interface LibraryEntryPatch {
  favorite?: boolean
  hidden?: boolean
  preferredInstallationId?: string
}
export interface LibraryQuery {
  query?: string
  view?: 'installed' | 'all' | 'favorites'
  sort?: string
  platform?: string
  cursor?: number
  limit?: number
}
export interface LibraryPageResult {
  entries: LibraryEntry[]
  total: number
  nextCursor: number | null
}
