import { describe, expect, it } from 'vitest'
import { filterLibraryGames, sortGames } from '@/modules/library/lib/libraryFilters'
import type { Game, LibraryFilters } from '@/types/game'

function makeGame(overrides: Partial<Game> & Pick<Game, 'id' | 'title'>): Game {
  return {
    sortTitle: overrides.title,
    description: undefined,
    provider: 'steam',
    platform: 'macos',
    launchConfig: { type: 'steam', appId: overrides.id },
    artwork: {},
    favorite: false,
    hidden: false,
    dateAdded: '2026-01-01T00:00:00Z',
    totalPlaytimeSeconds: 0,
    achievements: [],
    ...overrides,
  }
}

const defaults: LibraryFilters = {
  query: '',
  providers: [],
  platforms: [],
  favoritesOnly: false,
  showHidden: false,
  sort: 'alphabetical',
}

describe('sortGames', () => {
  const alpha = makeGame({ id: 'a', title: 'Alpha', sortTitle: 'Alpha' })
  const beta = makeGame({ id: 'b', title: 'Beta', sortTitle: 'Beta' })

  it('sorts alphabetically by sortTitle', () => {
    expect(sortGames(alpha, beta, 'alphabetical')).toBeLessThan(0)
    expect(sortGames(beta, alpha, 'alphabetical')).toBeGreaterThan(0)
  })

  it('sorts by recently played descending', () => {
    const recent = makeGame({
      id: 'r',
      title: 'Recent',
      lastPlayedAt: '2026-07-20T00:00:00Z',
    })
    const older = makeGame({
      id: 'o',
      title: 'Older',
      lastPlayedAt: '2026-07-01T00:00:00Z',
    })
    expect(sortGames(recent, older, 'recently-played')).toBeLessThan(0)
  })

  it('sorts by recently added descending', () => {
    const newer = makeGame({
      id: 'n',
      title: 'Newer',
      dateAdded: '2026-07-10T00:00:00Z',
    })
    const older = makeGame({
      id: 'o',
      title: 'Older',
      dateAdded: '2026-01-01T00:00:00Z',
    })
    expect(sortGames(newer, older, 'recently-added')).toBeLessThan(0)
  })

  it('sorts by playtime descending', () => {
    const long = makeGame({ id: 'l', title: 'Long', totalPlaytimeSeconds: 5000 })
    const short = makeGame({ id: 's', title: 'Short', totalPlaytimeSeconds: 100 })
    expect(sortGames(long, short, 'playtime')).toBeLessThan(0)
  })

  it('sorts by provider then sortTitle', () => {
    const astris = makeGame({
      id: 'sw',
      title: 'Zelda',
      sortTitle: 'Zelda',
      provider: 'astris',
    })
    const steam = makeGame({
      id: 'st',
      title: 'Apex',
      sortTitle: 'Apex',
      provider: 'steam',
    })
    expect(sortGames(astris, steam, 'provider')).toBeLessThan(0)
  })
})

describe('filterLibraryGames', () => {
  const games = [
    makeGame({
      id: '1',
      title: 'Celeste',
      sortTitle: 'Celeste',
      provider: 'steam',
      favorite: true,
    }),
    makeGame({
      id: '2',
      title: 'Hades',
      sortTitle: 'Hades',
      provider: 'steam',
      hidden: true,
    }),
    makeGame({
      id: '3',
      title: 'Mario Kart',
      sortTitle: 'Mario Kart',
      provider: 'astris',
      favorite: true,
    }),
  ]

  it('hides hidden games by default and sorts alphabetically', () => {
    const result = filterLibraryGames(games, defaults)
    expect(result.map((g) => g.id)).toEqual(['1', '3'])
  })

  it('includes hidden games when showHidden is true', () => {
    const result = filterLibraryGames(games, { ...defaults, showHidden: true })
    expect(result.map((g) => g.id)).toEqual(['1', '2', '3'])
  })

  it('filters favorites only', () => {
    const result = filterLibraryGames(games, {
      ...defaults,
      favoritesOnly: true,
      showHidden: true,
    })
    expect(result.map((g) => g.id)).toEqual(['1', '3'])
  })

  it('filters by provider', () => {
    const result = filterLibraryGames(games, {
      ...defaults,
      providers: ['astris'],
      showHidden: true,
    })
    expect(result.map((g) => g.id)).toEqual(['3'])
  })

  it('filters by case-insensitive title query', () => {
    const result = filterLibraryGames(games, {
      ...defaults,
      query: '  had  ',
      showHidden: true,
    })
    expect(result.map((g) => g.id)).toEqual(['2'])
  })

  it('does not mutate the input array', () => {
    const original = [...games]
    filterLibraryGames(games, { ...defaults, sort: 'playtime' })
    expect(games).toEqual(original)
  })
})
