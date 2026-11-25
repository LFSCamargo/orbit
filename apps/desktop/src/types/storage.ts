export type StorageKind = 'game' | 'tool' | 'runtime' | 'other'

type StorageRemoval =
  | { type: 'none' }
  | { type: 'game'; appId: string }
  | { type: 'component'; id: string; version: string }
  | { type: 'orbitData'; paths: string[] }

interface StorageTotals {
  games: number
  tools: number
  runtimes: number
  other: number
}

export interface StorageDrive {
  id: string
  name: string
  mountPath: string
  isDataVolume: boolean
  totalBytes: number
  freeBytes: number
  orbitBytes: number
  totals: StorageTotals
}

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
  /** Identifier of the connected drive holding this item. */
  driveId: string
}

export interface StorageOverview {
  /** Sum of total capacity across all connected drives. */
  volumeTotalBytes: number
  /** Sum of free space across all connected drives. */
  volumeFreeBytes: number
  orbitBytes: number
  totals: StorageTotals
  drives: StorageDrive[]
  items: StorageItem[]
  /** Sizes are lower bounds when the scan hit its walk budget. */
  truncated: boolean
  scannedAt: string
}
