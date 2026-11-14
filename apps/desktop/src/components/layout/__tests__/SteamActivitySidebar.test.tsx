import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useDownloadStore } from '@/lib/downloadProgress'
import { SteamActivitySidebar } from '../SteamActivitySidebar'

vi.mock('@/lib/tauri', () => ({
  steamWindowsStatus: vi.fn(),
  steamWindowsPreferences: vi.fn().mockResolvedValue({
    offlineMode: false,
    verifyFiles: true,
  }),
  setSteamWindowsPreferences: vi.fn(async (preferences: unknown) => preferences),
  steamWindowsLibrary: vi.fn(),
  connectSteamWindows: vi.fn(),
  startSteamWindowsQr: vi.fn(),
  pollSteamWindowsQr: vi.fn(),
  beginSteamWindowsPassword: vi.fn(),
  submitSteamWindowsGuard: vi.fn(),
  cancelSteamWindowsSignIn: vi.fn(),
  disconnectSteamWindows: vi.fn(),
  refreshSteamWindowsLibrary: vi.fn(),
  downloadSteamWindowsGame: vi.fn(),
  cancelSteamWindowsDownload: vi.fn(),
  playSteamWindowsGame: vi.fn(),
}))

import {
  connectSteamWindows,
  pollSteamWindowsQr,
  startSteamWindowsQr,
  steamWindowsLibrary,
  steamWindowsStatus,
} from '@/lib/tauri'
import type { SteamQrPoll, SteamQrStart } from '@/types/steam'

const status = vi.mocked(steamWindowsStatus)
const library = vi.mocked(steamWindowsLibrary)
const connect = vi.mocked(connectSteamWindows)
const startQr = vi.mocked(startSteamWindowsQr)
const pollQr = vi.mocked(pollSteamWindowsQr)

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function renderSidebar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SteamActivitySidebar onClose={() => undefined} />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  useDownloadStore.setState({ tasks: {}, failures: {} })
})

beforeEach(() => {
  status.mockResolvedValue({
    signedIn: false,
    accountName: null,
    steamInstalled: true,
    clientRunning: false,
    ownedCount: 0,
  })
  library.mockResolvedValue([])
  connect.mockResolvedValue({
    signedIn: true,
    accountName: 'orbit_player',
    steamInstalled: true,
    clientRunning: false,
    ownedCount: 1,
  })
  startQr.mockResolvedValue({
    qrSvg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    clientId: '1',
    requestId: 'abc',
    intervalSeconds: 5,
  })
  pollQr.mockResolvedValue({
    done: false,
    status: null,
    libraryError: null,
  })
})

it('docks to the right and signs in with a QR code inside Orbit', async () => {
  library.mockResolvedValue([
    {
      appId: '570',
      title: 'Dota 2',
      description: 'A multiplayer battle arena.',
      coverUrl:
        'https://cdn.akamai.steamstatic.com/steam/apps/570/library_600x900_2x.jpg',
      heroUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/570/library_hero.jpg',
      installed: false,
    },
  ])
  renderSidebar()
  const host = screen.getByTestId('steam-activity-host')
  expect(host).toHaveStyle({ position: 'fixed', right: '0px', top: '0px' })

  expect(screen.queryByLabelText(/password/i)).toBeNull()
  expect(await screen.findByRole('button', { name: 'Sign in with Steam' })).toBeTruthy()
  expect(screen.getByRole('region', { name: 'Steam authorization' })).toBeTruthy()
  expect(screen.getByText('Not authorized')).toBeTruthy()
  expect(screen.getByText('Steam client is closed')).toBeTruthy()

  const startGate = deferred<SteamQrStart>()
  const pollGate = deferred<SteamQrPoll>()
  startQr.mockImplementation(() => startGate.promise)
  pollQr.mockImplementation(() => pollGate.promise)

  fireEvent.click(screen.getByRole('button', { name: 'Sign in with Steam' }))

  const dialog = await screen.findByRole('dialog', { name: 'Sign in to Steam' })
  expect(dialog).toHaveStyle({ background: '#f7f8fb', color: '#141820' })
  expect(
    within(dialog).getByRole('status', { name: 'Loading Steam sign-in' }),
  ).toBeTruthy()
  expect(within(dialog).getByRole('button', { name: 'Account' })).toBeTruthy()
  expect(connect).not.toHaveBeenCalled()

  await act(async () => {
    startGate.resolve({
      qrSvg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      clientId: '1',
      requestId: 'abc',
      intervalSeconds: 5,
    })
  })

  expect(await within(dialog).findByRole('img', { name: 'Steam QR code' })).toBeTruthy()
  expect(
    within(dialog).queryByRole('status', { name: 'Loading Steam sign-in' }),
  ).toBeNull()

  fireEvent.click(within(dialog).getByRole('button', { name: 'Account' }))
  expect(within(dialog).getByLabelText('Password')).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('button', { name: 'QR code' }))
  expect(within(dialog).getByRole('img', { name: 'Steam QR code' })).toBeTruthy()

  await act(async () => {
    pollGate.resolve({
      done: true,
      status: {
        signedIn: true,
        accountName: 'orbit_player',
        steamInstalled: true,
        clientRunning: false,
        ownedCount: 1,
      },
      libraryError: null,
    })
  })

  expect(await screen.findByText('Signed in as orbit_player')).toBeTruthy()
  expect(screen.getByText('Authorized')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Open library' })).toBeTruthy()
  expect(screen.queryByText('Dota 2')).toBeNull()
  expect(screen.queryByRole('dialog', { name: 'Sign in to Steam' })).toBeNull()
  expect(connect).not.toHaveBeenCalled()
})

it('shows a progress bar for an in-progress download', () => {
  useDownloadStore.setState({
    tasks: {
      'steam:570': {
        key: 'steam:570',
        label: 'Steam 570',
        startedAt: '2026-11-13T00:00:00.000Z',
        progress: {
          phase: 'Downloading',
          component: 'Steam 570',
          downloadedBytes: 25_000_000,
          totalBytes: 100_000_000,
        },
      },
    },
    failures: {},
  })
  renderSidebar()
  expect(screen.getByRole('progressbar', { name: 'Steam 570 progress' })).toHaveValue(25)
})

it('directs owned-game browsing to Library', async () => {
  renderSidebar()
  fireEvent.click(screen.getByRole('button', { name: 'Open library' }))
  const { useUiStore } = await import('@/stores/ui.store')
  expect(useUiStore.getState().screen).toBe('library')
  expect(screen.queryByRole('region', { name: 'Owned Windows games' })).toBeNull()
})
