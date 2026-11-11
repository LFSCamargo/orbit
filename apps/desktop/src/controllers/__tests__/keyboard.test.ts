import { afterEach, expect, it } from 'vitest'
import { keyboardControllerAction } from '../keyboard'

afterEach(() => {
  document.body.replaceChildren()
})

function actionFor(
  target: HTMLElement,
  key: string,
  code: string,
  options: KeyboardEventInit = {},
) {
  let action: ReturnType<typeof keyboardControllerAction> = null
  target.addEventListener(
    'keydown',
    (event) => {
      action = keyboardControllerAction(event)
    },
    { once: true },
  )
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      code,
      bubbles: true,
      composed: true,
      ...options,
    }),
  )
  return action
}

it('never binds Backspace to navigation', () => {
  expect(actionFor(document.body, 'Backspace', 'Backspace')).toBeNull()
})

it.each(['input', 'textarea', 'select'])('preserves editing keys in %s', (tag) => {
  const target = document.createElement(tag)
  document.body.append(target)
  for (const [key, code] of [
    ['Backspace', 'Backspace'],
    ['[', 'BracketLeft'],
    [']', 'BracketRight'],
    ['m', 'KeyM'],
    ['Escape', 'Escape'],
    ['ArrowLeft', 'ArrowLeft'],
    ['Enter', 'Enter'],
  ]) {
    expect(actionFor(target, key, code)).toBeNull()
  }
})

it('protects nested editable and custom textbox contents', () => {
  for (const attribute of [
    'contenteditable="true"',
    'role="textbox"',
    'role="combobox"',
  ]) {
    document.body.innerHTML = `<div ${attribute}><span>Text</span></div>`
    expect(actionFor(document.querySelector('span')!, 'm', 'KeyM')).toBeNull()
  }
})

it('preserves composition, consumed events, and system shortcuts', () => {
  expect(actionFor(document.body, 'm', 'KeyM', { isComposing: true })).toBeNull()
  for (const modifier of ['metaKey', 'ctrlKey', 'altKey']) {
    expect(actionFor(document.body, 'f', 'KeyF', { [modifier]: true })).toBeNull()
  }
  const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
  event.preventDefault()
  expect(keyboardControllerAction(event)).toBeNull()
})

it('keeps keyboard navigation available outside text fields', () => {
  expect(actionFor(document.body, 'Escape', 'Escape')).toBe('back')
  expect(actionFor(document.body, '[', 'BracketLeft')).toBe('section-prev')
  expect(actionFor(document.body, 'ArrowDown', 'ArrowDown')).toBe('navigate-down')
})
