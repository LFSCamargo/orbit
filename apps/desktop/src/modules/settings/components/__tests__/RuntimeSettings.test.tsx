import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  getComponentStatus,
  installWindowsCompatibility,
  updateCompatibilitySettings,
  windowsCompatibility,
} from '@/lib/tauri'
import { useDownloadStore } from '@/lib/downloadProgress'
import { useGraphicsDraft } from '@/stores/graphics-draft.store'
import { RuntimeSettings } from '../RuntimeSettings'
import { CompatibilityGlobalSettings } from '../CompatibilityGlobalSettings'

vi.mock('@/lib/tauri', () => ({
  detectRuntimes: vi.fn().mockResolvedValue([]),
  windowsCompatibility: vi.fn(),
  installWindowsCompatibility: vi.fn(),
  registerWineRuntime: vi.fn(),
  getComponentStatus: vi.fn().mockResolvedValue([]),
  getActiveComponents: vi.fn().mockResolvedValue({}),
  getComponentViews: vi.fn().mockResolvedValue({}),
  setActiveComponent: vi.fn().mockResolvedValue({}),
  setComponentView: vi.fn().mockResolvedValue({}),
  installComponent: vi.fn(),
  installGptkViaHomebrew: vi.fn(),
  installLocalGptkPackage: vi.fn(),
  registerComponentPath: vi.fn(),
  getCompatibilityCatalog: vi.fn().mockResolvedValue({
    fetchedAt: '2026-11-11T00:00:00Z',
    warnings: [],
    components: [
      {
        id: 'wine-stable',
        name: 'Wine Stable',
        technology: 'Wine',
        distribution: 'Official Gcenx builds',
        sourceUrl: 'https://github.com',
        downloadable: true,
        versions: ['11.0_1', '10.0_3'].map((version) => ({
          version,
          prerelease: false,
          asset: {
            name: `wine-${version}.tar.xz`,
            url: 'https://example.com',
            size: 1000,
            sha256: 'abc',
          },
        })),
      },
      {
        id: 'dxmt',
        name: 'DirectX 11 graphics',
        technology: 'DXMT',
        distribution: 'Official 3Shain builds',
        sourceUrl: 'https://github.com',
        downloadable: true,
        versions: ['v0.80', 'v0.74', 'v0.73'].map((version) => ({
          version,
          prerelease: false,
          asset: {
            name: `dxmt-${version}.tar.gz`,
            url: 'https://example.com',
            size: 1000,
            sha256: 'abc',
          },
        })),
      },
      {
        id: 'gptk',
        name: 'DirectX 11/12 graphics',
        technology: 'Apple GPTK',
        distribution: 'Install via Homebrew or import an Apple package',
        sourceUrl: 'https://github.com',
        downloadable: false,
        versions: [
          {
            version: 'Apple Game Porting Toolkit',
            prerelease: false,
            asset: {
              name: '',
              url: '',
              size: 0,
              sha256: null,
            },
          },
        ],
      },
    ],
  }),
  getCompatibilitySettings: vi.fn().mockResolvedValue({
    graphics: 'auto',
    synchronization: 'msync',
    retinaMode: false,
    metalHud: false,
    avx: true,
    upscaling: true,
    upscaleRatio: 0,
    frameGeneration: false,
    frameGenerationVsync: false,
    frameRateLimit: null,
    dxmtNvidiaExtensions: false,
    resolution: 'auto',
    resolutionWidth: 1920,
    resolutionHeight: 1080,
  }),
  updateCompatibilitySettings: vi.fn().mockImplementation(async (settings) => settings),
}))
vi.mock('@/lib/dialog', () => ({ open: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getComponentStatus).mockResolvedValue([])
  useDownloadStore.setState({ tasks: {}, failures: {} })
  useGraphicsDraft.setState({ draft: null, saving: false })
  vi.mocked(windowsCompatibility).mockResolvedValue({
    supported: true,
    managed: null,
    package: { version: '11.0.1', downloadBytes: 185_303_032 },
  })
})
afterEach(cleanup)

function renderSettings(graphics = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      {graphics ? <CompatibilityGlobalSettings /> : <RuntimeSettings />}
    </QueryClientProvider>,
  )
}

async function chooseSync(option: string) {
  const trigger = await screen.findByLabelText('Default synchronization')
  fireEvent.keyDown(trigger, { key: 'ArrowDown' })
  fireEvent.click(await screen.findByRole('option', { name: option }))
}

it('offers one managed setup action without exposing implementation technologies', async () => {
  renderSettings()
  const install = await screen.findByRole('button', { name: 'Install compatibility' })
  expect(screen.getByRole('heading', { name: 'Windows compatibility' })).toBeVisible()

  let finish!: () => void
  const pending = new Promise<void>((resolve) => {
    finish = resolve
  })
  vi.mocked(installWindowsCompatibility).mockImplementation(async (onProgress) => {
    onProgress({
      phase: 'Downloading',
      component: 'Windows compatibility',
      downloadedBytes: 92_651_516,
      totalBytes: 185_303_032,
    })
    onProgress({ phase: 'Extracting', component: 'Windows compatibility' })
    onProgress({ phase: 'Installing', component: 'Windows compatibility' })
    await pending
    return {
      path: '/managed/wine',
      serverPath: '/managed/wineserver',
      version: 'wine-11.0',
    }
  })
  await waitFor(() => expect(install).not.toBeDisabled())
  fireEvent.click(install)
  expect(await screen.findByText('Setting up…')).toBeVisible()
  await waitFor(() => expect(installWindowsCompatibility).toHaveBeenCalledTimes(1))
  await screen.findByText(/Finishing setup/)
  finish()
  expect(await screen.findByText('Windows games are ready to play.')).toBeVisible()
})

