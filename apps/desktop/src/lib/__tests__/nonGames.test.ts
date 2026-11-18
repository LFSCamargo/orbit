import { expect, it } from 'vitest'
import type { InfiniteData } from '@tanstack/react-query'
import type { LibraryEntry, LibraryPageResult } from '@/types/library'
import type { SteamOwnedGame } from '@/types/steam'
import { isNonGameApp, withoutNonGameEntries, withoutNonGameOwned } from '../nonGames'

const entry = (id: string, title: string, steamAppId: string | null) =>
  ({ id, steamAppId, game: { title } }) as unknown as LibraryEntry

it('recognises Driver Booster, which Steam types as a game', () => {
  expect(isNonGameApp('920490', 'Driver Booster for Steam')).toBe(true)
  expect(isNonGameApp(null, 'IObit Driver Booster 12')).toBe(true)
  expect(isNonGameApp('1593500', 'God of War')).toBe(false)
  expect(isNonGameApp(null, 'Boosted Racers')).toBe(false)
})

it('drops non-game apps from every library page', () => {
  // Regression: Driver Booster for Steam showed on the Home shelf.
  const pages: InfiniteData<LibraryPageResult, number> = {
    pageParams: [0],
    pages: [
      {
        total: 3,
        nextCursor: null,
        entries: [
          entry('steam:1593500', 'God of War', '1593500'),
          entry('steam:920490', 'Driver Booster for Steam', '920490'),
          entry('steam:883710', 'Resident Evil 2', '883710'),
        ],
      },
    ],
  }
  const titles = withoutNonGameEntries(pages).pages[0].entries.map((e) => e.game.title)
  expect(titles).toEqual(['God of War', 'Resident Evil 2'])
})

it('drops non-game apps from the owned Steam list', () => {
  const owned = [
    { appId: '920490', title: 'Driver Booster for Steam' },
    { appId: '883710', title: 'Resident Evil 2' },
  ] as SteamOwnedGame[]
  expect(withoutNonGameOwned(owned).map((game) => game.appId)).toEqual(['883710'])
})

it('hides launchers and stores that the Mac app scan picks up', () => {
  for (const title of ['GameHub', 'Orbit', 'Steam', 'Riot Client', 'Cliente Riot']) {
    expect(isNonGameApp(null, title), title).toBe(true)
  }
  for (const title of [
    'League of Legends',
    'Devil May Cry 5',
    'Orbital Strike',
    'Steamworld Dig',
  ]) {
    expect(isNonGameApp(null, title), title).toBe(false)
  }
})
