import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { type ReactNode } from 'react'
import { prepareThemePreviews } from '@/lib/tauri'
import { useThemePreviews } from '../useThemePreviews'

vi.mock('@/lib/tauri', () => ({
  isTauriRuntime: () => true,
  prepareThemePreviews: vi.fn(),
}))
afterEach(cleanup)

it('uses shipped previews immediately without starting native preparation on entry', async () => {
  const client = new QueryClient()
  const { result, unmount } = renderHook(() => useThemePreviews(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
  await waitFor(() => expect(Object.keys(result.current.previews)).toHaveLength(8))
  expect(result.current.preparing).toBe(false)
  expect(prepareThemePreviews).not.toHaveBeenCalled()
  expect(result.current.previews['god-of-war'].hero).toMatch(/preview-hero.*\.webp/)
  unmount()
  client.clear()
})
