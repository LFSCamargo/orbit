import type { AppScreen } from '@/types/game'
import type { ThemeLayout } from '@/themes/useThemeLayout'

export function resolveNavScreen(screen: AppScreen): AppScreen {
  switch (screen) {
    case 'game-details':
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
  if (screen === 'game-edit') return 'game-details'
  if (screen === 'add-game' || screen === 'switch-library') return 'settings'
  if (screen === 'game-details') {
    return previous === 'game-details' ? 'library' : previous
  }
  if (screen === 'home') return 'home'
  return 'home'
}

export function focusRestoreId(
  layout: ThemeLayout,
  screen: AppScreen,
  gameId: string | null,
): string | null {
  if (!gameId) return null

  switch (screen) {
    case 'library':
      return `library-game-${gameId}`
    case 'search':
      return `search-game-${gameId}`
    case 'home':
      if (layout === 'switch') return `switch-game-${gameId}`
      if (layout === 'ps5') return `ps5-tile-${gameId}`
      return `orbit-recent-${gameId}`
    default:
      return null
  }
}

/** Primary focus target when entering a top-level shell route via L/R section keys. */
export function screenEntryFocusId(layout: ThemeLayout, screen: AppScreen): string | null {
  switch (screen) {
    case 'home':
      if (layout === 'ps5') return 'ps5-play'
      if (layout === 'switch') return 'switch-home-play'
      return 'orbit-play'
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
