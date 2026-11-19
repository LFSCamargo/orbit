import type { StorageItem, StorageKind, StorageOverview } from '@/types/storage'

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

/** Share of the whole disk in use, 0-100, or null when the volume is unknown. */
export function diskUsedPercent(overview: StorageOverview): number | null {
  if (overview.volumeTotalBytes <= 0) return null
  const used = overview.volumeTotalBytes - overview.volumeFreeBytes
  return Math.round((used / overview.volumeTotalBytes) * 100)
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
