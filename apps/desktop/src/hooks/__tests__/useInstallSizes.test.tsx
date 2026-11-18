import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import type { LibraryEntry } from '@/types/library'
import { useInstallSizes } from '../useInstallSizes'

vi.mock('@/lib/tauri', () => ({
  getInstallSizes: vi.fn(async () => [
    {
      installationId: 'i1',
      root: '/Volumes/Games/steamapps/common/Hades',
      sizeBytes: 15_000_000_000,
      truncated: false,
    },
  ]),
}))
import { getInstallSizes } from '@/lib/tauri'

afterEach(cleanup)

const entry = (available: boolean) =>
  ({
    id: 'steam:1145360',
    preferredInstallationId: null,
    installations: [{ id: 'i1', available, path: '/x/Hades.exe', sizeBytes: null }],
  }) as unknown as LibraryEntry

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

it('measures the selected install from its real folder', async () => {
  const { result } = renderHook(() => useInstallSizes(entry(true)), { wrapper })
  expect(result.current.measuring).toBe(true)
  await waitFor(() => expect(result.current.measured?.sizeBytes).toBe(15_000_000_000))
  expect(result.current.measured?.root).toBe('/Volumes/Games/steamapps/common/Hades')
  expect(result.current.measuring).toBe(false)
})

it('does not measure a title that is not installed', () => {
  vi.mocked(getInstallSizes).mockClear()
  const { result } = renderHook(() => useInstallSizes(entry(false)), { wrapper })
  expect(result.current.measuring).toBe(false)
  expect(getInstallSizes).not.toHaveBeenCalled()
})
