import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { InstallLocation } from '@/types/downloads'
import { SteamDownloadLocations } from '../SteamDownloadLocations'

vi.mock('@/lib/tauri', () => ({
  listInstallLocations: vi.fn(),
  addInstallLocation: vi.fn(),
  removeInstallLocation: vi.fn(),
}))
vi.mock('@/lib/dialog', () => ({ open: vi.fn() }))

import { open } from '@/lib/dialog'
import {
  addInstallLocation,
  listInstallLocations,
  removeInstallLocation,
} from '@/lib/tauri'

const mac: InstallLocation = {
  id: 'this-mac',
  label: 'This Mac',
  path: null,
  available: true,
  freeBytes: 40_000_000_000,
  totalBytes: 494_000_000_000,
  isDefault: true,
  gameCount: 0,
}

const fastDrive: InstallLocation = {
  id: '/Volumes/Fast Drive/Orbit',
  label: 'Fast Drive · Orbit',
  path: '/Volumes/Fast Drive/Orbit',
  available: true,
  freeBytes: 900_000_000_000,
  totalBytes: 1_000_000_000_000,
  isDefault: false,
  gameCount: 0,
}

function renderLocations() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SteamDownloadLocations />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.mocked(listInstallLocations).mockResolvedValue([mac])
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it('creates and adds a new folder path on an external SSD', async () => {
  vi.mocked(addInstallLocation).mockResolvedValue(fastDrive)
  renderLocations()
  expect(await screen.findByText('This Mac')).toBeTruthy()

  vi.mocked(listInstallLocations).mockResolvedValue([mac, fastDrive])
  fireEvent.change(screen.getByLabelText('New download drive or folder'), {
    target: { value: '/Volumes/Fast\\ Drive/Orbit' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Add download folder' }))

  await waitFor(() =>
    expect(addInstallLocation).toHaveBeenCalledWith('/Volumes/Fast\\ Drive/Orbit'),
  )
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Prepared Fast Drive · Orbit (/Volumes/Fast Drive/Orbit). Downloads can now be saved there.',
  )
  expect(await screen.findByText('Fast Drive · Orbit')).toBeTruthy()
})

it('browses for a folder and removes an unused location', async () => {
  vi.mocked(listInstallLocations).mockResolvedValue([mac, fastDrive])
  vi.mocked(open).mockResolvedValue('/Volumes/Fast Drive/Orbit')
  vi.mocked(addInstallLocation).mockResolvedValue(fastDrive)
  renderLocations()

  fireEvent.click(await screen.findByRole('button', { name: 'Browse folders' }))
  await waitFor(() =>
    expect(addInstallLocation).toHaveBeenCalledWith('/Volumes/Fast Drive/Orbit'),
  )

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Remove download location Fast Drive · Orbit',
    }),
  )
  await waitFor(() =>
    expect(removeInstallLocation).toHaveBeenCalledWith('/Volumes/Fast Drive/Orbit'),
  )
})
