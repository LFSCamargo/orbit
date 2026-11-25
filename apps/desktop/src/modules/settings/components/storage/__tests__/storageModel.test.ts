import { expect, it } from 'vitest'
import type { StorageDrive, StorageItem, StorageOverview } from '@/types/storage'
import {
  categoryShares,
  diskUsedPercent,
  driveCategoryBytes,
  driveOtherAppsBytes,
  filterCounts,
  largestGames,
  onVolumeBytes,
  orbitRemovalDescription,
  visibleItems,
  volumeUsedPercent,
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
  driveId: onDataVolume ? 'this-mac' : '/Volumes/T7',
})

const items = [
  item('God of War', 'game', 175, '2026-11-10'),
  item('Cyberpunk 2077', 'game', 141, '2026-11-08'),
  item('Devil May Cry 5', 'game', 67, '2026-11-05'),
  item('Hades', 'game', 10, '2026-11-01'),
  item('Wine', 'tool', 14, '2026-11-03'),
  item('DXVK', 'runtime', 2, '2026-10-20'),
]

const macDrive: StorageDrive = {
  id: 'this-mac',
  name: 'This Mac',
  mountPath: '/',
  isDataVolume: true,
  totalBytes: 1_000,
  freeBytes: 340,
  orbitBytes: 409,
  totals: { games: 393, tools: 14, runtimes: 2, other: 0 },
}

const overview: StorageOverview = {
  volumeTotalBytes: 1_000,
  volumeFreeBytes: 340,
  orbitBytes: 409,
  totals: { games: 393, tools: 14, runtimes: 2, other: 0 },
  drives: [macDrive],
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

it('computes per-drive percentages, category bytes and other-apps space', () => {
  expect(volumeUsedPercent(1_000, 340)).toBe(66)
  expect(volumeUsedPercent(0, 0)).toBeNull()
  expect(driveCategoryBytes(macDrive)).toEqual({
    game: 393,
    tool: 14,
    runtime: 2,
    other: 0,
  })
  expect(driveOtherAppsBytes(macDrive)).toBe(251)
  expect(
    orbitRemovalDescription({ ...item('tool:steam-windows:prefix', 'tool', 10) }),
  ).toContain('Steam sign-in')
  expect(
    orbitRemovalDescription({ ...item('other:library-data', 'other', 10) }),
  ).toContain('local database')
})
