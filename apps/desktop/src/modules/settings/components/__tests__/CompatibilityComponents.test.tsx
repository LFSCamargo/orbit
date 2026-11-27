import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getCompatibilityCatalog, installComponent } from '@/lib/tauri'
import { useDownloadStore } from '@/lib/downloadProgress'
import { CompatibilityComponents } from '../CompatibilityComponents'

vi.mock('@/lib/tauri', () => ({
  getCompatibilityCatalog: vi.fn(),
  getComponentStatus: vi.fn().mockResolvedValue([]),
  getActiveComponents: vi.fn().mockResolvedValue({}),
  getComponentViews: vi.fn().mockResolvedValue({}),
  setActiveComponent: vi.fn().mockResolvedValue({ gptk: '4.0 beta 3' }),
  setComponentView: vi.fn().mockResolvedValue({}),
  installComponent: vi.fn(),
  installGptkViaHomebrew: vi.fn(),
  installLocalGptkPackage: vi.fn(),
  registerComponentPath: vi.fn(),
  getOrbitWineVersions: vi.fn().mockResolvedValue({ versions: [], error: null }),
  selectOrbitWine: vi.fn(),
  installOrbitWineVersion: vi.fn(),
}))
vi.mock('@/lib/dialog', () => ({ open: vi.fn() }))

const catalog = {
  fetchedAt: '2026-11-12T00:00:00Z',
  warnings: [],
  components: [
    {
      id: 'dxmt',
      name: 'DirectX 11 graphics',
      technology: 'DXMT',
      sourceUrl: 'https://github.com',
      distribution: 'Official 3Shain builds',
      downloadable: true,
      versions: [
        {
          version: 'v0.80',
          prerelease: false,
          asset: {
            name: 'dxmt-v0.80.tar.gz',
            url: 'https://example.com/dxmt.tar.gz',
            size: 100,
            sha256: 'abc',
          },
          homebrewFormula: null,
          localPackage: null,
        },
      ],
    },
  ],
}

function renderRows() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CompatibilityComponents />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useDownloadStore.setState({ tasks: {}, failures: {} })
  vi.mocked(getCompatibilityCatalog).mockResolvedValue(catalog as never)
})

afterEach(cleanup)

it('shows a percentage progress bar while a component downloads', async () => {
  let settle!: () => void
  vi.mocked(installComponent).mockImplementation((_spec, onProgress) => {
    onProgress({
      phase: 'Downloading',
      component: 'dxmt v0.80',
      downloadedBytes: 50,
      totalBytes: 100,
    })
    return new Promise((resolve) => {
      settle = () => resolve({} as never)
    })
  })
  renderRows()
  expect(await screen.findByText(/Not installed/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: /Install/ }))
  expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
  expect(
    await screen.findByText('Downloading dxmt v0.80 · 50% · 50 B / 100 B'),
  ).toBeVisible()
  settle()
  await waitFor(() => expect(installComponent).toHaveBeenCalledTimes(1))
})

it('offers Orbit Wine in place of the catalog Wine tracks', async () => {
  vi.mocked(getCompatibilityCatalog).mockResolvedValue({
    ...catalog,
    components: [
      ...catalog.components,
      {
        ...catalog.components[0],
        id: 'wine-stable',
        name: 'Wine Stable',
        technology: 'Wine',
      },
    ],
  } as never)
  renderRows()
  expect(
    await screen.findByRole('combobox', { name: 'Windows games runtime version' }),
  ).toBeVisible()
  expect(
    screen.queryByRole('combobox', { name: 'Compatibility layer version' }),
  ).toBeNull()
  expect(screen.queryByRole('combobox', { name: 'Wine Stable version' })).toBeNull()
})

it('does not offer a GameHub component import', async () => {
  renderRows()
  expect(await screen.findByText('Compatibility components')).toBeVisible()
  expect(screen.queryByRole('button', { name: /Import from GameHub/ })).toBeNull()
})

it('surfaces the extraction failure with a retry affordance', async () => {
  vi.mocked(installComponent).mockRejectedValue(
    new Error('The downloaded DXMT package has no x86_64 DLLs.'),
  )
  renderRows()
  expect(await screen.findByText(/Not installed/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: /Install/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('no x86_64 DLLs')
  const retry = await screen.findByRole('button', { name: /Retry/ })
  expect(retry).toBeEnabled()
})
