import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { requestFullscreen, useFullscreen, useFullscreenSync } from '../useFullscreen'
import { useUiStore } from '@/stores/ui.store'

const native = vi.hoisted(() => ({
  fullscreen: false,
  onResized: null as null | (() => void),
}))
const setWindowFullscreen = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/lib/tauri', () => ({
  isTauriRuntime: () => true,
  setWindowFullscreen: (value: boolean) => setWindowFullscreen(value),
}))
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    isFullscreen: async () => native.fullscreen,
    onResized: async (callback: () => void) => {
      native.onResized = callback
      return () => {
        native.onResized = null
      }
    },
  }),
}))

async function nativeResize(fullscreen: boolean) {
  native.fullscreen = fullscreen
  await act(async () => {
    native.onResized?.()
    await Promise.resolve()
  })
}

beforeEach(() => {
  native.fullscreen = false
  useUiStore.setState({ fullscreen: true })
})

afterEach(() => {
  cleanup()
  setWindowFullscreen.mockClear()
  native.onResized = null
})

it('leaves startup fullscreen to the window instead of toggling mid-animation', async () => {
  renderHook(useFullscreenSync)
  await waitFor(() => expect(native.onResized).not.toBeNull())
  expect(setWindowFullscreen).not.toHaveBeenCalled()
})

it('never echoes states the window reports back to the window', async () => {
  // Regression: an in-between "not fullscreen" during the enter animation was
  // pushed back as a command, reversing the animation forever.
  renderHook(useFullscreenSync)
  await waitFor(() => expect(native.onResized).not.toBeNull())
  await nativeResize(false)
  await nativeResize(true)
  await nativeResize(false)
  await nativeResize(true)
  expect(useUiStore.getState().fullscreen).toBe(true)
  expect(setWindowFullscreen).not.toHaveBeenCalled()
})

it('applies a user toggle once, however many screens read the state', async () => {
  renderHook(useFullscreenSync)
  // Settings reads the state too; a second consumer must not send again.
  const { result } = renderHook(useFullscreen)
  renderHook(useFullscreen)
  await waitFor(() => expect(native.onResized).not.toBeNull())
  await nativeResize(true)
  act(() => result.current.setFullscreen(false))
  expect(setWindowFullscreen).toHaveBeenCalledTimes(1)
  expect(setWindowFullscreen).toHaveBeenCalledWith(false)
  // The exit animation reports its states; none is sent back.
  await nativeResize(true)
  await nativeResize(false)
  expect(setWindowFullscreen).toHaveBeenCalledTimes(1)
})

it('binds the fullscreen shortcut once', async () => {
  native.fullscreen = true
  renderHook(useFullscreenSync)
  await waitFor(() => expect(native.onResized).not.toBeNull())
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true }))
  })
  expect(setWindowFullscreen).toHaveBeenCalledTimes(1)
  expect(setWindowFullscreen).toHaveBeenCalledWith(false)
  act(() => requestFullscreen(true))
  expect(setWindowFullscreen).toHaveBeenLastCalledWith(true)
})
