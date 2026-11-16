import { selectInstallation } from './libraryEntries'
import { launchGame, playSteamWindowsGame } from './tauri'
import type { LibraryEntry } from '@/types/library'
import type { GameSession } from '@/types/game'

export function isWindowsSteamPlay(entry: LibraryEntry) {
  const installation = selectInstallation(entry)
  return Boolean(
    entry.steamAppId &&
    installation?.platform === 'windows' &&
    (installation.launchType === 'wine' || entry.owned),
  )
}

export function playLibraryEntry(entry: LibraryEntry): Promise<GameSession> {
  if (isWindowsSteamPlay(entry) && entry.steamAppId) {
    return playSteamWindowsGame(entry.steamAppId)
  }
  const gameId = selectInstallation(entry)?.gameId ?? entry.game.id
  return launchGame(gameId)
}
