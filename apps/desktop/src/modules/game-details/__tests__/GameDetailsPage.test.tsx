import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GameDetailsPage } from '../GameDetailsPage'
import { useUiStore } from '@/stores/ui.store'
import type { LibraryEntry } from '@/types/library'

const portal: LibraryEntry = {
  id: 'steam:10',
  steamAppId: '10',
  owned: true,
  preferredInstallationId: null,
  installations: [],
  game: {
    id: 'steam:10',
    title: 'Portal',
    sortTitle: 'portal',
    description: 'Think with portals.',
    provider: 'steam',
    platform: 'windows',
    launchConfig: { type: 'steam', appId: '10' },
    artwork: {},
    favorite: false,
    hidden: false,
    dateAdded: '2026-01-01T00:00:00Z',
    totalPlaytimeSeconds: 0,
    achievements: [],
  },
}

const installed: LibraryEntry = {
  ...portal,
  id: 'steam:1091500',
  steamAppId: '1091500',
  installations: [
    {
      id: 'mock-cyberpunk',
      gameId: 'mock-cyberpunk',
      platform: 'macos',
      path: '/Games/Cyberpunk.app',
      available: true,
      launchType: 'steam',
    },
  ],
  game: {
    ...portal.game,
    id: 'mock-cyberpunk',
    title: 'Cyberpunk 2077',
    description: 'An open-world RPG in Night City.',
    launchConfig: { type: 'steam', appId: '1091500' },
    favorite: true,
    totalPlaytimeSeconds: 4140,
  },
}

const useLibraryEntry = vi.fn()
vi.mock('@/hooks/useLibrary', () => ({
  useLibraryEntry: (id: string | null) => useLibraryEntry(id),
  useLibraryActions: () => ({
    update: { mutate: vi.fn(), isPending: false, error: null },
    remove: { mutate: vi.fn(), isPending: false, error: null },
  }),
}))
vi.mock('@/hooks/useSteamWindows', () => ({
  useSteamWindows: () => ({ status: { data: { signedIn: true } } }),
}))
vi.mock('@/hooks/useGames', () => ({
  useGameActions: () => ({
    launch: { mutate: vi.fn(), isPending: false, error: null },
    stop: { mutate: vi.fn(), isPending: false },
    update: { mutateAsync: vi.fn(), isPending: false },
  }),
}))
vi.mock('@/hooks/useActiveTheme', () => ({
  useActiveTheme: () => ({
    id: 'liquid-glass',
    branding: {},
    colors: { canvas: '6 6 8', accent: '249 115 22', focus: '250 204 21' },
  }),
}))
vi.mock('@/components/layout/DrawerProvider', () => ({
  useDrawer: () => ({ openDrawer: vi.fn(), closeDrawer: vi.fn() }),
}))
vi.mock('@/modules/game-details/hooks/useRandomArtwork', () => ({
  useRandomArtwork: () => ({ randomize: vi.fn(), busySlot: null, error: null }),
}))

function renderPage() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <GameDetailsPage />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

beforeEach(() => {
  useUiStore.setState({
    selectedGameId: 'steam:10',
    detailsTab: 'overview',
    screen: 'game-details',
    previousScreen: 'library',
  })
})

it('shows Install for an owned title that is not on disk', () => {
  useLibraryEntry.mockReturnValue({ data: portal, isLoading: false, error: null })
  renderPage()
  expect(screen.getByRole('heading', { name: 'Portal' })).toBeTruthy()
  expect(screen.getByText('NOT INSTALLED')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Install' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Play now/ })).toBeNull()
  expect(document.querySelector('.details-hero-art')).toHaveClass('hidden')
  expect(document.querySelector('.details-hero-shade')).toHaveClass('hidden')
  expect(document.querySelector('.details-play')).toHaveClass('rounded-full')
  expect(document.querySelector('.details-command-bar')).toBeTruthy()
})

it('hides importer placeholders and shows can-you-run copy from the catalog', () => {
  useLibraryEntry.mockReturnValue({
    data: {
      ...portal,
      game: { ...portal.game, description: 'Imported from GameHub.' },
      runInfo: {
        minimum: 'OS: Windows 10',
        recommended: '8 GB RAM',
        protonTier: 'gold',
      },
    },
    isLoading: false,
    error: null,
  })
  renderPage()
  expect(screen.queryByText('Imported from GameHub.')).toBeNull()
  expect(screen.getByText('No description has been added yet.')).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'System requirements' })).toBeTruthy()
  expect(screen.getByText('ProtonDB Gold')).toHaveClass('details-proton-gold')
  expect(screen.getByText('OS: Windows 10')).toBeTruthy()
})

it('plays the selected installation and honors the Settings tab from navigation', () => {
  useLibraryEntry.mockReturnValue({ data: installed, isLoading: false, error: null })
  useUiStore.setState({ selectedGameId: 'steam:1091500', detailsTab: 'settings' })
  renderPage()
  expect(screen.getByRole('heading', { name: 'Cyberpunk 2077' })).toBeTruthy()
  expect(screen.getByRole('tab', { name: 'Settings' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  const title = screen.getByLabelText('Game title')
  fireEvent.change(title, { target: { value: 'My draft title' } })
  fireEvent.click(screen.getByRole('tab', { name: 'Artwork' }))
  fireEvent.click(screen.getByRole('tab', { name: 'General' }))
  expect(screen.getByLabelText('Game title')).toHaveProperty('value', 'My draft title')
  fireEvent.click(screen.getByRole('tab', { name: 'Overview' }))
  expect(useUiStore.getState().detailsTab).toBe('overview')
  expect(screen.getByRole('button', { name: /Continue playing/ })).toBeTruthy()
})
