import type { GameSession } from '@/types/game'
import type { LibraryEntry } from '@/types/library'
import { homeLaunchId } from '../lib/homeHero'

export interface ThemeHomeProps {
  entries: LibraryEntry[]
  heroEntry: LibraryEntry
  activeSession: GameSession | null
  onPlay: (entry: LibraryEntry) => void
  onStop: () => void
  onFavorite: (entry: LibraryEntry) => void
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
) {
  const selectGame = (entry: LibraryEntry) => setHero(entry.id)

  const launchGame = (entry: LibraryEntry) => {
    setHero(entry.id)
    if (activeSession?.gameId === homeLaunchId(entry)) {
      onStop()
    } else {
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
