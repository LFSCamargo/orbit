import { describe, expect, it } from 'vitest'
import {
  entrySizes,
  isPlaceholderDescription,
  uninstallAppId,
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

describe('install sizes', () => {
  it('reads disk and download sizes from the installation that would launch', () => {
    const entry = {
      preferredInstallationId: null,
      game: { installSizeBytes: 9 },
      installations: [
        { id: 'a', available: true, sizeBytes: 4_000, downloadSizeBytes: 3_000 },
      ],
    } as unknown as LibraryEntry
    expect(entrySizes(entry)).toEqual({ diskBytes: 4_000, downloadBytes: 3_000 })
  })
  it('falls back to the game size and reports nothing for uninstalled titles', () => {
    const imported = {
      preferredInstallationId: null,
      game: { installSizeBytes: 9 },
      installations: [{ id: 'a', available: true }],
    } as unknown as LibraryEntry
    expect(entrySizes(imported)).toEqual({ diskBytes: 9, downloadBytes: null })
    const owned = {
      preferredInstallationId: null,
      game: { installSizeBytes: 9 },
      installations: [],
    } as unknown as LibraryEntry
    expect(entrySizes(owned)).toEqual({ diskBytes: 9, downloadBytes: null })
  })
})

describe('uninstall', () => {
  const entry = (path: string | null, launchType = 'wine') =>
    ({
      steamAppId: '312990',
      preferredInstallationId: null,
      installations: [{ id: 'a', available: true, launchType, path }],
    }) as unknown as LibraryEntry

  it('offers uninstall for Orbit downloads and Windows games in a Steam library', () => {
    expect(
      uninstallAppId(
        entry('/Orbit/runtimes/containers/games/steam-312990/install/x.exe'),
      ),
    ).toBe('312990')
    expect(uninstallAppId(entry('/Orbit/steam-windows/games/312990/x.exe'))).toBe(
      '312990',
    )
    expect(
      uninstallAppId(
        entry(
          '/Users/me/GameHub/steamapps/common/Broforce The Expendables Missions/Expendabros.exe',
        ),
      ),
    ).toBe('312990')
  })

  it('never offers it for the Steam client prefix, Mac Steam games or unknown paths', () => {
    expect(
      uninstallAppId(
        entry('/Orbit/steam-windows/prefix/drive_c/Steam/steamapps/common/Game/x.exe'),
      ),
    ).toBeNull()
    expect(
      uninstallAppId(
        entry('/Users/me/Library/Steam/steamapps/common/Game/Game.app', 'steam'),
      ),
    ).toBeNull()
    expect(uninstallAppId(entry('/Users/me/Games/x.exe'))).toBeNull()
    expect(uninstallAppId(entry(null))).toBeNull()
  })
})
