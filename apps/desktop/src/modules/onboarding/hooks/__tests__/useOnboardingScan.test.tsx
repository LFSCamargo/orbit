import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { listLibraryEntries, scanNativeApps } from '@/lib/tauri'
import type { LibraryEntry } from '@/types/library'
import { useOnboardingScan } from '../useOnboardingScan'

vi.mock('@/lib/tauri', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tauri')>()),
  scanNativeApps: vi.fn(),
  listLibraryEntries: vi.fn(),
}))

const game = (id: string) =>
  ({
    id,
    steamAppId: null,
    owned: true,
    preferredInstallationId: null,
    installations: [],
    game: { id, title: id, provider: 'steam', platform: 'windows', artwork: {} },
  }) as unknown as LibraryEntry

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

afterEach(cleanup)

beforeEach(() => {
  vi.mocked(scanNativeApps).mockReset()
  vi.mocked(listLibraryEntries).mockReset()
})

it('counts games found so far after each phase, before the scan ends', async () => {
  let releaseDetect = () => {}
  vi.mocked(scanNativeApps).mockReturnValue(
    new Promise((resolve) => {
      releaseDetect = () => resolve({ imported: 0, enriched: 0, provider: 'native' })
    }),
  )
  vi.mocked(listLibraryEntries)
    .mockResolvedValueOnce({
      entries: [game('a'), game('b')],
      total: 2,
      nextCursor: null,
    })
    .mockResolvedValue({
      entries: [game('a'), game('b'), game('c')],
      total: 3,
      nextCursor: null,
    })
  const { result } = renderHook(() => useOnboardingScan(), { wrapper })
  act(() => void result.current.run())
  await waitFor(() => expect(result.current.found.total).toBe(2))
  expect(result.current.status).toBe('scanning')
  act(() => releaseDetect())
  await waitFor(() => expect(result.current.status).toBe('complete'))
  expect(result.current.found.total).toBe(3)
})
