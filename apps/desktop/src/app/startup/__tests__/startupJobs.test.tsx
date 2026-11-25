import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  getCompatibilityCatalog,
  getComponentStatus,
  installComponent,
  refreshSteamWindowsLibrary,
  scanNativeApps,
  scanSteamInstallations,
  scanSteamLibrary,
  steamWindowsStatus,
} from '@/lib/tauri'
import { DEFAULT_APP_PREFERENCES } from '@/lib/appPreferences'
import { useDownloadStore } from '@/lib/downloadProgress'
import { usePreferencesStore } from '@/stores/preferences.store'
import { useRuntimeAutoUpdate } from '../useRuntimeAutoUpdate'
import { useStartupScan } from '../useStartupScan'
import { useSteamStartupSync } from '../useSteamStartupSync'

vi.mock('@/lib/tauri', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tauri')>()),
  scanSteamLibrary: vi.fn(),
  scanSteamInstallations: vi.fn(),
  scanNativeApps: vi.fn(),
  refreshSteamWindowsLibrary: vi.fn(),
  steamWindowsStatus: vi.fn(),
  getCompatibilityCatalog: vi.fn(),
  getComponentStatus: vi.fn(),
  installComponent: vi.fn(),
}))

const scan = { imported: 0, enriched: 0, provider: 'steam' as const }

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

function prefs(patch: Partial<typeof DEFAULT_APP_PREFERENCES>, ready = true) {
  usePreferencesStore.setState({
    ready,
    preferences: { ...DEFAULT_APP_PREFERENCES, onboardingCompleted: true, ...patch },
  })
}

beforeEach(() => {
  vi.mocked(scanSteamLibrary).mockReset().mockResolvedValue(scan)
  vi.mocked(scanSteamInstallations).mockReset().mockResolvedValue(scan)
  vi.mocked(scanNativeApps).mockReset().mockResolvedValue(scan)
  vi.mocked(refreshSteamWindowsLibrary).mockReset().mockResolvedValue([])
  vi.mocked(steamWindowsStatus).mockReset().mockResolvedValue({
    signedIn: true,
    accountName: 'orbit_user',
    steamInstalled: true,
    clientRunning: false,
    clientLoggedIn: false,
    clientPhase: 'ready',
    clientCaption: 'Steam is ready',
    ownedCount: 10,
    sessionReady: true,
  })
  vi.mocked(installComponent)
    .mockReset()
    .mockResolvedValue(undefined as never)
  vi.mocked(getComponentStatus)
    .mockReset()
    .mockResolvedValue([
      { id: 'dxmt', version: 'v1', kind: 'dxmt', path: '/x', installedAt: '' },
    ])
  vi.mocked(getCompatibilityCatalog)
    .mockReset()
    .mockResolvedValue({
      fetchedAt: '',
      warnings: [],
      components: [
        {
          id: 'dxmt',
          name: 'DXMT',
          technology: '',
          sourceUrl: '',
          distribution: '',
          downloadable: true,
          versions: ['v2', 'v1'].map((version) => ({
            version,
            prerelease: false,
            asset: { name: version, url: `https://x/${version}`, size: 1, sha256: null },
            homebrewFormula: null,
            localPackage: null,
          })),
        },
      ],
    })
  useDownloadStore.setState({ tasks: {}, failures: {} })
})

afterEach(cleanup)

it('scans every source once when scanning on startup is on', async () => {
  prefs({ scanOnStartup: true })
  const { rerender } = renderHook(() => useStartupScan(), { wrapper })
  rerender()
  await waitFor(() => expect(scanNativeApps).toHaveBeenCalledTimes(1))
  expect(scanSteamLibrary).toHaveBeenCalledTimes(1)
  expect(scanSteamInstallations).toHaveBeenCalledTimes(1)
})

it('does not scan when it is off, before onboarding, or before preferences load', async () => {
  prefs({ scanOnStartup: false })
  renderHook(() => useStartupScan(), { wrapper })
  prefs({ scanOnStartup: true, onboardingCompleted: false })
  renderHook(() => useStartupScan(), { wrapper })
  prefs({ scanOnStartup: true }, false)
  renderHook(() => useStartupScan(), { wrapper })
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(scanSteamLibrary).not.toHaveBeenCalled()
})

it('keeps scanning the other sources when one fails', async () => {
  prefs({ scanOnStartup: true })
  vi.mocked(scanSteamLibrary).mockRejectedValue(new Error('no Steam'))
  renderHook(() => useStartupScan(), { wrapper })
  await waitFor(() => expect(scanNativeApps).toHaveBeenCalled())
  expect(scanSteamInstallations).toHaveBeenCalled()
})

it('queues newer component versions through the downloads queue', async () => {
  prefs({ autoUpdateRuntimes: true })
  renderHook(() => useRuntimeAutoUpdate(), { wrapper })
  await waitFor(() =>
    expect(installComponent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'dxmt', version: 'v2' }),
      expect.any(Function),
    ),
  )
})

it('does not check for updates when auto-update is off', async () => {
  prefs({ autoUpdateRuntimes: false })
  renderHook(() => useRuntimeAutoUpdate(), { wrapper })
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(getCompatibilityCatalog).not.toHaveBeenCalled()
})

it('refreshes the signed-in Steam library once on every boot even when scanOnStartup is off', async () => {
  prefs({ scanOnStartup: false })
  const client = new QueryClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const { rerender } = renderHook(() => useSteamStartupSync(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
  rerender()
  await waitFor(() => expect(refreshSteamWindowsLibrary).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['library'] }))
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['steam-windows-library'] })
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['games'] })
})

it('skips Steam startup sync when signed out, before onboarding, or before preferences load', async () => {
  vi.mocked(steamWindowsStatus).mockResolvedValue({
    signedIn: false,
    accountName: null,
    steamInstalled: false,
    clientRunning: false,
    clientLoggedIn: false,
    clientPhase: 'stopped',
    clientCaption: '',
    ownedCount: 0,
    sessionReady: false,
  })
  prefs({ scanOnStartup: true })
  renderHook(() => useSteamStartupSync(), { wrapper })
  prefs({ scanOnStartup: true, onboardingCompleted: false })
  renderHook(() => useSteamStartupSync(), { wrapper })
  prefs({ scanOnStartup: true }, false)
  renderHook(() => useSteamStartupSync(), { wrapper })
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(refreshSteamWindowsLibrary).not.toHaveBeenCalled()
})

it('absorbs a failed Steam startup refresh without breaking boot', async () => {
  prefs({ scanOnStartup: false })
  vi.mocked(refreshSteamWindowsLibrary).mockRejectedValue(new Error('offline'))
  renderHook(() => useSteamStartupSync(), { wrapper })
  await waitFor(() => expect(refreshSteamWindowsLibrary).toHaveBeenCalledTimes(1))
})
