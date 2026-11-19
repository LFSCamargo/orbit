import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { focusManager } from '@/controllers/FocusManager'
import { Switch } from '@/components/ui/switch'
import { Focusable } from '../Focusable'

afterEach(() => {
  cleanup()
  act(() => focusManager.setFocus(null))
})

// Regression: a 2px ring offset filled with the near-black canvas colour drew
// a dark border between controls and their focus ring.
it('draws the focus ring flush, with no dark offset gap', () => {
  render(
    <Focusable focusId="ring-test" group="ring-test" aria-label="Close">
      ×
    </Focusable>,
  )
  act(() => focusManager.setFocus('ring-test'))
  const button = screen.getByRole('button', { name: 'Close' })
  expect(button).toHaveAttribute('data-focused', 'true')
  expect(button.className).toContain('ring-2')
  expect(button.className).not.toMatch(/ring-offset/)
})

it('gives switches the same flush ring', () => {
  render(<Switch aria-label="Toggle" />)
  expect(screen.getByRole('switch', { name: 'Toggle' }).className).not.toMatch(
    /ring-offset-(2|orbit-canvas)/,
  )
})
