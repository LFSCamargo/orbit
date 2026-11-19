import { afterEach, expect, it } from 'vitest'
import { leaveTextField } from '../leaveTextField'

afterEach(() => {
  document.body.replaceChildren()
})

it.each(['input', 'textarea'])('B leaves a focused %s before anything else', (tag) => {
  const field = document.createElement(tag)
  document.body.append(field)
  field.focus()
  expect(leaveTextField()).toBe(true)
  expect(document.activeElement).not.toBe(field)
})

it('returns focus to the control that owns the field when there is one', () => {
  document.body.innerHTML = `<div data-focus-id="search" tabindex="-1"><input /></div>`
  const input = document.querySelector('input')!
  input.focus()
  expect(leaveTextField()).toBe(true)
  expect(document.activeElement).toBe(document.querySelector('[data-focus-id]'))
})

it('does nothing when no text field has focus', () => {
  const button = document.createElement('button')
  document.body.append(button)
  button.focus()
  expect(leaveTextField()).toBe(false)
  expect(document.activeElement).toBe(button)
})

it('treats checkboxes and switches as controls, not text entry', () => {
  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  document.body.append(checkbox)
  checkbox.focus()
  expect(leaveTextField()).toBe(false)
})
