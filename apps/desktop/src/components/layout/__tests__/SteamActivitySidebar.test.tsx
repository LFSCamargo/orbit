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
  openSteamWindowsLogin: vi.fn().mockResolvedValue(undefined),
  placeSteamWindowsLogin: vi.fn(),
  pollSteamWindowsLogin: vi.fn(),
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
  getDownloadQueue: vi.fn(),
  enqueueSteamDownload: vi.fn(),
  pauseActiveDownload: vi.fn(),
  removeQueuedDownload: vi.fn(),
  startQueuedDownloadNow: vi.fn(),
  listLibraryEntries: vi
    .fn()
    .mockResolvedValue({ entries: [], total: 0, nextCursor: null }),
}))

import {
  connectSteamWindows,
  enqueueSteamDownload,
  getDownloadQueue,
  listLibraryEntries,
  openSteamWindowsLogin,
  pauseActiveDownload,
  pollSteamWindowsLogin,
  removeQueuedDownload,
  startQueuedDownloadNow,
  steamWindowsLibrary,
  steamWindowsStatus,
} from '@/lib/tauri'
import type { SteamLoginPoll, SteamWindowsStatus } from '@/types/steam'

const status = vi.mocked(steamWindowsStatus)
const library = vi.mocked(steamWindowsLibrary)
const connect = vi.mocked(connectSteamWindows)
const openLogin = vi.mocked(openSteamWindowsLogin)
const pollLogin = vi.mocked(pollSteamWindowsLogin)
const queue = vi.mocked(getDownloadQueue)

const AUTHORIZED: SteamWindowsStatus = {
  signedIn: true,
  accountName: 'orbit_player',
  steamInstalled: true,
  clientRunning: false,
  clientLoggedIn: false,
  clientPhase: 'ready',
  clientCaption: 'Steam is ready',
  ownedCount: 12,
  sessionReady: true,
}
const queued = (appId: string, title: string, paused = false) => ({
  appId,
  title,
  coverUrl: null,
  paused,
})

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function renderSidebar(onClose: () => void = () => undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SteamActivitySidebar onClose={onClose} />
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
    clientLoggedIn: false,
    clientPhase: 'stopped',
    clientCaption: '',
    ownedCount: 0,
    sessionReady: false,
  })
  library.mockResolvedValue([])
  queue.mockResolvedValue({ active: null, pending: [] })
  connect.mockResolvedValue({
    signedIn: true,
    accountName: 'orbit_player',
    steamInstalled: true,
    clientRunning: false,
    clientLoggedIn: true,
    clientPhase: 'ready',
    clientCaption: 'Steam is ready',
    ownedCount: 1,
    sessionReady: true,
  })
  pollLogin.mockResolvedValue({
    done: false,
    status: null,
    libraryError: null,
  })
})

it('asks to connect Steam before downloads and opens Steam’s own window', async () => {
  renderSidebar()
  const host = screen.getByTestId('steam-activity-host')
  expect(host).toHaveStyle({ position: 'fixed', right: '0px', top: '0px' })
  expect(await screen.findByText('Connect your Steam account')).toBeTruthy()
  expect(screen.getByText('Not connected')).toBeTruthy()
  expect(screen.queryByText('No downloads yet')).toBeNull()

  const pollGate = deferred<SteamLoginPoll>()
  pollLogin.mockImplementation(() => pollGate.promise)
  fireEvent.click(screen.getByRole('button', { name: 'Connect Steam' }))
  fireEvent.click(screen.getByRole('button', { name: 'Connect Steam' }))

  const dialog = await screen.findByRole('dialog', { name: 'Sign in to Steam' })
  expect(within(dialog).queryByLabelText(/password/i)).toBeNull()
  expect(openLogin).toHaveBeenCalledTimes(1)
  expect(connect).not.toHaveBeenCalled()

  status.mockResolvedValue(AUTHORIZED)
  await act(async () => {
    pollGate.resolve({ done: true, status: AUTHORIZED, libraryError: null })
  })
  expect(await screen.findByText('No downloads yet')).toBeTruthy()
  expect(screen.queryByRole('dialog', { name: 'Sign in to Steam' })).toBeNull()
})

it('shows empty downloads, queue and network once Steam is authorized', async () => {
  status.mockResolvedValue(AUTHORIZED)
  renderSidebar()
  expect(await screen.findByText('No downloads yet')).toBeTruthy()
  expect(screen.getByText('Queue is empty')).toBeTruthy()
  expect(screen.getByRole('region', { name: 'Network' })).toBeTruthy()
  expect(screen.queryByText('Connect your Steam account')).toBeNull()
})

