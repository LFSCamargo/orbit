import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useSteamDownloadEvents } from '../useSteamDownloadEvents'
import { useDownloadStore } from '@/lib/downloadProgress'

const callbacks = vi.hoisted(
  () => new Map<string, (event: { payload: unknown }) => void>(),
)

vi.mock('@/lib/devMockApi', () => ({ isTauriRuntime: () => true }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, cb: (event: { payload: unknown }) => void) => {
    callbacks.set(name, cb)
    return () => callbacks.delete(name)
  }),
}))

afterEach(() => {
  cleanup()
  callbacks.clear()
  useDownloadStore.setState({ tasks: {}, failures: {} })
})

it('keeps Steam setup failures instead of marking the transfer ready', async () => {
  renderHook(useSteamDownloadEvents)
  await waitFor(() => expect(callbacks.has('steam-download-progress')).toBe(true))
  act(() => {
    callbacks.get('steam-download-progress')?.({
      payload: {
        key: 'steam:setup',
        label: 'Steam for Windows',
        done: true,
        error: 'Steam for Windows did not finish installing',
      },
    })
  })
  expect(useDownloadStore.getState().tasks['steam:setup']).toBeUndefined()
  expect(useDownloadStore.getState().failures['steam:setup']).toBe(
    'Steam for Windows did not finish installing',
  )
})
