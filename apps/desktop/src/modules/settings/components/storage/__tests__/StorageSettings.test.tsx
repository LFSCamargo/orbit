import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import type { StorageOverview } from '@/types/storage'
import { StorageSettings } from '../StorageSettings'

const overview: StorageOverview = {
  volumeTotalBytes: 1_000_000_000_000,
  volumeFreeBytes: 400_000_000_000,
  orbitBytes: 137_000_000_000,
  totals: {
    games: 135_000_000_000,
    tools: 1_500_000_000,
    runtimes: 500_000_000,
    other: 0,
  },
  truncated: false,
  scannedAt: new Date().toISOString(),
  items: [
    {
      id: 'game:1245620',
      name: 'Elden Ring',
      kind: 'game',
      sizeBytes: 70_000_000_000,
      installedAt: '2026-11-10T00:00:00Z',
      path: '/Orbit/runtimes/containers/games/steam-1245620/install',
      artwork: null,
      removal: { type: 'game', appId: '1245620' },
      entryId: 'steam:1245620',
      source: 'Orbit',
      onDataVolume: true,
    },
    {
      id: 'game:steam:1091500',
      name: 'Cyberpunk 2077',
      kind: 'game',
      sizeBytes: 65_000_000_000,
      installedAt: '2026-11-01T00:00:00Z',
      path: '/Volumes/Games/SteamLibrary/steamapps/common/Cyberpunk 2077',
      artwork: null,
      removal: { type: 'none' },
      entryId: 'steam:1091500',
      source: 'Steam library',
      onDataVolume: false,
    },
    {
      id: 'tool:steam-windows:prefix',
      name: 'Steam for Windows',
      kind: 'tool',
      sizeBytes: 1_500_000_000,
      installedAt: null,
      path: '/Orbit/steam-windows/prefix',
      artwork: null,
      removal: { type: 'none' },
      entryId: null,
      source: 'Orbit',
      onDataVolume: true,
    },
    {
      id: 'component:dxvk:2.3',
      name: 'DXVK 2.3',
      kind: 'runtime',
      sizeBytes: 500_000_000,
      installedAt: null,
      path: '/Orbit/runtimes/components/dxvk/2.3',
      artwork: null,
      removal: { type: 'component', id: 'dxvk', version: '2.3' },
      entryId: null,
      source: 'Orbit',
      onDataVolume: true,
    },
  ],
}

vi.mock('@/lib/tauri', () => ({
  getStorageOverview: vi.fn(async () => overview),
  removeComponent: vi.fn(async () => undefined),
  revealPath: vi.fn(async () => undefined),
  uninstallSteamGame: vi.fn(async () => ({
    removedBytes: 70_000_000_000,
    keptPrefix: false,
  })),
}))
import { getStorageOverview, removeComponent, uninstallSteamGame } from '@/lib/tauri'
vi.mock('@/lib/toast', () => ({
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), loading: vi.fn() },
}))
import { notify } from '@/lib/toast'

afterEach(cleanup)

function renderStorage() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <StorageSettings />
    </QueryClientProvider>,
  )
}

it('shows Orbit’s footprint, the largest games and every stored item', async () => {
  renderStorage()
  const overviewCard = await screen.findByRole('region', { name: 'Storage overview' })
  expect(within(overviewCard).getByText('128 GB')).toBeTruthy()
  expect(within(overviewCard).getByText('60%')).toBeTruthy()
  const largest = screen.getByRole('region', { name: 'Largest installs' })
  expect(within(largest).getByText('Elden Ring')).toBeTruthy()
  expect(within(largest).getByText('Cyberpunk 2077')).toBeTruthy()
  expect(screen.getAllByTestId('storage-row')).toHaveLength(4)
  const external = screen
    .getAllByTestId('storage-row')
    .find((row) => within(row).queryByText('Cyberpunk 2077'))!
  expect(within(external).getByText('Steam library')).toBeTruthy()
  expect(
    within(external).getByRole('button', { name: 'Remove Cyberpunk 2077' }),
  ).toBeDisabled()
  fireEvent.click(screen.getByRole('tab', { name: 'Tools (1)' }))
  expect(screen.getAllByTestId('storage-row')).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Remove Steam for Windows' })).toBeDisabled()
})

it('uninstalls a game through the shared confirm and keeps saves by default', async () => {
  renderStorage()
  fireEvent.click(await screen.findByRole('button', { name: 'Uninstall Elden Ring' }))
  expect(screen.getByText('Uninstall Elden Ring?')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Uninstall' }))
  await waitFor(() => expect(uninstallSteamGame).toHaveBeenCalledWith('1245620', false))
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith({
      title: 'Uninstalled',
      message: 'Uninstalled Elden Ring and freed 65 GB.',
    }),
  )
})

it('removes an unused component version after confirming', async () => {
  renderStorage()
  fireEvent.click(await screen.findByRole('button', { name: 'Remove DXVK 2.3' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
  await waitFor(() => expect(removeComponent).toHaveBeenCalledWith('dxvk', '2.3'))
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith({
      title: 'Removed DXVK 2.3',
      message: 'Freed 477 MB.',
    }),
  )
})

it('shows every card as a skeleton while the first scan runs', async () => {
  let finish: (value: typeof overview) => void = () => undefined
  vi.mocked(getStorageOverview).mockImplementationOnce(
    () => new Promise((resolve) => (finish = resolve)),
  )
  renderStorage()
  const loading = screen.getByRole('status', { name: 'Loading storage' })
  for (const card of ['overview', 'largest', 'distribution', 'items'])
    expect(within(loading).getByTestId(`storage-skeleton-${card}`)).toBeTruthy()
  expect(loading.textContent).toBe('')
  await act(async () => finish(overview))
  expect(await screen.findByRole('region', { name: 'Storage overview' })).toBeTruthy()
  expect(screen.queryByRole('status', { name: 'Loading storage' })).toBeNull()
})
