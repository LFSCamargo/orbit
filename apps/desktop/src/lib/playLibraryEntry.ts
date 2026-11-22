import { selectInstallation } from './libraryEntries'
import {
  launchGame,
  launchXcloudGame,
  launchXcloudLibraryGame,
  playSteamWindowsGame,
} from './tauri'
import type { LibraryEntry } from '@/types/library'
import type { GameSession } from '@/types/game'
import { useXcloudPlayerStore } from '@/stores/xcloudPlayer.store'

export function isWindowsSteamPlay(entry: LibraryEntry) {
  const installation = selectInstallation(entry)
  return Boolean(
    entry.steamAppId &&
    installation?.platform === 'windows' &&
    (installation.launchType === 'wine' || entry.owned),
  )
}

/** Cloud games stream in Orbit's player: no local session to track. */
function isCloudPlay(entry: LibraryEntry) {
  return entry.game.provider === 'xcloud'
}

/** A Game Pass cloud title that is not saved to the library yet. */
export function isUnsavedCloudEntry(entry: LibraryEntry) {
  return isCloudPlay(entry) && entry.installations.length === 0
}

export async function playLibraryEntry(entry: LibraryEntry): Promise<GameSession | null> {
  if (isUnsavedCloudEntry(entry) && entry.game.sourceId) {
    // The first launch saves it to the library.
    await launchXcloudGame(entry.game.sourceId)
    openCloudPlayer(entry)
    return null
  }
  if (isCloudPlay(entry)) {
    await launchXcloudLibraryGame(entry.game.id)
    openCloudPlayer(entry)
    return null
  }
  if (isWindowsSteamPlay(entry) && entry.steamAppId) {
    return playSteamWindowsGame(entry.steamAppId)
  }
  const gameId = selectInstallation(entry)?.gameId ?? entry.game.id
  return launchGame(gameId)
}

/** Streams the title in Orbit's own player (modules/xcloud-player). */
function openCloudPlayer(entry: LibraryEntry) {
  const productId = entry.game.sourceId ?? entry.id.replace(/^xcloud:/, '')
  useXcloudPlayerStore.getState().open({ productId, title: entry.game.title })
}
