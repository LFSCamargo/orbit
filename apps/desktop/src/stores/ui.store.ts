import { create } from 'zustand'
import type { AppScreen, LibraryFilters } from '@/types/game'

export type SettingsTab =
  | 'general'
  | 'themes'
  | 'library'
  | 'steam'
  | 'runtimes'
  | 'graphics'
  | 'storage'
  | 'metadata'

export type SteamLibraryGame = {
  appId: string
  title: string
  description?: string | null
  coverUrl?: string
  heroUrl?: string
  installed?: boolean
}

interface UiState {
  homeView: 'recent' | 'installed' | 'favorites'
  setHomeView: (view: 'recent' | 'installed' | 'favorites') => void
  screen: AppScreen
  previousScreen: AppScreen
  selectedGameId: string | null
  heroGameId: string | null
  fullscreen: boolean
  cursorHidden: boolean
  navigationInput: 'pointer' | 'controller'
  lastControllerActivityAt: number
  libraryFilters: LibraryFilters
  searchQuery: string
  homeMenuOpen: boolean
  settingsTab: SettingsTab
  libraryView: 'installed' | 'all' | 'favorites'
  libraryPlatform: string
  setLibraryView: (view: 'installed' | 'all' | 'favorites') => void
  setLibraryPlatform: (platform: string) => void
  detailsTab: 'overview' | 'settings'
  setDetailsTab: (tab: 'overview' | 'settings') => void
  steamGame: SteamLibraryGame | null
  setSettingsTab: (tab: SettingsTab) => void
  setScreen: (screen: AppScreen) => void
  openGameDetails: (gameId: string) => void
  openSteamGame: (game: SteamLibraryGame) => void
  openGameEdit: (gameId: string) => void

  openAddGame: () => void
  setSelectedGameId: (gameId: string | null) => void
  setHeroGameId: (gameId: string | null) => void
  setFullscreen: (fullscreen: boolean) => void
  setCursorHidden: (hidden: boolean) => void
  markControllerActivity: () => void
  markMouseActivity: () => void
  setLibraryFilters: (patch: Partial<LibraryFilters>) => void
  setSearchQuery: (query: string) => void
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
  homeView: 'recent',
  setHomeView: (homeView) => set({ homeView }),
  screen: 'home',
  previousScreen: 'home',
  selectedGameId: null,
  heroGameId: null,
  fullscreen: true,
  cursorHidden: false,
  navigationInput: 'pointer',
  lastControllerActivityAt: 0,
  libraryFilters: defaultFilters,
  searchQuery: '',
  homeMenuOpen: false,
  settingsTab: 'general',
  libraryView: 'installed',
  libraryPlatform: 'all',
  setLibraryView: (libraryView) => set({ libraryView }),
  setLibraryPlatform: (libraryPlatform) => set({ libraryPlatform }),
  detailsTab: 'overview',
  setDetailsTab: (detailsTab) => set({ detailsTab }),
  steamGame: null,
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
      detailsTab: 'overview',
      selectedGameId: gameId,
      heroGameId: gameId,
      steamGame: null,
    })),
  openSteamGame: (steamGame) =>
    set((state) => ({
      previousScreen: state.screen,
      screen: 'game-details',
      selectedGameId: `steam:${steamGame.appId}`,
      detailsTab: 'overview',
      steamGame,
    })),
  openGameEdit: (gameId) =>
    set((state) => ({
      previousScreen: state.screen,
      screen: 'game-details',
      detailsTab: 'settings',
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
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  openHomeMenu: () => set({ homeMenuOpen: true }),
  closeHomeMenu: () => set({ homeMenuOpen: false }),
  toggleHomeMenu: () => set((state) => ({ homeMenuOpen: !state.homeMenuOpen })),
}))
