import type { AppScreen } from '@/types/game'

export function resolveNavScreen(screen: AppScreen): AppScreen {
  switch (screen) {
    case 'game-details':
    case 'gamehub-library':
      return 'library'
    case 'add-game':
    case 'game-edit':
    case 'switch-library':
      return 'settings'
    default:
      return screen
  }
}

export function backTarget(screen: AppScreen, previous: AppScreen): AppScreen {
  if (screen === 'gamehub-library') return 'library'
  if (screen === 'game-edit') return 'game-details'
  if (screen === 'add-game' || screen === 'switch-library') return 'settings'
  if (screen === 'game-details') {
    return previous === 'game-details' || previous === 'game-edit' ? 'library' : previous
  }
  if (screen === 'home') return 'home'
  return 'home'
}

export function focusRestoreId(screen: AppScreen, gameId: string | null): string | null {
  if (!gameId) return null

  switch (screen) {
    case 'library':
      return `library-game-${gameId}`
    case 'search':
      return `search-game-${gameId}`
    case 'home':
      return `macos-game-${gameId}`
    default:
      return null
  }
}

/** Primary focus target when entering a top-level shell route via L/R section keys. */
export function screenEntryFocusId(screen: AppScreen): string | null {
  switch (screen) {
    case 'home':
      return 'macos-play'
    case 'library':
      return 'library-sort-alphabetical'
    case 'search':
      return 'search-clear'
    case 'settings':
      return 'settings-fullscreen'
    case 'switch-library':
      return 'switch-library-scan'
    default:
      return null
  }
}
