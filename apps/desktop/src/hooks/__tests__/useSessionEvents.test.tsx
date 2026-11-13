import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useSessionEvents } from '../useSessionEvents'
import { useUiStore } from '@/stores/ui.store'
const callbacks = vi.hoisted(
  () => new Map<string, (event: { payload: { message: string } }) => void>(),
)
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(
    async (name: string, cb: (event: { payload: { message: string } }) => void) => {
      callbacks.set(name, cb)
      return () => callbacks.delete(name)
    },
  ),
}))
afterEach(cleanup)
it('shows runtime errors in the existing toast instead of losing them in the console', async () => {
  const client = new QueryClient()
  renderHook(useSessionEvents, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
  await waitFor(() => expect(callbacks.has('game-session-error')).toBe(true))
  act(() =>
    callbacks.get('game-session-error')?.({
      payload: { message: 'Windows game exited with code 7.' },
    }),
  )
  expect(useUiStore.getState().importToast).toBe('Windows game exited with code 7.')
})
