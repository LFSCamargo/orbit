import type { Game, GamePlatform } from './game'

export interface LibraryInstallation {
  id: string
  gameId: string
  platform: GamePlatform
  path: string | null
  available: boolean
  launchType: string
  /** Bytes on disk, when Orbit knows them. */
  sizeBytes?: number | null
  /** Bytes SteamCMD downloaded for an Orbit install. */
  downloadSizeBytes?: number | null
}
/** One installed copy measured from its real game folder. */
export interface InstallSize {
  installationId: string
  /** The game folder, symlinks resolved. */
  root: string
  sizeBytes: number
  /** The walk hit its budget; the size is a lower bound. */
  truncated: boolean
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
  /** Adds unsaved Game Pass cloud titles (Library and Search only). */
  includeCloudCatalog?: boolean
}
export interface LibraryPageResult {
  entries: LibraryEntry[]
  total: number
  nextCursor: number | null
}
