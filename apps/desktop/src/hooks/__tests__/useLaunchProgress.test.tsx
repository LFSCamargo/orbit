import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useLaunchProgress } from '../useLaunchProgress'
import { useLaunchStore } from '@/stores/launch.store'

const callbacks = vi.hoisted(
  () => new Map<string, (event: { payload: unknown }) => void>(),
)

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, cb: (event: { payload: unknown }) => void) => {
    callbacks.set(name, cb)
    return () => callbacks.delete(name)
  }),
}))

afterEach(() => {
  cleanup()
  useLaunchStore.getState().clear()
})

it('tracks launch steps and keeps the failed stage on the overlay', async () => {
  renderHook(useLaunchProgress)
  await waitFor(() => expect(callbacks.has('game-launch-progress')).toBe(true))
  act(() => {
    callbacks.get('game-launch-progress')?.({
      payload: {
        gameId: 'g1',
        step: 'prefix',
        message: 'Preparing the Windows environment',
        index: 2,
        total: 6,
        failed: false,
      },
    })
  })
  expect(useLaunchStore.getState().launch?.step).toBe('prefix')
  act(() => {
    callbacks.get('game-launch-progress')?.({
      payload: {
        gameId: 'g1',
        step: 'prefix',
        message: 'Wine environment setup failed',
        index: 2,
        total: 6,
        failed: true,
      },
    })
  })
  expect(useLaunchStore.getState().launch?.failed).toBe(true)
  expect(useLaunchStore.getState().launch?.message).toBe('Wine environment setup failed')
})

it('clears the overlay when the session starts', async () => {
  renderHook(useLaunchProgress)
  await waitFor(() => expect(callbacks.has('game-session-started')).toBe(true))
  act(() => {
    useLaunchStore.getState().begin('g1')
    callbacks.get('game-session-started')?.({ payload: {} })
  })
  expect(useLaunchStore.getState().launch).toBeNull()
})

it('restores the failure banner when a spawned game exits unsuccessfully', async () => {
  const view = renderHook(useLaunchProgress)
  await waitFor(() => expect(callbacks.has('game-session-ended')).toBe(true))
  act(() => {
    useLaunchStore.getState().begin('g1')
    callbacks.get('game-session-started')?.({ payload: { gameId: 'g1' } })
    callbacks.get('game-session-ended')?.({
      payload: { gameId: 'g1', exitCode: 53, stopReason: 'process-exited' },
    })
  })
  expect(useLaunchStore.getState().launch).toMatchObject({
    gameId: 'g1',
    failed: true,
    step: 'spawn',
  })
  expect(useLaunchStore.getState().launch?.message).toMatch(/Steam was not ready/)
  expect(useLaunchStore.getState().launch?.message).toMatch(/update window/)
  view.unmount()
  renderHook(useLaunchProgress)
  expect(useLaunchStore.getState().launch?.failed).toBe(true)
})

it('does not reopen the banner for a normal exit, user stop, or an older game', async () => {
  renderHook(useLaunchProgress)
  await waitFor(() => expect(callbacks.has('game-session-ended')).toBe(true))
  act(() => {
    callbacks.get('game-session-ended')?.({
      payload: { gameId: 'g1', exitCode: 0, stopReason: 'process-exited' },
    })
    callbacks.get('game-session-ended')?.({
      payload: { gameId: 'g1', exitCode: 53, stopReason: 'user-stopped' },
    })
  })
  expect(useLaunchStore.getState().launch).toBeNull()
  act(() => {
    useLaunchStore.getState().begin('g2')
    callbacks.get('game-session-ended')?.({
      payload: { gameId: 'g1', exitCode: 53, stopReason: 'process-exited' },
    })
  })
  expect(useLaunchStore.getState().launch).toMatchObject({ gameId: 'g2', failed: false })
})
