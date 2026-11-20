import { describe, expect, it, vi } from 'vitest'
import { gameSource, groupBySource } from '@/lib/gameSource'
import { detailsPrimaryAction } from '@/lib/libraryActions'
import { playLibraryEntry } from '@/lib/playLibraryEntry'
import { launchGame, launchXcloudGame, launchXcloudLibraryGame } from '@/lib/tauri'
import type { Game } from '@/types/game'
import type { LibraryEntry } from '@/types/library'

vi.mock('@/lib/tauri', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tauri')>()),
  launchGame: vi.fn(),
  launchXcloudGame: vi.fn(),
  launchXcloudLibraryGame: vi.fn(),
}))

const cloudGame: Game = {
  id: 'g1',
  title: 'Halo Infinite',
  sortTitle: 'halo infinite',
  provider: 'xcloud',
  platform: 'cloud',
  sourceId: '9PP5G1F0C2B6',
  launchConfig: {
    type: 'open-url',
    url: 'https://www.xbox.com/en-US/play/launch/x/9PP5G1F0C2B6',
  },
  artwork: {},
  favorite: false,
  hidden: false,
  dateAdded: '',
  totalPlaytimeSeconds: 0,
  achievements: [],
}

const entry: LibraryEntry = {
  id: 'g1',
  game: cloudGame,
  steamAppId: null,
  owned: false,
  installations: [
    {
      id: 'i1',
      gameId: 'g1',
      platform: 'cloud',
      path: null,
      available: true,
      launchType: 'open-url',
    },
  ],
  preferredInstallationId: null,
}

describe('xcloud', () => {
  it('plays cloud games in the browser without a local session', async () => {
    vi.mocked(launchXcloudLibraryGame).mockResolvedValue(cloudGame)
    await expect(playLibraryEntry(entry)).resolves.toBeNull()
    expect(launchXcloudLibraryGame).toHaveBeenCalledWith('g1')
    expect(launchGame).not.toHaveBeenCalled()
  })

  it('plays an unsaved Game Pass title through the catalog launch', async () => {
    vi.mocked(launchXcloudGame).mockResolvedValue(cloudGame)
    const unsaved = { ...entry, id: 'xcloud:9PP5G1F0C2B6', installations: [] }
    await expect(playLibraryEntry(unsaved)).resolves.toBeNull()
    expect(launchXcloudGame).toHaveBeenCalledWith('9PP5G1F0C2B6')
  })

  it('offers Play, not Install, for cloud titles', () => {
    const unsaved = { ...entry, installations: [] }
    const action = detailsPrimaryAction({
      entry: unsaved,
      running: false,
      launching: false,
      cancelling: false,
      signedIn: false,
    })
    expect(action).toMatchObject({ kind: 'play', label: 'Play' })
  })

  it('groups cloud games under their own library section', () => {
    expect(gameSource(cloudGame)).toBe('xcloud')
    expect(groupBySource([entry])[0]?.source).toBe('xcloud')
  })
})
