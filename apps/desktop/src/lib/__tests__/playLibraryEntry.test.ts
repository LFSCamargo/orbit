import { beforeEach, expect, it, vi } from 'vitest'
import { isWindowsSteamPlay, playLibraryEntry } from '../playLibraryEntry'
import type { LibraryEntry } from '@/types/library'

const launchGame = vi.fn()
const playSteamWindowsGame = vi.fn()

vi.mock('../tauri', () => ({
  launchGame: (...args: unknown[]) => launchGame(...args),
  playSteamWindowsGame: (...args: unknown[]) => playSteamWindowsGame(...args),
}))

function entry(patch: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    id: 'steam:1593500',
    steamAppId: '1593500',
    owned: true,
    preferredInstallationId: null,
    installations: [
      {
        id: 'win',
        gameId: 'gow-uuid',
        platform: 'windows',
        path: '/Games/GoW.exe',
        available: true,
        launchType: 'wine',
      },
    ],
    game: {
      id: 'gow-uuid',
      title: 'God of War',
      sortTitle: 'god of war',
      provider: 'steam',
      platform: 'windows',
      launchConfig: { type: 'steam', appId: '1593500' },
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

beforeEach(() => {
  launchGame.mockReset()
  playSteamWindowsGame.mockReset()
  launchGame.mockResolvedValue({ id: 'session' })
  playSteamWindowsGame.mockResolvedValue({ id: 'session' })
})

it('plays Windows Steam installs through the signed-in Steam prefix', async () => {
  expect(isWindowsSteamPlay(entry())).toBe(true)
  await playLibraryEntry(entry())
  expect(playSteamWindowsGame).toHaveBeenCalledWith('1593500')
  expect(launchGame).not.toHaveBeenCalled()
})

it('keeps Mac Steam launches on the native Steam URL', async () => {
  const mac = entry({
    steamAppId: '1091500',
    installations: [
      {
        id: 'mac',
        gameId: 'cyberpunk',
        platform: 'macos',
        path: '/Games/Cyberpunk.app',
        available: true,
        launchType: 'steam',
      },
    ],
  })
  expect(isWindowsSteamPlay(mac)).toBe(false)
  await playLibraryEntry(mac)
  expect(launchGame).toHaveBeenCalledWith('cyberpunk')
  expect(playSteamWindowsGame).not.toHaveBeenCalled()
})
