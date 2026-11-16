import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useSteamClientEvents } from '../useSteamClientEvents'
import type { SteamWindowsStatus } from '@/types/steam'

const callbacks = vi.hoisted(
  () => new Map<string, (event: { payload: SteamWindowsStatus }) => void>(),
)
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(
    async (name: string, cb: (event: { payload: SteamWindowsStatus }) => void) => {
      callbacks.set(name, cb)
      return () => callbacks.delete(name)
    },
  ),
}))
vi.mock('@/lib/devMockApi', () => ({ isTauriRuntime: () => true }))

afterEach(cleanup)

it('patches steam-windows-status from steam-client events and cleans up', async () => {
  const client = new QueryClient()
  const view = renderHook(useSteamClientEvents, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
  await waitFor(() => expect(callbacks.has('steam-client')).toBe(true))
  const status: SteamWindowsStatus = {
    signedIn: true,
    accountName: 'lokopoco98',
    steamInstalled: true,
    clientRunning: true,
    clientLoggedIn: true,
    clientPhase: 'ready',
    clientCaption: 'Steam is ready',
    ownedCount: 4,
  }
  act(() => callbacks.get('steam-client')?.({ payload: status }))
  expect(client.getQueryData(['steam-windows-status'])).toEqual(status)
  view.unmount()
  expect(callbacks.size).toBe(0)
})