it('shows cover, bytes and a live bar for the active download, with pause', async () => {
  status.mockResolvedValue(AUTHORIZED)
  queue.mockResolvedValue({ active: queued('570', 'Dota 2'), pending: [] })
  useDownloadStore.setState({
    tasks: {
      'steam:570': {
        key: 'steam:570',
        label: 'Dota 2',
        startedAt: '2026-11-13T00:00:00.000Z',
        progress: {
          phase: 'Downloading',
          component: 'Dota 2',
          downloadedBytes: 25_000_000,
          totalBytes: 100_000_000,
        },
      },
    },
    failures: {},
  })
  renderSidebar()
  const bar = screen.getByRole('progressbar', { name: 'Dota 2 progress' })
  expect(bar).toHaveAttribute('aria-valuenow', '25')
  expect(screen.getByText('4/6 · Downloading · 25.0 MB / 100.0 MB')).toBeTruthy()
  fireEvent.click(await screen.findByRole('button', { name: 'Pause Dota 2' }))
  expect(pauseActiveDownload).toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel Dota 2' }))
  expect(removeQueuedDownload).toHaveBeenCalledWith('570')
})

it('lists the queue in order and can run, resume or remove a title', async () => {
  status.mockResolvedValue(AUTHORIZED)
  queue.mockResolvedValue({
    active: null,
    pending: [queued('730', 'Counter-Strike 2', true), queued('440', 'Team Fortress 2')],
  })
  renderSidebar()
  const rows = await screen.findAllByTestId('queue-row')
  expect(rows).toHaveLength(2)
  expect(within(rows[0]).getByText('Counter-Strike 2')).toBeTruthy()
  expect(within(rows[1]).getByText('Team Fortress 2')).toBeTruthy()
  expect(within(rows[0]).getByText('Paused')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Resume Counter-Strike 2' }))
  expect(startQueuedDownloadNow).toHaveBeenCalledWith('730')
  fireEvent.click(
    screen.getByRole('button', { name: 'Remove Team Fortress 2 from the queue' }),
  )
  expect(removeQueuedDownload).toHaveBeenCalledWith('440')
})

it('clears finished downloads on request and closes on back', async () => {
  status.mockResolvedValue(AUTHORIZED)
  useDownloadStore.setState({
    tasks: {
      'steam:570': {
        key: 'steam:570',
        label: 'Dota 2',
        startedAt: '2026-11-13T00:00:00.000Z',
        progress: { phase: 'Ready', component: 'Dota 2', message: 'Installed' },
      },
    },
    failures: {},
  })
  const onClose = vi.fn()
  renderSidebar(onClose)
  expect(screen.getByText('Installed')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Clear completed' }))
  expect(useDownloadStore.getState().tasks['steam:570']).toBeUndefined()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('floats as a glass sheet over a blur overlay that closes it', async () => {
  const onClose = vi.fn()
  renderSidebar(onClose)
  const scrim = screen.getByTestId('steam-activity-scrim')
  expect(scrim).toHaveAttribute('aria-hidden', 'true')
  const drawer = screen.getByRole('dialog', { name: 'Downloads' })
  expect(drawer.className).toContain('orbit-glass')
  expect(drawer.closest('.steam-activity-sheet')).not.toBeNull()
  fireEvent.click(scrim)
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('puts network first and describes each section', async () => {
  status.mockResolvedValue(AUTHORIZED)
  renderSidebar()
  await screen.findByText('No downloads yet')
  const network = screen.getByRole('region', { name: 'Network' })
  const downloads = screen.getByRole('region', { name: 'Active downloads' })
  expect(
    network.compareDocumentPosition(downloads) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  expect(screen.getByText('Live transfer speed for Steam downloads.')).toBeTruthy()
  expect(screen.getByText('Games and components installing now.')).toBeTruthy()
  expect(
    screen.getByText('Up next, in order. Start one now or take it out.'),
  ).toBeTruthy()
})

it('suggests played games that are not installed, and installs Steam ones', async () => {
  status.mockResolvedValue(AUTHORIZED)
  const played = (id: string, title: string, seconds: number, available: boolean) => ({
    id,
    steamAppId: id.replace('steam:', ''),
    owned: true,
    preferredInstallationId: null,
    installations: [{ available }],
    game: { id, title, hidden: false, totalPlaytimeSeconds: seconds, artwork: {} },
  })
  vi.mocked(listLibraryEntries).mockResolvedValueOnce({
    entries: [
      played('steam:620', 'Portal 2', 7200, false),
      played('steam:570', 'Dota 2', 36000, false),
      played('steam:400', 'Portal', 3600, true),
    ],
    total: 3,
    nextCursor: null,
  } as never)
  renderSidebar()
  const section = await screen.findByRole('region', { name: 'Played, not installed' })
  const rows = within(section).getAllByTestId('played-row')
  expect(rows.map((row) => row.textContent)).toEqual([
    expect.stringContaining('Dota 2'),
    expect.stringContaining('Portal 2'),
  ])
  fireEvent.click(within(section).getByRole('button', { name: 'Install Dota 2' }))
  expect(enqueueSteamDownload).toHaveBeenCalledWith('570')
})
