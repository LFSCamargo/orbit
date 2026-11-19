import { expect, it } from 'vitest'
import type { LibraryEntry } from '@/types/library'
import { playedNotInstalled } from '../playedNotInstalled'

const entry = (
  id: string,
  seconds: number,
  { installed = false, lastPlayedAt, hidden = false, title = id } = {} as {
    installed?: boolean
    lastPlayedAt?: string
    hidden?: boolean
    title?: string
  },
): LibraryEntry =>
  ({
    id,
    steamAppId: id.replace('steam:', ''),
    owned: true,
    preferredInstallationId: null,
    installations: installed ? [{ available: true }] : [{ available: false }],
    game: { id, title, hidden, totalPlaytimeSeconds: seconds, lastPlayedAt, artwork: {} },
  }) as unknown as LibraryEntry

it('lists played games that are not installed, most played first', () => {
  const result = playedNotInstalled([
    entry('steam:1', 3600),
    entry('steam:2', 36_000),
    entry('steam:3', 7200, { installed: true }),
    entry('steam:4', 0),
  ])
  expect(result.map((e) => e.id)).toEqual(['steam:2', 'steam:1'])
})

it('counts a game played without tracked time, after timed ones, by recency', () => {
  const result = playedNotInstalled([
    entry('steam:1', 0, { lastPlayedAt: '2026-01-01T00:00:00Z' }),
    entry('steam:2', 0, { lastPlayedAt: '2026-06-01T00:00:00Z' }),
    entry('steam:3', 60),
  ])
  expect(result.map((e) => e.id)).toEqual(['steam:3', 'steam:2', 'steam:1'])
})

it('skips hidden games and non-game apps, and keeps the list short', () => {
  const many = Array.from({ length: 9 }, (_, i) => entry(`steam:${10 + i}`, 100 + i))
  expect(playedNotInstalled(many)).toHaveLength(5)
  expect(
    playedNotInstalled([
      entry('steam:1', 500, { hidden: true }),
      entry('steam:2', 500, { title: 'Steam' }),
    ]),
  ).toEqual([])
})
