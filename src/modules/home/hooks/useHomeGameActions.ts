import type { Game, GameSession } from '@/types/game'
import type { GameContentMap } from '@/types/gameContent'

export interface ThemeHomeProps {
  games: Game[]
  heroGame: Game
  activeSession: GameSession | null
  contentByGameId: GameContentMap
  onPlay: (game: Game) => void
  onStop: () => void
  onFavorite: (game: Game) => void
}

export function gameStats(game: Game) {
  const achievements = game.achievements ?? []
  const unlocked = achievements.filter((a) => a.unlocked).length
  return { achievements, unlocked }
}

export function createHomeGameHandlers(
  activeSession: GameSession | null,
  setHero: (gameId: string) => void,
  onPlay: (game: Game) => void,
  onStop: () => void,
  heroGameId: string,
) {
  const selectGame = (game: Game) => setHero(game.id)

  const launchGame = (game: Game) => {
    setHero(game.id)
    if (activeSession?.gameId === game.id) {
      onStop()
    } else {
      onPlay(game)
    }
  }

  /** First press selects; confirming the already-selected tile launches. */
  const activateGame = (game: Game) => {
    if (game.id === heroGameId) {
      launchGame(game)
    } else {
      selectGame(game)
    }
  }

  return { selectGame, launchGame, activateGame }
}
