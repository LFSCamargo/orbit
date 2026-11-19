import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  closeTopOverlay,
  hasOpenOverlay,
  pushOverlay,
  useOverlayBack,
} from '../overlayStack'

afterEach(cleanup)

function escape() {
  const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
  window.dispatchEvent(event)
  return event
}

it('closes the newest overlay first and then the one beneath it', () => {
  const drawer = vi.fn()
  const dialog = vi.fn()
  const popDrawer = pushOverlay(drawer)
  const popDialog = pushOverlay(dialog)
  expect(closeTopOverlay()).toBe(true)
  expect(dialog).toHaveBeenCalledTimes(1)
  expect(drawer).not.toHaveBeenCalled()
  popDialog()
  expect(closeTopOverlay()).toBe(true)
  expect(drawer).toHaveBeenCalledTimes(1)
  popDrawer()
  expect(closeTopOverlay()).toBe(false)
  expect(hasOpenOverlay()).toBe(false)
})

it('handles Escape only while an overlay is open and stops it reaching the screen', () => {
  const screenBack = vi.fn()
  window.addEventListener('keydown', screenBack)
  const onClose = vi.fn()
  const { rerender, unmount } = renderHook(({ open }) => useOverlayBack(open, onClose), {
    initialProps: { open: true },
  })
  expect(escape().defaultPrevented).toBe(true)
  expect(onClose).toHaveBeenCalledTimes(1)
  expect(screenBack).not.toHaveBeenCalled()

  rerender({ open: false })
  expect(escape().defaultPrevented).toBe(false)
  expect(onClose).toHaveBeenCalledTimes(1)
  expect(screenBack).toHaveBeenCalledTimes(1)
  unmount()
  window.removeEventListener('keydown', screenBack)
})

it('leaves Escape to an open select list', () => {
  const onClose = vi.fn()
  const { unmount } = renderHook(() => useOverlayBack(true, onClose))
  const listbox = document.createElement('div')
  listbox.setAttribute('role', 'listbox')
  const option = document.createElement('button')
  listbox.append(option)
  document.body.append(listbox)
  option.focus()
  escape()
  expect(onClose).not.toHaveBeenCalled()
  listbox.remove()
  unmount()
})
