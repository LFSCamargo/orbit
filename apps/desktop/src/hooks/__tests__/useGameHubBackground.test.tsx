import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSetting, getGameHubLibrary, openGameHub } from '@/lib/tauri'
import { useGameHubBackground } from '../useGameHubBackground'

vi.mock('@/lib/tauri', () => ({
  getSetting: vi.fn(),
  getGameHubLibrary: vi.fn(),
  openGameHub: vi.fn(),
}))
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(openGameHub).mockResolvedValue()
})
afterEach(cleanup)
describe('GameHub background preference', () => {
  it('starts the available host without foreground activation after opt-in', async () => {
    vi.mocked(getSetting).mockResolvedValue(true)
    vi.mocked(getGameHubLibrary).mockResolvedValue({
      available: true,
      running: false,
      games: [],
      warnings: [],
      capturedAt: '2026-11-09',
      directInstallSupported: false,
    })
    renderHook(useGameHubBackground, { wrapper })
    await waitFor(() => expect(openGameHub).toHaveBeenCalledWith(false))
  })
  it('never starts a second host when GameHub is already running', async () => {
    vi.mocked(getSetting).mockResolvedValue(true)
    vi.mocked(getGameHubLibrary).mockResolvedValue({
      available: true,
      running: true,
      games: [],
      warnings: [],
      capturedAt: '2026-11-09',
      directInstallSupported: false,
    })
    renderHook(useGameHubBackground, { wrapper })
    await waitFor(() => expect(getGameHubLibrary).toHaveBeenCalled())
    expect(openGameHub).not.toHaveBeenCalled()
  })
  it('does not inspect or launch GameHub before opt-in', async () => {
    vi.mocked(getSetting).mockResolvedValue(false)
    renderHook(useGameHubBackground, { wrapper })
    await waitFor(() => expect(getSetting).toHaveBeenCalledWith('gameHubBackground'))
    expect(getGameHubLibrary).not.toHaveBeenCalled()
    expect(openGameHub).not.toHaveBeenCalled()
  })
})
