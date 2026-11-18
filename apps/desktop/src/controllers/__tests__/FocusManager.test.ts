import { afterEach, expect, it } from 'vitest'
import { FocusManager } from '../FocusManager'

afterEach(() => {
  document.body.replaceChildren()
})

/** A button placed at a fixed viewport box (jsdom has no layout). */
function place(
  manager: FocusManager,
  id: string,
  box: { x: number; y: number; w?: number; h?: number },
  parent: HTMLElement = document.body,
) {
  const element = document.createElement('button')
  element.dataset.focusId = id
  const { x, y, w = 100, h = 40 } = box
  element.getBoundingClientRect = () =>
    ({
      left: x,
      top: y,
      right: x + w,
      bottom: y + h,
      width: w,
      height: h,
      x,
      y,
      toJSON: () => ({}),
    }) as DOMRect
  parent.append(element)
  manager.register({ id, element, group: 'page', order: 0 })
  return element
}

it('moves real DOM focus with the controller so screen readers follow it', () => {
  const manager = new FocusManager()
  const first = place(manager, 'first', { x: 0, y: 0 })
  const second = place(manager, 'second', { x: 0, y: 100 })
  manager.setFocus('first', { scroll: false })
  expect(document.activeElement).toBe(first)
  manager.move('down')
  expect(manager.getFocusedId()).toBe('second')
  expect(document.activeElement).toBe(second)
})

it('does not pull the caret out of a text field on a passive focus change', () => {
  const manager = new FocusManager()
  place(manager, 'card', { x: 0, y: 0 })
  const input = document.createElement('input')
  document.body.append(input)
  input.focus()
  manager.setFocus('card', { scroll: false })
  expect(manager.getFocusedId()).toBe('card')
  expect(document.activeElement).toBe(input)
})

it('skips controls that are hidden from assistive technology', () => {
  const manager = new FocusManager()
  place(manager, 'top', { x: 0, y: 0 })
  const hidden = document.createElement('div')
  hidden.setAttribute('aria-hidden', 'true')
  document.body.append(hidden)
  place(manager, 'behind-modal', { x: 0, y: 60 }, hidden)
  place(manager, 'below', { x: 0, y: 200 })
  manager.setFocus('top', { scroll: false })
  manager.move('down')
  expect(manager.getFocusedId()).toBe('below')
})

it('stays in the scrolled pane instead of jumping to the fixed toolbar', () => {
  // Regression: opening the details edit form scrolled Edit away and D-pad
  // down landed on the top navigation.
  const manager = new FocusManager()
  place(manager, 'toolbar-home', { x: 0, y: 10 })
  const main = document.createElement('div')
  main.style.overflowY = 'auto'
  main.getBoundingClientRect = () =>
    ({ left: 0, top: 80, right: 1024, bottom: 768, width: 1024, height: 688 }) as DOMRect
  document.body.append(main)
  place(manager, 'details-edit', { x: 0, y: -400 }, main)
  place(manager, 'form-field', { x: 0, y: 160 }, main)
  manager.setFocus('details-edit', { scroll: false })
  manager.move('down')
  expect(manager.getFocusedId()).toBe('form-field')
})

it('picks up from what is on screen after the stick scrolled focus away', () => {
  const manager = new FocusManager()
  place(manager, 'scrolled-away', { x: 0, y: -900 })
  place(manager, 'visible-top', { x: 0, y: 120 })
  place(manager, 'visible-bottom', { x: 0, y: 400 })
  manager.setFocus('scrolled-away', { scroll: false })
  manager.move('down')
  expect(manager.getFocusedId()).toBe('visible-top')
  manager.setFocus('scrolled-away', { scroll: false })
  manager.move('up')
  expect(manager.getFocusedId()).toBe('visible-bottom')
})
