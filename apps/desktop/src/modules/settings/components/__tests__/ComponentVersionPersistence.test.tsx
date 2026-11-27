import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  getCompatibilityCatalog,
  getComponentStatus,
  getActiveComponents,
  getComponentViews,
  setActiveComponent,
  setComponentView,
} from '@/lib/tauri'
import { useComponentBrowseStore } from '@/stores/component-browse.store'
import { useDownloadStore } from '@/lib/downloadProgress'
import { CompatibilityComponents } from '../CompatibilityComponents'

vi.mock('@/lib/tauri', () => ({
  getCompatibilityCatalog: vi.fn(),
  getComponentStatus: vi.fn().mockResolvedValue([
    {
      id: 'gptk',
      version: '4.0 beta 3',
      kind: 'gptk',
      path: '/managed/gptk/4.0_beta_3',
      installedAt: '2026-11-12T00:00:00Z',
    },
  ]),
  getActiveComponents: vi.fn(),
  getComponentViews: vi.fn(),
  setActiveComponent: vi.fn(),
  setComponentView: vi.fn(),
  installComponent: vi.fn(),
  installGptkViaHomebrew: vi.fn(),
  installLocalGptkPackage: vi.fn(),
  registerComponentPath: vi.fn(),
  getOrbitWineVersions: vi.fn().mockResolvedValue({ versions: [], error: null }),
  selectOrbitWine: vi.fn(),
  installOrbitWineVersion: vi.fn(),
}))
vi.mock('@/lib/dialog', () => ({ open: vi.fn() }))

const gptkVersions = [
  {
    version: '4.0 beta 3 · Apple download (evaluation)',
    prerelease: true,
    asset: {
      name: 'Evaluation_environment_for_Windows_games_4.0_beta_3.dmg',
      url: '',
      size: 26_630_502,
      sha256: null,
    },
    homebrewFormula: null,
    localPackage: {
      path: '/Users/tester/Downloads/Evaluation_environment_for_Windows_games_4.0_beta_3.dmg',
      file: 'Evaluation_environment_for_Windows_games_4.0_beta_3.dmg',
      version: '4.0 beta 3',
      kind: 'evaluation',
      sizeBytes: 26_630_502,
      digestVerified: true,
    },
  },
  {
    version: 'Game-Porting-Toolkit-3.0-3',
    prerelease: false,
    asset: {
      name: 'game-porting-toolkit-3.0-3.tar.xz',
      url: 'https://example.com/gptk.tar.xz',
      size: 239_200_808,
      sha256: 'abc',
    },
    homebrewFormula: null,
    localPackage: null,
  },
]

const catalog = {
  fetchedAt: '2026-11-12T00:00:00Z',
  warnings: [],
  components: [
    {
      id: 'gptk',
      name: 'DirectX 11/12 graphics',
      technology: 'Apple GPTK',
      sourceUrl: 'https://github.com',
      distribution: 'Community packages',
      downloadable: true,
      versions: gptkVersions,
    },
  ],
}

// Only the 4.0 beta 3 evaluation payload is installed in these cases (see the
// hoisted getComponentStatus mock above).

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
  useComponentBrowseStore.setState({ views: {} })
  vi.mocked(getCompatibilityCatalog).mockResolvedValue(catalog as never)
  vi.mocked(getActiveComponents).mockResolvedValue({ gptk: '4.0 beta 3' })
  vi.mocked(getComponentViews).mockResolvedValue({})
  vi.mocked(setComponentView).mockImplementation(async (group, key) => ({ [group]: key }))
})

afterEach(cleanup)

it('writes the chosen installed version through to the active-component store', async () => {
  vi.mocked(getActiveComponents).mockResolvedValue({})
  vi.mocked(setActiveComponent).mockResolvedValue({ gptk: '4.0 beta 3' })
  renderRows()
  const picker = await screen.findByRole('combobox', { name: 'Graphics engine version' })
  // Move away first: re-selecting the displayed value is not a change.
  fireEvent.click(picker)
  fireEvent.click(await screen.findByRole('option', { name: /3\.0-3/ }))
  await waitFor(() => expect(picker).toHaveTextContent('3.0-3'))
  fireEvent.click(picker)
  fireEvent.click(await screen.findByRole('option', { name: /4\.0 beta 3/ }))
  await waitFor(() =>
    expect(setActiveComponent).toHaveBeenCalledWith('gptk', '4.0 beta 3'),
  )
})

