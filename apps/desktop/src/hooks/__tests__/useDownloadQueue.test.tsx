import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { queuePosition, useDownloadQueue } from '../useDownloadQueue'

const callbacks = vi.hoisted(
  () => new Map<string, (event: { payload: unknown }) => void>(),
)

vi.mock('@/lib/devMockApi', () => ({ isTauriRuntime: () => true }))
vi.mock('@/lib/tauri', () => ({
  getDownloadQueue: vi.fn().mockResolvedValue({ active: null, pending: [] }),
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, cb: (event: { payload: unknown }) => void) => {
    callbacks.set(name, cb)
    return () => callbacks.delete(name)
  }),
}))

afterEach(() => {
  cleanup()
  callbacks.clear()
})

const item = (appId: string) => ({ appId, title: appId, coverUrl: null, paused: false })

it('follows queue changes pushed by the native side', async () => {
  const client = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(useDownloadQueue, { wrapper })
  await waitFor(() => expect(callbacks.has('download-queue-changed')).toBe(true))
  await waitFor(() =>
    expect(client.getQueryState(['download-queue'])?.status).toBe('success'),
  )
  act(() => {
    callbacks.get('download-queue-changed')?.({
      payload: { active: item('570'), pending: [item('730')] },
    })
  })
  await waitFor(() => expect(result.current.active?.appId).toBe('570'))
  expect(queuePosition(result.current, '730')).toBe(1)
  expect(queuePosition(result.current, '570')).toBeNull()
  expect(queuePosition(result.current, null)).toBeNull()
})
