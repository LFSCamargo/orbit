import { renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { gamepadManager } from '@/controllers/GamepadManager'
import { xcloudStreamPlaying } from '@/lib/tauri'
import { useStreamStandDown } from '../useStreamStandDown'

vi.mock('@/lib/tauri', () => ({
  xcloudStreamPlaying: vi.fn().mockResolvedValue(undefined),
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(xcloudStreamPlaying).mockClear()
})

it('stands Orbit down while the stream plays and wakes it when paused or closed', () => {
  // Regression: Orbit kept polling the pad every frame and Rust kept sending
  // right-stick scroll events while the WebView decoded the stream.
  const suspend = vi.spyOn(gamepadManager, 'setSuspended')
  const { rerender, unmount } = renderHook(({ paused }) => useStreamStandDown(paused), {
    initialProps: { paused: false },
  })
  expect(suspend).toHaveBeenLastCalledWith(true)
  expect(xcloudStreamPlaying).toHaveBeenLastCalledWith(true)

  // Paused behind Orbit's menu: Orbit's own navigation is back.
  rerender({ paused: true })
  expect(suspend).toHaveBeenLastCalledWith(false)
  expect(xcloudStreamPlaying).toHaveBeenLastCalledWith(false)

  rerender({ paused: false })
  unmount()
  expect(suspend).toHaveBeenLastCalledWith(false)
  expect(xcloudStreamPlaying).toHaveBeenLastCalledWith(false)
})
