import { describe, expect, it } from 'vitest'
import { homeHero, homeLaunchId } from '../homeHero'
import type { LibraryEntry } from '@/types/library'
import type { Game } from '@/types/game'

function entry(
  id: string,
  gameId: string,
  extra: Partial<Game> = {},
  installations: LibraryEntry['installations'] = [],
): LibraryEntry {
  return {
    id,
    steamAppId: id.startsWith('steam:') ? id.slice(6) : null,
    owned: true,
    preferredInstallationId: null,
    installations,
    game: {
      id: gameId,
      title: extra.title ?? id,
      sortTitle: extra.title ?? id,
      provider: 'steam',
      platform: 'macos',
      launchConfig: { type: 'steam', appId: '1' },
      artwork: {},
      favorite: extra.favorite ?? false,
      hidden: extra.hidden ?? false,
      dateAdded: extra.dateAdded ?? '2026-01-01T00:00:00Z',
      lastPlayedAt: extra.lastPlayedAt,
      totalPlaytimeSeconds: 0,
      achievements: [],
      ...extra,
    },
  }
}

describe('homeHero', () => {
  it('uses LibraryEntry identity and launches the preferred installation game id', () => {
    const older = entry('steam:10', 'local-10', {
      title: 'Portal',
      lastPlayedAt: '2026-01-01T00:00:00Z',
    })
    const recent = entry(
      'steam:1091500',
      'mock-cyberpunk',
      { title: 'Cyberpunk 2077', lastPlayedAt: '2026-11-01T00:00:00Z' },
      [
        {
          id: 'mock-cyberpunk',
          gameId: 'mock-cyberpunk',
          platform: 'macos',
          path: '/Games/Cyberpunk.app',
          available: true,
          launchType: 'steam',
        },
      ],
    )
    const hidden = entry('steam:620', 'local-620', {
      title: 'Portal 2',
      hidden: true,
      lastPlayedAt: '2026-12-01T00:00:00Z',
    })
    expect(homeHero([hidden, older, recent], null)?.id).toBe('steam:1091500')
    expect(homeHero([older, recent], 'steam:10')?.id).toBe('steam:10')
    expect(homeLaunchId(recent)).toBe('mock-cyberpunk')
  })

  it('uses a prepended selected entry that is missing from the page', () => {
    const league = entry('steam:lol', 'steam:lol', {
      title: 'League of Legends',
      lastPlayedAt: '2026-11-01T00:00:00Z',
    })
    const resident = entry('steam:883710', 'steam:883710', {
      title: 'Resident Evil 2',
      dateAdded: '2026-02-01T00:00:00Z',
    })
    expect(homeHero([resident, league], 'steam:883710')?.id).toBe('steam:883710')
    expect(homeHero([league], 'steam:883710')?.id).toBe('steam:lol')
  })
})
