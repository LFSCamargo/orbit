import { expect, it } from 'vitest'
import type { LibraryEntry } from '@/types/library'
import { SCAN_PHASES, scanPercent, summarizeFound } from '../scanSummary'

it('weights the three scan phases and counts a running phase as half done', () => {
  expect(SCAN_PHASES.map((p) => p.id)).toEqual(['paths', 'detect', 'details'])
  expect(scanPercent({ paths: 'waiting', detect: 'waiting', details: 'waiting' })).toBe(0)
  expect(scanPercent({ paths: 'done', detect: 'running', details: 'waiting' })).toBe(55)
  expect(scanPercent({ paths: 'done', detect: 'failed', details: 'done' })).toBe(100)
})

const entry = (
  id: string,
  provider: string,
  platform: string,
  title = id,
): LibraryEntry =>
  ({
    id,
    steamAppId: null,
    owned: true,
    preferredInstallationId: null,
    installations: [],
    game: { id, title, provider, platform, artwork: {} },
  }) as unknown as LibraryEntry

it('counts found games by source, in library order, and drops non-game apps', () => {
  const summary = summarizeFound([
    entry('a', 'steam', 'windows'),
    entry('b', 'steam', 'macos'),
    entry('c', 'steam', 'windows'),
    entry('d', 'native', 'macos'),
    entry('e', 'steam', 'windows', 'Driver Booster for Steam'),
  ])
  expect(summary.total).toBe(4)
  expect(summary.bySource).toEqual([
    { source: 'steam-mac', label: 'Steam · Mac', count: 1 },
    { source: 'steam-windows', label: 'Steam · Windows', count: 2 },
    { source: 'other', label: 'Mac apps & other games', count: 1 },
  ])
})
