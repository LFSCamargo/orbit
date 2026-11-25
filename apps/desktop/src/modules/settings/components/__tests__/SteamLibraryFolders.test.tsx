import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import {
  addInstallLocation,
  scanSteamInstallations,
  steamWindowsPreferences,
} from '@/lib/tauri'
import { SteamLibraryFolders } from '../SteamLibraryFolders'

const save = vi.fn(async (preferences: unknown) => preferences)

vi.mock('@/lib/tauri', () => ({
  steamWindowsStatus: vi.fn().mockResolvedValue({ signedIn: false }),
  steamWindowsLibrary: vi.fn().mockResolvedValue([]),
  steamWindowsPreferences: vi.fn(),
  setSteamWindowsPreferences: (preferences: unknown) => save(preferences),
  addInstallLocation: vi.fn(),
  connectSteamWindows: vi.fn(),
  disconnectSteamWindows: vi.fn(),
  scanSteamInstallations: vi
    .fn()
    .mockResolvedValue({ imported: 2, enriched: 0, provider: 'steam' }),
}))

afterEach(() => {
  cleanup()
  save.mockClear()
})

function renderFolders(paths: string[]) {
  vi.mocked(steamWindowsPreferences).mockResolvedValue({
    offlineMode: false,
    verifyFiles: true,
    additionalLibraryPaths: paths,
  })
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SteamLibraryFolders />
    </QueryClientProvider>,
  )
}

it('shows an empty state and no scan action before any folder is added', async () => {
  renderFolders([])
  expect(await screen.findByText('No extra folders yet')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Scan installed games' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Add library folder' })).toBeDisabled()
})

it('lists each folder with its name, full path and a labelled remove action', async () => {
  renderFolders(['/Users/player/GameHub/steamapps/common'])
  const list = await screen.findByRole('list', { name: 'Steam library folders' })
  expect(list.textContent).toContain('GameHub')
  expect(screen.getByText('/Users/player/GameHub/steamapps/common')).toBeTruthy()
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Remove library folder /Users/player/GameHub/steamapps/common',
    }),
  )
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ additionalLibraryPaths: [] }),
    ),
  )
})

it('rescans saved folders from the card header', async () => {
  renderFolders(['/Users/player/SteamLibrary'])
  fireEvent.click(await screen.findByRole('button', { name: 'Scan installed games' }))
  await waitFor(() => expect(scanSteamInstallations).toHaveBeenCalled())
  expect(await screen.findByText(/2 new games added/)).toBeTruthy()
})

it('offers to create a Steam folder and enable downloads when adding an empty path fails', async () => {
  save.mockRejectedValueOnce(
    new Error('Choose a Steam library or its steamapps/common folder'),
  )
  vi.mocked(addInstallLocation).mockResolvedValue({
    id: '/Volumes/Fast Drive/Orbit',
    label: 'Fast Drive · Orbit',
    path: '/Volumes/Fast Drive/Orbit',
    available: true,
    freeBytes: 900_000_000_000,
    totalBytes: 1_000_000_000_000,
    isDefault: false,
    gameCount: 0,
  })
  renderFolders([])
  fireEvent.change(await screen.findByLabelText('Additional Steam library folder'), {
    target: { value: '/Volumes/Fast\\ Drive/Orbit' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Add library folder' }))

  const createBtn = await screen.findByRole('button', {
    name: 'Create Steam folder and allow downloads here',
  })
  fireEvent.click(createBtn)
  await waitFor(() =>
    expect(addInstallLocation).toHaveBeenCalledWith('/Volumes/Fast\\ Drive/Orbit'),
  )
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Created Fast Drive · Orbit (/Volumes/Fast Drive/Orbit) and enabled downloads there.',
  )
})
