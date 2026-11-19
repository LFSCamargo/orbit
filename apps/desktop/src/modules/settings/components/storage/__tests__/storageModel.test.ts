import { expect, it } from 'vitest'
import type { StorageItem, StorageOverview } from '@/types/storage'
import {
  categoryShares,
  diskUsedPercent,
  onVolumeBytes,
  filterCounts,
  largestGames,
  visibleItems,
} from '../storageModel'

const item = (
  id: string,
  kind: StorageItem['kind'],
  sizeBytes: number,
  installedAt: string | null = null,
  onDataVolume = true,
): StorageItem => ({
  id,
  name: id,
  kind,
  sizeBytes,
  installedAt,
  path: `/Orbit/${id}`,
  artwork: null,
  removal: { type: 'none' },
  entryId: kind === 'game' ? `steam:${id}` : null,
  source: 'Orbit',
  onDataVolume,
})

const items = [
  item('God of War', 'game', 175, '2026-11-10'),
  item('Cyberpunk 2077', 'game', 141, '2026-11-08'),
  item('Devil May Cry 5', 'game', 67, '2026-11-05'),
  item('Hades', 'game', 10, '2026-11-01'),
  item('Wine', 'tool', 14, '2026-11-03'),
  item('DXVK', 'runtime', 2, '2026-10-20'),
]

const overview: StorageOverview = {
  volumeTotalBytes: 1_000,
  volumeFreeBytes: 340,
  orbitBytes: 409,
  totals: { games: 393, tools: 14, runtimes: 2, other: 0 },
  items,
  truncated: false,
  scannedAt: '2026-11-17T00:00:00Z',
}

it('splits Orbit’s usage into category shares', () => {
  const shares = categoryShares(overview)
  expect(shares.map((share) => share.plural)).toEqual([
    'Games',
    'Tools',
    'Runtimes',
    'Other',
  ])
  expect(Math.round(shares[0].percent)).toBe(96)
  expect(shares[3].percent).toBe(0)
  expect(diskUsedPercent(overview)).toBe(66)
  expect(diskUsedPercent({ ...overview, volumeTotalBytes: 0 })).toBeNull()
})

it('picks the three largest games', () => {
  expect(largestGames(items).map((row) => row.name)).toEqual([
    'God of War',
    'Cyberpunk 2077',
    'Devil May Cry 5',
  ])
})

it('filters, searches and sorts table rows', () => {
  expect(filterCounts(items)).toMatchObject({
    all: 6,
    game: 4,
    tool: 1,
    runtime: 1,
    other: 0,
  })
  expect(visibleItems(items, 'tool', '', 'size').map((row) => row.name)).toEqual(['Wine'])
  expect(visibleItems(items, 'all', 'CRY', 'size').map((row) => row.name)).toEqual([
    'Devil May Cry 5',
  ])
  expect(visibleItems(items, 'game', '', 'name')[0].name).toBe('Cyberpunk 2077')
  expect(visibleItems(items, 'all', '', 'installed')[0].name).toBe('God of War')
})

it('fills the disk bar only with folders on Orbit’s drive', () => {
  const external = item('Starfield', 'game', 120, null, false)
  const bytes = onVolumeBytes([...items, external])
  expect(bytes.game).toBe(393)
  expect(bytes.tool).toBe(14)
  expect(bytes.other).toBe(0)
})