it('keeps the browsed version when the row remounts after a tab change', async () => {
  const first = renderRows()
  const picker = await screen.findByRole('combobox', { name: 'Graphics engine version' })
  fireEvent.click(picker)
  fireEvent.click(await screen.findByRole('option', { name: /3\.0-3/ }))
  await waitFor(() =>
    expect(
      screen.getByRole('combobox', { name: 'Graphics engine version' }),
    ).toHaveTextContent('3.0-3'),
  )
  // Unmounting simulates switching settings tabs; the store must survive it.
  first.unmount()
  renderRows()
  await waitFor(() =>
    expect(
      screen.getByRole('combobox', { name: 'Graphics engine version' }),
    ).toHaveTextContent('3.0-3'),
  )
})

it('restores the chosen GPTK 4.0 beta row after the in-memory browse state is cleared', async () => {
  const saved: Record<string, string> = {}
  vi.mocked(getActiveComponents).mockResolvedValue({})
  vi.mocked(getComponentStatus).mockResolvedValue([
    {
      id: 'dxvk',
      version: 'v1.10.3-20230507-repack',
      kind: 'dxvk',
      path: '/managed/dxvk',
      installedAt: '2026-11-01T00:00:00Z',
    },
    {
      id: 'gptk',
      version: '4.0 beta 3',
      kind: 'gptk',
      path: '/managed/gptk/4.0_beta_3',
      installedAt: '2026-11-12T00:00:00Z',
    },
  ])
  vi.mocked(getCompatibilityCatalog).mockResolvedValue({
    ...catalog,
    components: [
      {
        id: 'dxvk',
        name: 'DirectX 10/11 graphics',
        technology: 'DXVK',
        sourceUrl: 'https://github.com',
        distribution: 'Official builds',
        downloadable: true,
        versions: [
          {
            version: 'v1.10.3-20230507-repack',
            prerelease: false,
            asset: {
              name: 'dxvk.tar.gz',
              url: 'https://example.com/dxvk.tar.gz',
              size: 1_000_000,
              sha256: 'abc',
            },
            homebrewFormula: null,
            localPackage: null,
          },
        ],
      },
      ...catalog.components,
    ],
  } as never)
  vi.mocked(setComponentView).mockImplementation(async (group, key) => {
    saved[group] = key
    return { ...saved }
  })
  vi.mocked(setActiveComponent).mockResolvedValue({ gptk: '4.0 beta 3' })

  const first = renderRows()
  const picker = await screen.findByRole('combobox', { name: 'Graphics engine version' })
  await waitFor(() => expect(picker).toHaveTextContent('DXVK'))
  fireEvent.click(picker)
  fireEvent.click(
    await screen.findByRole('option', {
      name: /4\.0 beta 3 · Apple download \(evaluation\)/,
    }),
  )
  await waitFor(() => expect(picker).toHaveTextContent('evaluation'))
  await waitFor(() => expect(setComponentView).toHaveBeenCalled())
  expect(setActiveComponent).toHaveBeenCalledWith('gptk', '4.0 beta 3')

  // Tab changes keep a memory copy, but a cleared copy must still come back
  // from the setting that was written when the row was chosen.
  useComponentBrowseStore.setState({ views: {} })
  vi.mocked(getComponentViews).mockResolvedValue({ ...saved })
  first.unmount()
  renderRows()
  await waitFor(() =>
    expect(
      screen.getByRole('combobox', { name: 'Graphics engine version' }),
    ).toHaveTextContent('evaluation'),
  )
  expect(
    screen.getByRole('combobox', { name: 'Graphics engine version' }),
  ).not.toHaveTextContent('DXVK')
})

it('does not offer an uninstalled version as active', async () => {
  vi.mocked(getActiveComponents).mockResolvedValue({})
  renderRows()
  const picker = await screen.findByRole('combobox', { name: 'Graphics engine version' })
  fireEvent.click(picker)
  fireEvent.click(await screen.findByRole('option', { name: /3\.0-3/ }))
  await waitFor(() => expect(picker).toHaveTextContent('3.0-3'))
  expect(setActiveComponent).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: /Install/ })).toBeVisible()
})
