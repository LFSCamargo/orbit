import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { BusyLabel } from '../BusyLabel'
import { SkeletonBlock, SkeletonPanel } from '../Skeleton'
import { Spinner } from '../Spinner'

it('draws the spinner as decoration only', () => {
  const { container } = render(<Spinner size={18} />)
  const svg = container.querySelector('svg')
  expect(svg).toHaveAttribute('aria-hidden', 'true')
  expect(svg).toHaveAttribute('width', '18')
  expect(container.textContent).toBe('')
})

it('keeps a busy button labelled the same, with a spinner instead of loading text', () => {
  const { rerender } = render(
    <button type="button">
      <BusyLabel busy={false}>Save changes</BusyLabel>
    </button>,
  )
  const button = screen.getByRole('button', { name: 'Save changes' })
  expect(button.querySelector('svg')).toBeNull()
  rerender(
    <button type="button">
      <BusyLabel busy>Save changes</BusyLabel>
    </button>,
  )
  expect(screen.getByRole('button', { name: 'Save changes' })).toBe(button)
  expect(button.querySelector('[data-busy="true"]')).not.toBeNull()
  expect(button.querySelector('svg')).not.toBeNull()
  expect(button.textContent).not.toMatch(/…|\.\.\./)
})

it('shows loading panels as shimmer shapes, named for assistive tech only', () => {
  const { container } = render(<SkeletonPanel label="Loading settings" rows={3} />)
  const status = screen.getByRole('status', { name: 'Loading settings' })
  expect(status.textContent).toBe('')
  expect(container.querySelectorAll('[data-skeleton]').length).toBeGreaterThanOrEqual(3)
  const { container: block } = render(<SkeletonBlock className="h-4" />)
  expect(block.firstElementChild).toHaveAttribute('aria-hidden', 'true')
})
