import { describe, expect, it } from 'vitest'
import {
  isPlaceholderDescription,
  overlayCatalogCopy,
  selectInstallation,
} from '../libraryEntries'
import type { LibraryEntry } from '@/types/library'

describe('installation preference', () => {
  it('keeps an unavailable preference instead of silently launching a different installation', () => {
    const entry = {
      preferredInstallationId: 'external',
      installations: [
        { id: 'native', available: true, launchType: 'steam' },
        { id: 'external', available: false, launchType: 'wine' },
      ],
    } as LibraryEntry
    expect(selectInstallation(entry)?.id).toBe('external')
  })
  it('defaults to the first available installation when no preference is saved', () => {
    const entry = {
      preferredInstallationId: null,
      installations: [
        { id: 'external', available: false, launchType: 'wine' },
        { id: 'native', available: true, launchType: 'steam' },
      ],
    } as LibraryEntry
    expect(selectInstallation(entry)?.id).toBe('native')
  })
})

describe('catalog copy', () => {
  it('treats GameHub importer text as a placeholder', () => {
    expect(isPlaceholderDescription('Imported from GameHub.')).toBe(true)
    expect(isPlaceholderDescription('GameHub shortcut (gamehub://launch/steam/1).')).toBe(
      true,
    )
    expect(
      isPlaceholderDescription(
        'Imported from a GameHub Steam install (AppID 447040). Play uses Orbit’s compatibility layer.',
      ),
    ).toBe(true)
    expect(isPlaceholderDescription('Think with portals.')).toBe(false)
  })

  it('does not fill an empty description with leftover GameHub importer copy', () => {
    const entry = overlayCatalogCopy(
      {
        id: 'steam:447040',
        steamAppId: '447040',
        owned: false,
        preferredInstallationId: null,
        installations: [],
        game: {
          id: 'local',
          title: 'Watch_Dogs 2',
          sortTitle: 'watch_dogs 2',
          description: '',
          provider: 'steam',
          platform: 'windows',
          launchConfig: { type: 'steam', appId: '447040' },
          artwork: {},
          favorite: false,
          hidden: false,
          dateAdded: '',
          totalPlaytimeSeconds: 0,
          achievements: [],
        },
      },
      {
        description:
          'Imported from a GameHub Steam install (AppID 447040). Play uses Orbit’s compatibility layer.',
      },
    )
    expect(entry.game.description).toBe('')
  })

  it('replaces placeholder descriptions with Steam store copy and requirements', () => {
    const entry = overlayCatalogCopy(
      {
        id: 'steam:10',
        steamAppId: '10',
        owned: false,
        preferredInstallationId: null,
        installations: [],
        game: {
          id: 'local',
          title: 'Portal',
          sortTitle: 'portal',
          description: 'Imported from GameHub.',
          provider: 'steam',
          platform: 'windows',
          launchConfig: { type: 'steam', appId: '10' },
          artwork: {},
          favorite: false,
          hidden: false,
          dateAdded: '',
          totalPlaytimeSeconds: 0,
          achievements: [],
        },
      },
      {
        description: 'Think with portals.',
        minimumRequirements: 'OS: Windows 10',
        recommendedRequirements: '8 GB RAM',
        protonTier: 'platinum',
      },
    )
    expect(entry.owned).toBe(true)
    expect(entry.game.description).toBe('Think with portals.')
    expect(entry.runInfo).toEqual({
      minimum: 'OS: Windows 10',
      recommended: '8 GB RAM',
      protonTier: 'platinum',
    })
  })
})
