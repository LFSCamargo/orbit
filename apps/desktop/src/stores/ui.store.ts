import { create } from 'zustand'
import type { AppScreen, LibraryFilters } from '@/types/game'

export type SettingsTab = 'general' | 'themes' | 'library'

interface UiState {
  screen: AppScreen
  previousScreen: AppScreen
  selectedGameId: string | null
  heroGameId: string | null
  fullscreen: boolean
  cursorHidden: boolean
  navigationInput: 'pointer' | 'controller'
  lastControllerActivityAt: number
  libraryFilters: LibraryFilters
  importToast: string | null
  homeMenuOpen: boolean
  settingsTab: SettingsTab
  setSettingsTab: (tab: SettingsTab) => void
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
  openHomeMenu: () => void
  closeHomeMenu: () => void
  toggleHomeMenu: () => void
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
  navigationInput: 'pointer',
  lastControllerActivityAt: 0,
  libraryFilters: defaultFilters,
  importToast: null,
  homeMenuOpen: false,
  settingsTab: 'general',
  setSettingsTab: (settingsTab) => set({ settingsTab }),
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
      navigationInput: 'controller',
    }),
  markMouseActivity: () =>
    set((state) =>
      !state.cursorHidden && state.navigationInput === 'pointer'
        ? state
        : { cursorHidden: false, navigationInput: 'pointer' },
    ),
  setLibraryFilters: (patch) =>
    set((state) => ({
      libraryFilters: { ...state.libraryFilters, ...patch },
    })),
  setImportToast: (message) => set({ importToast: message }),
  openHomeMenu: () => set({ homeMenuOpen: true }),
  closeHomeMenu: () => set({ homeMenuOpen: false }),
  toggleHomeMenu: () => set((state) => ({ homeMenuOpen: !state.homeMenuOpen })),
}))