it('gates managed setup behind the macOS system capability', async () => {
  vi.mocked(windowsCompatibility).mockResolvedValue({
    supported: false,
    managed: null,
    package: { version: '11.0.1', downloadBytes: 185_303_032 },
  })
  renderSettings()
  expect(
    await screen.findByText('Managed Windows compatibility is available on macOS only.'),
  ).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Install compatibility' }),
  ).not.toBeInTheDocument()
  expect(installWindowsCompatibility).not.toHaveBeenCalled()
})

it('lists component versions and saves global defaults', async () => {
  renderSettings()
  expect(
    await screen.findByRole('combobox', { name: 'Compatibility layer version' }),
  ).toBeVisible()
  expect(
    screen.getAllByRole('combobox', { name: 'Graphics engine version' }),
  ).toHaveLength(1)
  expect(screen.queryByLabelText('DirectX 11 graphics version')).not.toBeInTheDocument()
  expect(
    screen.queryByLabelText('DirectX 11/12 graphics version'),
  ).not.toBeInTheDocument()
})

async function openAdvancedGraphics() {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Advanced graphics options' }),
  )
}

it('releases DXMT frame rate and NVIDIA extensions once DXMT is installed', async () => {
  vi.mocked(getComponentStatus).mockResolvedValue([
    {
      id: 'dxmt',
      version: 'v0.80',
      kind: 'dxmt',
      path: '/components/dxmt/v0.80',
      installedAt: '2026-11-13T00:00:00Z',
    },
  ])
  renderSettings(true)
  await openAdvancedGraphics()

  const limit = await screen.findByLabelText('Default frame rate limit')
  expect(limit).toBeEnabled()
  expect(screen.getByRole('switch', { name: 'DXMT NVIDIA extensions' })).toBeEnabled()
  expect(screen.getByLabelText('Default upscale ratio')).toBeDisabled()
  expect(screen.getByRole('switch', { name: 'Frame generation' })).toBeDisabled()
  expect(screen.getByRole('switch', { name: 'Frame generation VSync' })).toBeDisabled()

  fireEvent.change(limit, { target: { value: '60' } })
  expect(screen.getByLabelText('Default graphics')).toHaveTextContent('DXMT')
})

it('keeps DXMT options locked until DXMT is installed', async () => {
  renderSettings(true)
  await openAdvancedGraphics()
  expect(await screen.findByLabelText('Default frame rate limit')).toBeDisabled()
  expect(screen.getByRole('switch', { name: 'DXMT NVIDIA extensions' })).toBeDisabled()
})

it('keeps graphics edits local until Save and supports Discard', async () => {
  renderSettings(true)
  const sync = await screen.findByLabelText('Default synchronization')
  await chooseSync('Default')
  expect(updateCompatibilitySettings).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
  expect(sync).toHaveTextContent('MSync · Recommended')
  await chooseSync('ESync')
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() =>
    expect(updateCompatibilitySettings).toHaveBeenCalledWith(
      expect.objectContaining({ synchronization: 'esync' }),
    ),
  )
  expect(await screen.findByText('Changes saved.')).toBeVisible()
})

it('retains edits after a save failure so the user can retry', async () => {
  vi.mocked(updateCompatibilitySettings).mockRejectedValueOnce(
    new Error('Disk unavailable'),
  )
  renderSettings(true)
  const sync = await screen.findByLabelText('Default synchronization')
  await chooseSync('Default')
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Disk unavailable')
  expect(sync).toHaveTextContent('Default')
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
})

it('shows a simple ready state for a managed installation', async () => {
  vi.mocked(windowsCompatibility).mockResolvedValue({
    supported: true,
    managed: {
      path: '/managed/wine',
      serverPath: '/managed/wineserver',
      version: 'wine-11.0',
    },
    package: { version: '11.0.1', downloadBytes: 185_303_032 },
  })
  renderSettings()
  expect(await screen.findByText('Windows games are ready')).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Install compatibility' }),
  ).not.toBeInTheDocument()
})

it('preserves an unsaved draft when the graphics page is reopened', async () => {
  const first = renderSettings(true)
  await chooseSync('Default')
  first.unmount()
  renderSettings(true)
  expect(await screen.findByLabelText('Default synchronization')).toHaveTextContent(
    'Default',
  )
  expect(updateCompatibilitySettings).not.toHaveBeenCalled()
})

it('keeps download progress across navigation and exposes retry after failure', async () => {
  let fail!: (error: Error) => void
  vi.mocked(installWindowsCompatibility).mockImplementation(async (onProgress) => {
    onProgress({
      phase: 'Downloading',
      component: 'Windows compatibility',
      downloadedBytes: 50,
      totalBytes: 100,
    })
    return new Promise((_, reject) => {
      fail = reject
    })
  })
  const first = renderSettings()
  const install = await screen.findByRole('button', { name: 'Install compatibility' })
  await waitFor(() => expect(install).toBeEnabled())
  fireEvent.click(install)
  expect(await screen.findByRole('progressbar')).toHaveAttribute('value', '50')
  first.unmount()
  renderSettings()
  expect(await screen.findByRole('progressbar')).toHaveAttribute('value', '50')
  expect(screen.getByRole('button', { name: 'Setting up…' })).toBeDisabled()
  fail(new Error('Network disconnected'))
  expect(await screen.findByRole('alert')).toHaveTextContent('Network disconnected')
  expect(screen.getByRole('button', { name: 'Retry installation' })).toBeEnabled()
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
})
