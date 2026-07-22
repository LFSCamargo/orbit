import { create } from 'zustand'
import type { AppScreen, LibraryFilters } from '@/types/game'

interface UiState {
  screen: AppScreen
  previousScreen: AppScreen
  selectedGameId: string | null
  heroGameId: string | null
  fullscreen: boolean
  cursorHidden: boolean
  lastControllerActivityAt: number
  libraryFilters: LibraryFilters
  importToast: string | null
  setScreen: (screen: AppScreen) => void
  openGameDetails: (gameId: string) => void
  openGameEdit: (gameId: string) => void
  openAddGame: () => void
  setSelectedGameId: (gameId: string | null) => void
  setHeroGameId: (gameId: string | null) => void
  setFullscreen: (fullscreen: boolean) => void
  setCursorHidden: (hidden: boolean) => void
  markControllerActivity: () => void
  markMouseActivity: () => void
  setLibraryFilters: (patch: Partial<LibraryFilters>) => void
  setImportToast: (message: string | null) => void
}

const defaultFilters: LibraryFilters = {
  query: '',
  providers: [],
  platforms: [],
  favoritesOnly: false,
  showHidden: false,
  sort: 'alphabetical',
}

export const useUiStore = create<UiState>((set) => ({
  screen: 'home',
  previousScreen: 'home',
  selectedGameId: null,
  heroGameId: null,
  fullscreen: true,
  cursorHidden: false,
  lastControllerActivityAt: 0,
  libraryFilters: defaultFilters,
  importToast: null,
  setScreen: (screen) =>
    set((state) => ({
      previousScreen: state.screen,
      screen,
    })),
  openGameDetails: (gameId) =>
    set((state) => ({
      previousScreen: state.screen,
      screen: 'game-details',
      selectedGameId: gameId,
      heroGameId: gameId,
    })),
  openGameEdit: (gameId) =>
    set((state) => ({
      previousScreen: state.screen,
      screen: 'game-edit',
      selectedGameId: gameId,
    })),
  openAddGame: () =>
    set((state) => ({
      previousScreen: state.screen,
      screen: 'add-game',
    })),
  setSelectedGameId: (gameId) => set({ selectedGameId: gameId }),
  setHeroGameId: (gameId) => set({ heroGameId: gameId }),
  setFullscreen: (fullscreen) => set({ fullscreen }),
  setCursorHidden: (hidden) => set({ cursorHidden: hidden }),
  markControllerActivity: () =>
    set({
      lastControllerActivityAt: Date.now(),
      cursorHidden: true,
    }),
  markMouseActivity: () =>
    set({
      cursorHidden: false,
    }),
  setLibraryFilters: (patch) =>
    set((state) => ({
      libraryFilters: { ...state.libraryFilters, ...patch },
    })),
  setImportToast: (message) => set({ importToast: message }),
}))
