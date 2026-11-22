import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppUpdateEvents } from '../useAppUpdateEvents'
import { useAppUpdateStore } from '@/stores/appUpdate.store'
import { useSessionStore } from '@/stores/session.store'
import { notify } from '@/lib/toast'
import type { AppUpdateState } from '@/types/appUpdate'
import type { GameSession } from '@/types/game'

const listeners = vi.hoisted(
  () => new Map<string, (event: { payload: AppUpdateState }) => void>(),
)
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(
    async (name: string, cb: (event: { payload: AppUpdateState }) => void) => {
      listeners.set(name, cb)
      return () => listeners.delete(name)
    },
  ),
}))
vi.mock('@/lib/devMockApi', () => ({ isTauriRuntime: () => true }))
vi.mock('@/lib/tauri', () => ({
  appUpdateStatus: vi.fn().mockResolvedValue({ status: 'idle' }),
}))
vi.mock('@/lib/toast', () => ({ notify: { success: vi.fn() } }))

const ready: AppUpdateState = { status: 'ready', version: '2.2.0', notes: null }

beforeEach(() => {
  useAppUpdateStore.setState({ state: { status: 'idle' } })
  useSessionStore.setState({ activeSession: null })
})
afterEach(() => {
  cleanup()
  vi.mocked(notify.success).mockClear()
})

it('follows the update state pushed by Rust and announces a ready update once', async () => {
  renderHook(useAppUpdateEvents)
  await waitFor(() => expect(listeners.has('app-update')).toBe(true))
  act(() =>
    listeners.get('app-update')?.({
      payload: { status: 'downloading', version: '2.2.0', downloaded: 5, total: 10 },
    }),
  )
  expect(useAppUpdateStore.getState().state.status).toBe('downloading')
  expect(notify.success).not.toHaveBeenCalled()

  act(() => listeners.get('app-update')?.({ payload: ready }))
  act(() => listeners.get('app-update')?.({ payload: ready }))
  expect(notify.success).toHaveBeenCalledTimes(1)
  expect(vi.mocked(notify.success).mock.calls[0][0].title).toContain('2.2.0')
})

it('waits for the game to end before announcing the update', async () => {
  useSessionStore.setState({ activeSession: { id: 's1', gameId: 'g1' } as GameSession })
  renderHook(useAppUpdateEvents)
  await waitFor(() => expect(listeners.has('app-update')).toBe(true))
  act(() => listeners.get('app-update')?.({ payload: ready }))
  expect(notify.success).not.toHaveBeenCalled()
  act(() => useSessionStore.setState({ activeSession: null }))
  expect(notify.success).toHaveBeenCalledTimes(1)
})
