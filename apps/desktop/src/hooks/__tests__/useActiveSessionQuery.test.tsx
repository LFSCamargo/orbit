import { act, cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getActiveSession } from '@/lib/tauri'
import { ACTIVE_SESSION_POLL_MS, useActiveSessionQuery } from '../useGames'

vi.mock('@/lib/tauri', () => ({
  getActiveSession: vi.fn().mockResolvedValue({ id: 's1', gameId: 'g1' }),
}))

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.mocked(getActiveSession).mockClear()
})

it('polls the running session only as a slow safety net', async () => {
  // Regression: a 2 s IPC poll ran for the whole game; session events
  // already carry start and end.
  const client = new QueryClient()
  renderHook(useActiveSessionQuery, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(getActiveSession).toHaveBeenCalledTimes(1)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ACTIVE_SESSION_POLL_MS - 1)
  })
  expect(getActiveSession).toHaveBeenCalledTimes(1)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(getActiveSession).toHaveBeenCalledTimes(2)
})
