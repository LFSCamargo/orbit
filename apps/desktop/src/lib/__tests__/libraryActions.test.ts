import { describe, expect, it } from 'vitest'
import { detailsPrimaryAction, isOrbitManagedDownload } from '../libraryActions'
import type { LibraryEntry } from '@/types/library'

function entry(patch: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    id: 'steam:10',
    steamAppId: '10',
    owned: true,
    preferredInstallationId: null,
    installations: [],
    game: {
      id: 'g1',
      title: 'Portal',
      sortTitle: 'portal',
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
    ...patch,
  }
}

describe('detailsPrimaryAction', () => {
  it('plays an available installation and keeps an unavailable preference as Locate', () => {
    const installed = entry({
      installations: [
        {
          id: 'mac',
          gameId: 'mac',
          platform: 'macos',
          path: '/Games/Portal.app',
          available: true,
          launchType: 'steam',
        },
      ],
    })
    expect(
      detailsPrimaryAction({
        entry: installed,
        running: false,
        launching: false,
        cancelling: false,
        signedIn: true,
      }).kind,
    ).toBe('play')

    const missing = entry({
      preferredInstallationId: 'disk',
      installations: [
        {
          id: 'disk',
          gameId: 'win',
          platform: 'windows',
          path: '/Volumes/Games/Portal.exe',
          available: false,
          launchType: 'wine',
        },
      ],
    })
    expect(
      detailsPrimaryAction({
        entry: missing,
        running: false,
        launching: false,
        cancelling: false,
        signedIn: true,
      }),
    ).toMatchObject({ kind: 'locate', gameId: 'win' })
  })

  it('installs owned titles and asks for Steam when the session is missing', () => {
    expect(
      detailsPrimaryAction({
        entry: entry(),
        running: false,
        launching: false,
        cancelling: false,
        signedIn: true,
      }).kind,
    ).toBe('install')
    expect(
      detailsPrimaryAction({
        entry: entry(),
        running: false,
        launching: false,
        cancelling: false,
        signedIn: false,
      }).kind,
    ).toBe('sign-in')
  })

  it('plays a signed-in Windows install without waiting for silent Steam', () => {
    const wine = entry({
      installations: [
        {
          id: 'win',
          gameId: 'win',
          platform: 'windows',
          path: '/Games/DMC5.exe',
          available: true,
          launchType: 'wine',
        },
      ],
    })
    expect(
      detailsPrimaryAction({
        entry: wine,
        running: false,
        launching: false,
        cancelling: false,
        signedIn: false,
      }),
    ).toMatchObject({ kind: 'sign-in', label: 'Sign in to Steam' })
    expect(
      detailsPrimaryAction({
        entry: wine,
        running: false,
        launching: false,
        cancelling: false,
        signedIn: true,
      }),
    ).toMatchObject({ kind: 'play', label: 'Play now' })
  })

  it('cancels a wine launch in the same primary slot', () => {
    const wine = entry({
      owned: false,
      steamAppId: null,
      installations: [
        {
          id: 'win',
          gameId: 'win',
          platform: 'windows',
          path: '/Games/a.exe',
          available: true,
          launchType: 'wine',
        },
      ],
      game: entry().game,
    })
    expect(
      detailsPrimaryAction({
        entry: wine,
        running: false,
        launching: true,
        cancelling: false,
        signedIn: true,
      }).kind,
    ).toBe('cancel')
  })
})

describe('isOrbitManagedDownload', () => {
  it('recognizes Orbit SteamCMD install paths', () => {
    expect(
      isOrbitManagedDownload(
        '/Users/me/Library/Application Support/orbit/runtimes/containers/games/steam-10/install',
      ),
    ).toBe(true)
    expect(
      isOrbitManagedDownload(
        '/Users/me/Library/Application Support/orbit/steam-windows/games/10',
      ),
    ).toBe(true)
    expect(isOrbitManagedDownload('/Users/me/SteamLibrary/steamapps/common/Portal')).toBe(
      false,
    )
  })
})
