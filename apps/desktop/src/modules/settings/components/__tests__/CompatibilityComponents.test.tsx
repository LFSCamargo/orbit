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
}))
vi.mock('@/lib/dialog', () => ({ open: vi.fn() }))

const catalog = {
  fetchedAt: '2026-11-12T00:00:00Z',
  warnings: [],
  components: [
    {
      id: 'wine-stable',
      name: 'Wine Stable',
      technology: 'Wine',
      sourceUrl: 'https://github.com',
      distribution: 'Official Gcenx builds',
      downloadable: true,
      versions: [
        {
          version: '11.0_1',
          prerelease: false,
          asset: {
            name: 'wine-stable-11.0_1-osx64.tar.xz',
            url: 'https://example.com/wine.tar.xz',
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
      <CompatibilityComponents managed={null} managedVersion="11.0.1" />
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
      component: 'wine-stable 11.0_1',
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
  expect(await screen.findByRole('progressbar')).toHaveAttribute('value', '50')
  expect(
    await screen.findByText('Downloading wine-stable 11.0_1 · 50% · 0 of 0 MB'),
  ).toBeVisible()
  settle()
  await waitFor(() => expect(installComponent).toHaveBeenCalledTimes(1))
})

it('does not offer a GameHub component import', async () => {
  renderRows()
  expect(await screen.findByText('Compatibility components')).toBeVisible()
  expect(screen.queryByRole('button', { name: /Import from GameHub/ })).toBeNull()
})

it('surfaces the extraction failure with a retry affordance', async () => {
  vi.mocked(installComponent).mockRejectedValue(
    new Error(
      'The downloaded Wine package has no wine or wine64 binary under a bin/ directory.',
    ),
  )
  renderRows()
  expect(await screen.findByText(/Not installed/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: /Install/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('no wine or wine64 binary')
  const retry = await screen.findByRole('button', { name: /Retry/ })
  expect(retry).toBeEnabled()
})
