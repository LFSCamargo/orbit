import { afterEach, expect, it, vi } from 'vitest'
import { focusManager } from '@/controllers/FocusManager'
import { applyPageScroll } from '../pageScroll'

afterEach(() => {
  focusManager.setFocus(null)
  document.body.replaceChildren()
})

function scrollable(className: string, height = 200, content = 1000) {
  const element = document.createElement('div')
  element.className = className
  element.style.overflowY = 'auto'
  Object.defineProperty(element, 'clientHeight', { value: height, configurable: true })
  Object.defineProperty(element, 'scrollHeight', { value: content, configurable: true })
  return element
}

function button(id: string) {
  const element = document.createElement('button')
  element.dataset.focusId = id
  return element
}

it('scrolls the pane that holds the focused control, not the page behind it', () => {
  const main = scrollable('macos-main')
  const pane = scrollable('settings-content-scroll')
  const control = button('settings-row')
  pane.append(control)
  main.append(pane)
  document.body.append(main)
  focusManager.register({
    id: 'settings-row',
    element: control,
    group: 'settings',
    order: 0,
  })
  focusManager.setFocus('settings-row', { scroll: false })

  applyPageScroll(0, 40)

  expect(pane.scrollTop).toBe(40)
  expect(main.scrollTop).toBe(0)
  focusManager.unregister('settings-row')
})

it('falls back to the page once the inner pane cannot move further', () => {
  const main = scrollable('macos-main')
  const pane = scrollable('drawer', 200, 200)
  const control = button('drawer-close')
  pane.append(control)
  main.append(pane)
  document.body.append(main)
  focusManager.register({
    id: 'drawer-close',
    element: control,
    group: 'drawer',
    order: 0,
  })
  focusManager.setFocus('drawer-close', { scroll: false })

  applyPageScroll(0, 25)

  expect(main.scrollTop).toBe(25)
  focusManager.unregister('drawer-close')
})

it('keeps an open dialog from scrolling the page behind it', () => {
  const main = scrollable('macos-main')
  document.body.append(main)
  const dialog = document.createElement('div')
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  const body = scrollable('dialog-body', 100, 100)
  const control = button('dialog-ok')
  body.append(control)
  dialog.append(body)
  document.body.append(dialog)
  focusManager.register({ id: 'dialog-ok', element: control, group: 'dialog', order: 0 })
  focusManager.setFocus('dialog-ok', { scroll: false })

  applyPageScroll(0, 30)

  expect(main.scrollTop).toBe(0)
  focusManager.unregister('dialog-ok')
})

it('finds the pane once per stick gesture, not on every frame', () => {
  // Regression: each 60 Hz scroll frame walked computed styles up the DOM.
  const main = scrollable('macos-main')
  const pane = scrollable('library-pane')
  const control = button('library-card')
  pane.append(control)
  main.append(pane)
  document.body.append(main)
  focusManager.register({ id: 'library-card', element: control, group: 'lib', order: 0 })
  focusManager.setFocus('library-card', { scroll: false })

  applyPageScroll(0, 10)
  const spy = vi.spyOn(window, 'getComputedStyle')
  applyPageScroll(0, 10)
  applyPageScroll(0, 10)
  expect(spy).not.toHaveBeenCalled()
  expect(pane.scrollTop).toBe(30)
  spy.mockRestore()
  focusManager.unregister('library-card')
})
