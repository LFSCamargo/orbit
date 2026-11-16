import type { GameSession } from '@/types/game'
import type { LibraryEntry } from '@/types/library'
import { isWindowsSteamPlay } from '@/lib/playLibraryEntry'
import { homeLaunchId } from '../lib/homeHero'

export type HomeView = 'recent' | 'installed' | 'favorites'

export interface ThemeHomeProps {
  view?: HomeView
  onView?: (view: HomeView) => void
  shelfEntries?: LibraryEntry[]
  shelfPending?: boolean
  shelfError?: boolean
  onRetry?: () => void
  entries: LibraryEntry[]
  heroEntry: LibraryEntry
  activeSession: GameSession | null
  onPlay: (entry: LibraryEntry) => void
  onStop: () => void
  onFavorite: (entry: LibraryEntry) => void
  showFavorites?: boolean
  steamReady?: boolean
}

export function gameStats(game: LibraryEntry['game']) {
  const achievements = game.achievements ?? []
  const unlocked = achievements.filter((a) => a.unlocked).length
  return { achievements, unlocked }
}

export function createHomeGameHandlers(
  activeSession: GameSession | null,
  setHero: (gameId: string) => void,
  onPlay: (entry: LibraryEntry) => void,
  onStop: () => void,
  heroEntryId: string,
  steamReady = true,
) {
  const selectGame = (entry: LibraryEntry) => setHero(entry.id)

  const launchGame = (entry: LibraryEntry) => {
    setHero(entry.id)
    if (activeSession?.gameId === homeLaunchId(entry)) {
      onStop()
    } else if (!isWindowsSteamPlay(entry) || steamReady) {
      onPlay(entry)
    }
  }

  const activateGame = (entry: LibraryEntry) => {
    if (entry.id === heroEntryId) {
      launchGame(entry)
    } else {
      selectGame(entry)
    }
  }

  return { selectGame, launchGame, activateGame }
}
