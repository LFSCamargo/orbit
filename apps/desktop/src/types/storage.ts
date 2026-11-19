export type StorageKind = 'game' | 'tool' | 'runtime' | 'other'

export type StorageRemoval =
  | { type: 'none' }
  | { type: 'game'; appId: string }
  | { type: 'component'; id: string; version: string }

export interface StorageItem {
  id: string
  name: string
  kind: StorageKind
  sizeBytes: number
  installedAt: string | null
  path: string
  artwork: string | null
  removal: StorageRemoval
  /** Library entry to open, for games. */
  entryId: string | null
  /** Where the files live, e.g. "Orbit" or "Steam library". */
  source: string
  /** False when the folder is on another drive than Orbit's data. */
  onDataVolume: boolean
}

export interface StorageOverview {
  volumeTotalBytes: number
  volumeFreeBytes: number
  orbitBytes: number
  totals: { games: number; tools: number; runtimes: number; other: number }
  items: StorageItem[]
  /** Sizes are lower bounds when the scan hit its walk budget. */
  truncated: boolean
  scannedAt: string
}
