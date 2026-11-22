import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { msStoreAuthStart, msStoreAuthStatus, msStoreSignOut } from '@/lib/tauri'
import { useUiStore } from '@/stores/ui.store'
import { MsStoreSettings } from '../MsStoreSettings'

vi.mock('@/lib/tauri', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tauri')>()),
  msStoreAuthStatus: vi.fn(),
  msStoreAuthStart: vi.fn(),
  msStoreSignOut: vi.fn(),
}))

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MsStoreSettings />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.mocked(msStoreAuthStart).mockReset().mockResolvedValue(undefined)
  vi.mocked(msStoreSignOut).mockReset().mockResolvedValue(undefined)
  vi.mocked(msStoreAuthStatus).mockReset().mockResolvedValue({
    signedIn: false,
    deviceReady: false,
    accountLabel: null,
    gamertag: null,
    xuid: null,
    wineReady: true,
    xgameruntimeInstalled: true,
  })
})

afterEach(cleanup)

it('starts Microsoft Store sign-in and shows readiness when signed in', async () => {
  renderSettings()
  const btn = await screen.findByRole('button', { name: 'Sign in to Microsoft Store' })
  fireEvent.click(btn)
  await waitFor(() => expect(msStoreAuthStart).toHaveBeenCalled())
  expect(
    await screen.findByText(/Orbit Wine & xgameruntime ready for native PC installs/),
  ).toBeInTheDocument()
})

it('shows signed-in account and signs out cleanly', async () => {
  vi.mocked(msStoreAuthStatus).mockResolvedValue({
    signedIn: true,
    deviceReady: true,
    accountLabel: 'player@outlook.com',
    gamertag: 'OrbitPlayer',
    xuid: '123',
    wineReady: true,
    xgameruntimeInstalled: true,
  })
  renderSettings()
  expect(await screen.findByText(/Signed in as player@outlook\.com/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  await waitFor(() => expect(msStoreSignOut).toHaveBeenCalled())
})

it('warns when Orbit Wine or xgameruntime is missing and links to Compatibility', async () => {
  vi.mocked(msStoreAuthStatus).mockResolvedValue({
    signedIn: false,
    deviceReady: false,
    accountLabel: null,
    gamertag: null,
    xuid: null,
    wineReady: false,
    xgameruntimeInstalled: false,
  })
  renderSettings()
  expect(
    await screen.findByText(/Update Orbit Wine \(WINE_DLL_FILE_MAP patch required\)/),
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Open Compatibility' }))
  expect(useUiStore.getState().settingsTab).toBe('runtimes')
})
