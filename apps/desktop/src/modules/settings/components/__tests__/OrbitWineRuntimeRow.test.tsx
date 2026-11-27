import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  getOrbitWineVersions,
  installOrbitWineVersion,
  selectOrbitWine,
} from '@/lib/tauri'
import { useDownloadStore } from '@/lib/downloadProgress'
import { OrbitWineRuntimeRow } from '../OrbitWineRuntimeRow'

vi.mock('@/lib/tauri', () => ({
  getOrbitWineVersions: vi.fn(),
  selectOrbitWine: vi.fn(),
  installOrbitWineVersion: vi.fn(),
}))

const versions = [
  { version: '26.4.0', installed: false, active: false, sizeBytes: 480_000_000 },
  { version: '26.3.0-2', installed: true, active: true, sizeBytes: 471_000_000 },
  { version: '26.3.0', installed: true, active: false, sizeBytes: 470_000_000 },
]

function renderRow() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <OrbitWineRuntimeRow />
    </QueryClientProvider>,
  )
}

async function pick(name: RegExp) {
  const picker = await screen.findByRole('combobox', {
    name: 'Windows games runtime version',
  })
  // The picker is disabled until the builds load.
  await waitFor(() => expect(picker).toBeEnabled())
  fireEvent.click(picker)
  fireEvent.click(await screen.findByRole('option', { name }))
  return picker
}

beforeEach(() => {
  vi.clearAllMocks()
  useDownloadStore.setState({ tasks: {}, failures: {} })
  vi.mocked(getOrbitWineVersions).mockResolvedValue({ versions, error: null })
  vi.mocked(selectOrbitWine).mockResolvedValue(undefined)
  vi.mocked(installOrbitWineVersion).mockResolvedValue(undefined)
})

afterEach(cleanup)

it('shows the Orbit Wine build games play with', async () => {
  renderRow()
  const picker = await screen.findByRole('combobox', {
    name: 'Windows games runtime version',
  })
  await waitFor(() => expect(picker).toHaveTextContent('Orbit Wine 26.3.0-2'))
  expect(screen.getByText('Installed · In use')).toBeVisible()
})

it('switches games to another installed build', async () => {
  renderRow()
  const picker = await pick(/26\.3\.0$/)
  await waitFor(() => expect(selectOrbitWine).toHaveBeenCalledWith('26.3.0'))
  expect(picker).toHaveTextContent('Orbit Wine 26.3.0')
  expect(installOrbitWineVersion).not.toHaveBeenCalled()
})

it('installs a published build only when asked, through the downloads queue', async () => {
  renderRow()
  await pick(/26\.4\.0/)
  expect(await screen.findByText('480 MB · Not installed')).toBeVisible()
  expect(selectOrbitWine).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /Install/ }))
  await waitFor(() =>
    expect(installOrbitWineVersion).toHaveBeenCalledWith('26.4.0', expect.any(Function)),
  )
})

it('shows a failed install with a retry', async () => {
  vi.mocked(installOrbitWineVersion).mockRejectedValue(
    new Error('Quit the running game before changing Orbit Wine'),
  )
  renderRow()
  await pick(/26\.4\.0/)
  fireEvent.click(await screen.findByRole('button', { name: /Install/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Quit the running game')
  expect(await screen.findByRole('button', { name: /Retry/ })).toBeEnabled()
})

it('still lists installed builds offline', async () => {
  vi.mocked(getOrbitWineVersions).mockResolvedValue({
    versions: versions.filter((item) => item.installed),
    error: 'Orbit could not reach GitHub',
  })
  renderRow()
  expect(
    await screen.findByText(
      /Published versions are unavailable: Orbit could not reach GitHub/,
    ),
  ).toBeVisible()
  expect(
    screen.getByRole('combobox', { name: 'Windows games runtime version' }),
  ).toHaveTextContent('Orbit Wine 26.3.0-2')
})
