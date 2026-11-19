import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useSteamLibraryEvents } from '../useSteamLibraryEvents'

const callbacks = vi.hoisted(() => new Map<string, () => void>())
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, cb: () => void) => {
    callbacks.set(name, cb)
    return () => callbacks.delete(name)
  }),
}))
vi.mock('@/lib/devMockApi', () => ({ isTauriRuntime: () => true }))
afterEach(cleanup)
it('refreshes both Steam and unified libraries when background metadata arrives and cleans up', async () => {
  const client = new QueryClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const view = renderHook(useSteamLibraryEvents, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
  await waitFor(() => expect(callbacks.has('steam-library-updated')).toBe(true))
  act(() => callbacks.get('steam-library-updated')?.())
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['steam-windows-library'] })
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['library'] })
  view.unmount()
  expect(callbacks.size).toBe(0)
})
