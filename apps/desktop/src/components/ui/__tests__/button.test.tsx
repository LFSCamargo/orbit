import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { Button, buttonClass } from '../button'

afterEach(cleanup)

it('gives primary buttons the fixed fire gradient', () => {
  const primary = buttonClass({ variant: 'primary' })
  expect(primary).toContain('orbit-btn-fire')
  expect(primary).not.toContain('bg-orbit-accent')
})

it('keeps secondary, quiet and danger off the gradient', () => {
  for (const variant of ['secondary', 'quiet', 'danger'] as const) {
    expect(buttonClass({ variant })).not.toContain('orbit-btn-fire')
  }
  expect(buttonClass({ variant: 'secondary' })).toContain('orbit-glass-control')
  expect(buttonClass({ variant: 'danger' })).toContain('bg-rose-500')
})

it('defaults to a medium primary pill', () => {
  expect(buttonClass()).toBe(buttonClass({ variant: 'primary', size: 'md' }))
  expect(buttonClass()).toContain('rounded-full')
  // Every button is a pill, whatever its variant or size.
  for (const variant of ['primary', 'secondary', 'quiet', 'danger'] as const)
    for (const size of ['sm', 'md', 'lg'] as const)
      expect(buttonClass({ variant, size })).toContain('rounded-full')
})

it('sizes small, medium and large', () => {
  expect(buttonClass({ size: 'sm' })).toContain('text-xs')
  expect(buttonClass({ size: 'lg' })).toContain('min-h-14')
})

it('appends caller classes last', () => {
  expect(buttonClass({ className: 'mt-4' }).endsWith('mt-4')).toBe(true)
})

it('renders a typed button that defaults to type="button"', () => {
  render(<Button>Continue</Button>)
  const button = screen.getByRole('button', { name: 'Continue' })
  expect(button).toHaveAttribute('type', 'button')
  expect(button.className).toContain('orbit-btn-fire')
})
