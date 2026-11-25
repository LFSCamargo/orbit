import type {
  StorageDrive,
  StorageItem,
  StorageKind,
  StorageOverview,
} from '@/types/storage'

export type StorageFilter = 'all' | StorageKind
export type StorageSort = 'size' | 'name' | 'installed'

export const CATEGORIES: Array<{
  kind: StorageKind
  label: string
  plural: string
  color: string
}> = [
  { kind: 'game', label: 'Game', plural: 'Games', color: '#ff8a3d' },
  { kind: 'tool', label: 'Tool', plural: 'Tools', color: '#a77bff' },
  { kind: 'runtime', label: 'Runtime', plural: 'Runtimes', color: '#4db5ff' },
  { kind: 'other', label: 'Other', plural: 'Other', color: '#8a8f98' },
]

const TOTAL_KEY: Record<StorageKind, keyof StorageOverview['totals']> = {
  game: 'games',
  tool: 'tools',
  runtime: 'runtimes',
  other: 'other',
}

export function categoryMeta(kind: StorageKind) {
  return CATEGORIES.find((item) => item.kind === kind) ?? CATEGORIES[3]
}

/** Category sizes with their share of everything Orbit stores (0-100). */
export function categoryShares(overview: StorageOverview) {
  const total = overview.orbitBytes
  return CATEGORIES.map((category) => {
    const bytes = overview.totals[TOTAL_KEY[category.kind]]
    return { ...category, bytes, percent: total > 0 ? (bytes / total) * 100 : 0 }
  })
}

/** Share of one drive or combined capacity in use, 0-100, or null when unknown. */
export function volumeUsedPercent(totalBytes: number, freeBytes: number): number | null {
  if (totalBytes <= 0) return null
  const used = Math.max(0, totalBytes - freeBytes)
  return Math.round((used / totalBytes) * 100)
}

/** Share of the whole disk (or all connected drives) in use, 0-100. */
export function diskUsedPercent(overview: StorageOverview): number | null {
  return volumeUsedPercent(overview.volumeTotalBytes, overview.volumeFreeBytes)
}

/** Orbit bytes per category on one drive, for its dedicated status bar. */
export function driveCategoryBytes(drive: StorageDrive): Record<StorageKind, number> {
  return {
    game: drive.totals.games,
    tool: drive.totals.tools,
    runtime: drive.totals.runtimes,
    other: drive.totals.other,
  }
}

/** Non-Orbit space used on one drive. */
export function driveOtherAppsBytes(drive: StorageDrive): number {
  return Math.max(0, drive.totalBytes - drive.freeBytes - drive.orbitBytes)
}

/** Tailored warning copy when deleting an Orbit-created file or folder. */
export function orbitRemovalDescription(item: StorageItem): string {
  if (item.id.startsWith('tool:steam-windows:')) {
    return 'Deletes Orbit’s Windows Steam prefix and saved Steam sign-in. You can reinstall and sign in again from Steam settings.'
  }
  if (item.id.startsWith('game-data:')) {
    return 'Permanently deletes this game’s Wine prefix, local saves, and settings stored by Orbit.'
  }
  if (item.id === 'other:library-data') {
    return 'Deletes Orbit’s local database and settings files. Restarting Orbit will start with a fresh library.'
  }
  return 'Permanently deletes these Orbit-created files from your Mac. Orbit will recreate or re-download them if needed.'
}

export function largestGames(items: StorageItem[], count = 3): StorageItem[] {
  return items
    .filter((item) => item.kind === 'game')
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, count)
}

export function filterCounts(items: StorageItem[]): Record<StorageFilter, number> {
  const counts: Record<StorageFilter, number> = {
    all: items.length,
    game: 0,
    tool: 0,
    runtime: 0,
    other: 0,
  }
  for (const item of items) counts[item.kind] += 1
  return counts
}

/** Filter, search and sort the table rows. O(n log n). */
export function visibleItems(
  items: StorageItem[],
  filter: StorageFilter,
  query: string,
  sort: StorageSort,
): StorageItem[] {
  const term = query.trim().toLowerCase()
  const rows = items.filter(
    (item) =>
      (filter === 'all' || item.kind === filter) &&
      (!term || item.name.toLowerCase().includes(term)),
  )
  return rows.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name)
    if (sort === 'installed')
      return (b.installedAt ?? '').localeCompare(a.installedAt ?? '')
    return b.sizeBytes - a.sizeBytes || a.name.localeCompare(b.name)
  })
}

/** Bytes per category on the same drive as Orbit's data, for the disk bar. O(n). */
export function onVolumeBytes(items: StorageItem[]): Record<StorageKind, number> {
  const bytes: Record<StorageKind, number> = { game: 0, tool: 0, runtime: 0, other: 0 }
  for (const item of items) if (item.onDataVolume) bytes[item.kind] += item.sizeBytes
  return bytes
}
