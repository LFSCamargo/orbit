import { expect, it } from 'vitest'
import { steamCoverCandidates, steamHeroCandidates } from '@/lib/steamArtwork'

it('uses original Steam capsules and falls back to the header', () => {
  expect(steamCoverCandidates('550')).toEqual([
    'https://cdn.akamai.steamstatic.com/steam/apps/550/library_600x900_2x.jpg',
    'https://cdn.akamai.steamstatic.com/steam/apps/550/library_600x900.jpg',
    'https://cdn.akamai.steamstatic.com/steam/apps/550/logo.png',
    'https://cdn.akamai.steamstatic.com/steam/apps/550/header.jpg',
  ])
  expect(steamCoverCandidates('not-an-id')).toEqual([])
})

it('keeps a SteamGridDB square cover first without duplicating it', () => {
  const preferred = 'https://cdn.steamgriddb.com/grid/l4d2.png'
  expect(steamCoverCandidates('550', preferred)[0]).toBe(preferred)
  expect(steamCoverCandidates('550', preferred)).toHaveLength(5)
})

it('uses the Steam library hero for details', () => {
  expect(steamHeroCandidates('220')[0]).toBe(
    'https://cdn.akamai.steamstatic.com/steam/apps/220/library_hero.jpg',
  )
})
