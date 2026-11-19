import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { useUiStore } from '@/stores/ui.store'
import { NotInstalledGames } from '../NotInstalledGames'

const dota = {
  appId: '570',
  title: 'Dota 2',
  description: 'A multiplayer battle arena.',
  coverUrl: 'https://cdn.steamgriddb.com/grid/dota.png',
  heroUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/570/library_hero.jpg',
  installed: false,
}
const cs = {
  appId: '730',
  title: 'Counter-Strike 2',
  description: null,
  coverUrl: 'https://cdn.steamgriddb.com/grid/cs2.png',
  heroUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/730/library_hero.jpg',
  installed: true,
}

vi.mock('@/lib/tauri', () => ({
  steamWindowsStatus: vi.fn(),
  steamWindowsLibrary: vi.fn(),
  steamWindowsPreferences: vi.fn().mockResolvedValue({
    offlineMode: false,
    verifyFiles: true,
  }),
  setSteamWindowsPreferences: vi.fn(async (preferences: unknown) => preferences),
  connectSteamWindows: vi.fn(),
  cancelSteamWindowsSignIn: vi.fn(),
  disconnectSteamWindows: vi.fn(),
  refreshSteamWindowsLibrary: vi.fn(),
}))

import { steamWindowsLibrary, steamWindowsStatus } from '@/lib/tauri'

const status = vi.mocked(steamWindowsStatus)
const library = vi.mocked(steamWindowsLibrary)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderLibrary() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NotInstalledGames />
    </QueryClientProvider>,
  )
}

it('opens an uninstalled game and keeps installed games in the All view', async () => {
  status.mockResolvedValue({
    signedIn: true,
    accountName: 'orbit_player',
    steamInstalled: true,
    clientRunning: false,
    clientLoggedIn: true,
    clientPhase: 'ready',
    clientCaption: 'Steam is ready',
    ownedCount: 2,
    sessionReady: true,
  })
  library.mockResolvedValue([dota, cs])
  renderLibrary()

  expect(await screen.findByRole('heading', { name: 'Steam games' })).toBeTruthy()
  expect(await screen.findByRole('button', { name: 'Counter-Strike 2' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Not installed' }))
  expect(screen.queryByRole('button', { name: 'Counter-Strike 2' })).toBeNull()
  const card = await screen.findByRole('button', { name: 'Dota 2' })
  expect(card.querySelector('.square-game-art')).toBeTruthy()
  expect(card.querySelector('.aspect-square')).toBeTruthy()
  fireEvent.click(card)
  expect(useUiStore.getState().screen).toBe('game-details')
  expect(useUiStore.getState().steamGame).toEqual({
    appId: '570',
    title: 'Dota 2',
    description: 'A multiplayer battle arena.',
    coverUrl: 'https://cdn.steamgriddb.com/grid/dota.png',
    heroUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/570/library_hero.jpg',
    installed: false,
  })
})

it('shows God of War when the owned list is longer than 30 titles', async () => {
  status.mockResolvedValue({
    signedIn: true,
    accountName: 'orbit_player',
    steamInstalled: true,
    clientRunning: false,
    clientLoggedIn: true,
    clientPhase: 'ready',
    clientCaption: 'Steam is ready',
    ownedCount: 40,
    sessionReady: true,
  })
  const filler = Array.from({ length: 39 }, (_, index) => ({
    appId: String(index + 1),
    title: `Filler ${String(index + 1).padStart(2, '0')}`,
    description: null,
    coverUrl: '',
    heroUrl: '',
    installed: false,
  }))
  library.mockResolvedValue([
    ...filler,
    {
      appId: '1593500',
      title: 'God of War',
      description: null,
      coverUrl: '',
      heroUrl: '',
      installed: true,
    },
  ])
  renderLibrary()
  expect(await screen.findByRole('button', { name: 'God of War' })).toBeTruthy()
  fireEvent.change(screen.getByRole('textbox', { name: 'Search Steam games' }), {
    target: { value: 'god of war' },
  })
  expect(screen.getByRole('button', { name: 'God of War' })).toBeTruthy()
  expect(screen.queryByText('Filler 01')).toBeNull()
})

it('shows a loading overlay while the Steam library is fetching', async () => {
  status.mockResolvedValue({
    signedIn: true,
    accountName: 'orbit_player',
    steamInstalled: true,
    clientRunning: false,
    clientLoggedIn: true,
    clientPhase: 'ready',
    clientCaption: 'Steam is ready',
    ownedCount: 2,
    sessionReady: true,
  })
  library.mockReturnValue(new Promise(() => undefined))
  renderLibrary()
  expect(
    await screen.findByRole('status', { name: 'Loading Steam library' }),
  ).toBeTruthy()
  expect(screen.getByText('Loading Steam library…')).toBeTruthy()
})
