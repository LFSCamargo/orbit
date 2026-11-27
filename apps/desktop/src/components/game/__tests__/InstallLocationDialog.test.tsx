import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useDownloadStore } from '@/lib/downloadProgress'
import type { InstallLocation } from '@/types/downloads'

vi.mock('@/lib/tauri', () => ({
  listInstallLocations: vi.fn(),
  addInstallLocation: vi.fn(),
  removeInstallLocation: vi.fn(),
  enqueueSteamDownload: vi.fn(),
}))
vi.mock('@/lib/dialog', () => ({ open: vi.fn() }))

import { open as openPanel } from '@/lib/dialog'
import {
  addInstallLocation,
  enqueueSteamDownload,
  listInstallLocations,
  removeInstallLocation,
} from '@/lib/tauri'
import {
  InstallLocationDialog,
  initialLocation,
  spaceCaption,
} from '../InstallLocationDialog'

const mac: InstallLocation = {
  id: 'this-mac',
  label: 'This Mac',
  path: null,
  available: true,
  freeBytes: 20_000_000_000,
  totalBytes: 494_000_000_000,
  isDefault: false,
  gameCount: 0,
}
const drive: InstallLocation = {
  id: '/Volumes/T7/Games',
  label: 'T7 · Games',
  path: '/Volumes/T7/Games',
  available: true,
  freeBytes: 900_000_000_000,
  totalBytes: 1_000_000_000_000,
  isDefault: true,
  gameCount: 0,
}

function renderDialog(onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <InstallLocationDialog game={{ appId: '570', title: 'Dota 2' }} onClose={onClose} />
    </QueryClientProvider>,
  )
  return onClose
}

beforeEach(() => {
  vi.mocked(listInstallLocations).mockResolvedValue([mac, drive])
  vi.mocked(enqueueSteamDownload).mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  useDownloadStore.setState({ tasks: {}, failures: {} })
})

it('preselects the last connected location and falls back to This Mac', () => {
  expect(initialLocation([mac, drive])).toBe('/Volumes/T7/Games')
  expect(initialLocation([mac, { ...drive, available: false }])).toBe('this-mac')
  expect(spaceCaption(drive)).toBe('838 GB free of 931 GB')
  expect(spaceCaption({ ...drive, available: false })).toBe('Not connected')
})

it('installs the game into the chosen location and tracks it at once', async () => {
  const onClose = renderDialog()
  const external = await screen.findByRole('radio', { name: /T7 · Games/ })
  await waitFor(() => expect(external).toHaveAttribute('aria-checked', 'true'))
  fireEvent.click(screen.getByRole('radio', { name: /This Mac/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Install' }))
  expect(enqueueSteamDownload).toHaveBeenCalledWith('570', 'this-mac')
  expect(onClose).toHaveBeenCalled()
  expect(useDownloadStore.getState().tasks['steam:570']?.label).toBe('Dota 2')
})

it('adds a picked folder and keeps it selected after the list refreshes', async () => {
  vi.mocked(openPanel).mockResolvedValue('/Volumes/SlowDrive')
  const added = {
    ...drive,
    id: '/Volumes/SlowDrive',
    label: 'SlowDrive',
    isDefault: false,
  }
  vi.mocked(addInstallLocation).mockResolvedValue(added)
  renderDialog()
  await screen.findByRole('radio', { name: /This Mac/ })
  vi.mocked(listInstallLocations).mockResolvedValue([mac, drive, added])
  fireEvent.click(screen.getByRole('button', { name: 'Add a folder…' }))
  const radio = await screen.findByRole('radio', { name: /SlowDrive/ })
  expect(addInstallLocation).toHaveBeenCalledWith('/Volumes/SlowDrive')
  await waitFor(() => expect(radio).toHaveAttribute('aria-checked', 'true'))
})

it('cannot install to a disconnected drive and removes unused folders', async () => {
  vi.mocked(listInstallLocations).mockResolvedValue([
    mac,
    { ...drive, available: false, isDefault: false },
  ])
  renderDialog()
  expect(await screen.findByRole('radio', { name: /Not connected/ })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Remove T7 · Games' }))
  expect(removeInstallLocation).toHaveBeenCalledWith('/Volumes/T7/Games')
})

it('keeps a location that still holds games', async () => {
  vi.mocked(listInstallLocations).mockResolvedValue([mac, { ...drive, gameCount: 2 }])
  renderDialog()
  await screen.findByRole('radio', { name: /T7 · Games/ })
  expect(screen.queryByRole('button', { name: 'Remove T7 · Games' })).toBeNull()
})

it('creates and selects a typed folder path on a new SSD', async () => {
  const fastDrive: InstallLocation = {
    ...drive,
    id: '/Volumes/Fast Drive/Orbit',
    label: 'Fast Drive · Orbit',
    path: '/Volumes/Fast Drive/Orbit',
    isDefault: false,
  }
  vi.mocked(addInstallLocation).mockResolvedValue(fastDrive)
  renderDialog()
  await screen.findByRole('radio', { name: /This Mac/ })
  vi.mocked(listInstallLocations).mockResolvedValue([mac, drive, fastDrive])

  fireEvent.click(screen.getByRole('button', { name: 'Enter path…' }))
  fireEvent.change(screen.getByLabelText('New install folder path'), {
    target: { value: '/Volumes/Fast\\ Drive/Orbit' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))

  await waitFor(() =>
    expect(addInstallLocation).toHaveBeenCalledWith('/Volumes/Fast\\ Drive/Orbit'),
  )
  const created = await screen.findByRole('radio', { name: /Fast Drive · Orbit/ })
  await waitFor(() => expect(created).toHaveAttribute('aria-checked', 'true'))
})

it('queues a macOS build for Steam for Mac without asking for a folder', async () => {
  vi.mocked(enqueueSteamDownload).mockResolvedValue(undefined)
  const onClose = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <InstallLocationDialog
        game={{ appId: '1091500', title: 'Cyberpunk 2077', native: true }}
        onClose={onClose}
      />
    </QueryClientProvider>,
  )
  expect(screen.getByText(/Steam for Mac downloads it/)).toBeInTheDocument()
  expect(screen.queryByRole('radio')).toBeNull()
  expect(listInstallLocations).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Install' }))
  expect(enqueueSteamDownload).toHaveBeenCalledWith('1091500', undefined)
  expect(onClose).toHaveBeenCalled()
})
