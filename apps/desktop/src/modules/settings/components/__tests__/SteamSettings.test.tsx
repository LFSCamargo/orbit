import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import {
  installWindowsSteam,
  scanSteamInstallations,
  steamWindowsStatus,
} from '@/lib/tauri'
import { useDownloadStore } from '@/lib/downloadProgress'
import { SteamLibraryFolders } from '../SteamLibraryFolders'
import { SteamSettings } from '../SteamSettings'

const save = vi.fn(async (preferences: unknown) => preferences)

vi.mock('@/lib/tauri', () => ({
  steamWindowsStatus: vi.fn().mockResolvedValue({
    signedIn: false,
    accountName: null,
    steamInstalled: false,
    clientRunning: false,
    clientLoggedIn: false,
    clientPhase: 'stopped',
    clientCaption: '',
    ownedCount: 0,
  }),
  steamWindowsLibrary: vi.fn().mockResolvedValue([]),
  steamWindowsPreferences: vi.fn().mockResolvedValue({
    offlineMode: false,
    verifyFiles: true,
  }),
  setSteamWindowsPreferences: (preferences: unknown) => save(preferences),
  connectSteamWindows: vi.fn(),
  openSteamWindowsLogin: vi.fn(),
  placeSteamWindowsLogin: vi.fn(),
  pollSteamWindowsLogin: vi.fn(),
  startSteamWindowsQr: vi.fn(),
  pollSteamWindowsQr: vi.fn(),
  beginSteamWindowsPassword: vi.fn(),
  submitSteamWindowsGuard: vi.fn(),
  cancelSteamWindowsSignIn: vi.fn(),
  disconnectSteamWindows: vi.fn(),
  installWindowsSteam: vi.fn(),
  scanSteamInstallations: vi
    .fn()
    .mockResolvedValue({ imported: 4, enriched: 0, provider: 'steam' }),
}))

afterEach(() => {
  cleanup()
  save.mockClear()
  vi.mocked(installWindowsSteam).mockReset()
  vi.mocked(steamWindowsStatus).mockResolvedValue({
    signedIn: false,
    accountName: null,
    steamInstalled: false,
    clientRunning: false,
    clientLoggedIn: false,
    clientPhase: 'stopped',
    clientCaption: '',
    ownedCount: 0,
  })
  useDownloadStore.setState({ tasks: {}, failures: {} })
})

function renderSteam() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SteamSettings />
    </QueryClientProvider>,
  )
}

it('gives Steam its own authorization section and saves offline mode', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <SteamSettings />
    </QueryClientProvider>,
  )

  expect(await screen.findByRole('region', { name: 'Steam authorization' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Steam' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Sign in with Steam' })).toBeTruthy()
  expect(
    await screen.findByRole('button', { name: 'Install Steam for Windows' }),
  ).toBeTruthy()
  expect(screen.queryByLabelText(/password/i)).toBeNull()

  fireEvent.click(screen.getByRole('switch', { name: 'Offline mode' }))

  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({ offlineMode: true, verifyFiles: true }),
  )
})

it('saves an additional existing Steam library path', async () => {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SteamLibraryFolders />
    </QueryClientProvider>,
  )
  fireEvent.change(await screen.findByLabelText('Additional Steam library folder'), {
    target: { value: '/Users/player/GameHub/steamapps/common' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Add library folder' }))
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({
      offlineMode: false,
      verifyFiles: true,
      additionalLibraryPaths: ['/Users/player/GameHub/steamapps/common'],
    }),
  )
  expect(await screen.findByText('/Users/player/GameHub/steamapps/common')).toBeTruthy()
  await waitFor(() => expect(scanSteamInstallations).toHaveBeenCalled())
  expect(await screen.findByText(/Library scan complete/)).toBeTruthy()
})

it('shows install progress until Steam for Windows is ready', async () => {
  let finish: (() => void) | undefined
  vi.mocked(installWindowsSteam).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  renderSteam()
  fireEvent.click(
    await screen.findByRole('button', { name: 'Install Steam for Windows' }),
  )
  expect(await screen.findByTestId('download-progress')).toBeVisible()
  expect(screen.getByText(/Preparing Steam for Windows/)).toBeVisible()
  expect(
    screen.getByRole('button', { name: 'Preparing the Steam environment…' }),
  ).toBeDisabled()
  await act(async () => finish?.())
  await waitFor(() =>
    expect(useDownloadStore.getState().tasks['steam:setup']?.progress?.phase).toBe(
      'Ready',
    ),
  )
})

it('keeps a Steam install error visible', async () => {
  vi.mocked(installWindowsSteam).mockRejectedValue(
    new Error('The Steam compatibility environment could not be created'),
  )
  renderSteam()
  fireEvent.click(
    await screen.findByRole('button', { name: 'Install Steam for Windows' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The Steam compatibility environment could not be created',
  )
})

it('hides install when Steam for Windows is already present', async () => {
  vi.mocked(steamWindowsStatus).mockResolvedValue({
    signedIn: true,
    accountName: 'orbit_player',
    steamInstalled: true,
    clientRunning: false,
    clientLoggedIn: true,
    clientPhase: 'ready',
    clientCaption: 'Steam is ready',
    ownedCount: 4,
  })
  renderSteam()
  expect(await screen.findByRole('region', { name: 'Steam authorization' })).toBeTruthy()
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: /Install Steam for Windows/ }),
    ).toBeNull(),
  )
})
