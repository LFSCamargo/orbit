import { render, cleanup } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, expect, it } from 'vitest'
import { wheelScrollTarget } from '../../lib/shelfScroll'
import { useShelfWheel } from '../useShelfWheel'

afterEach(cleanup)

function Shelf() {
  const ref = useRef<HTMLDivElement>(null)
  useShelfWheel(ref)
  return <div ref={ref} data-testid="shelf" />
}

function overflow(shelf: HTMLElement) {
  Object.defineProperty(shelf, 'clientWidth', { value: 800 })
  Object.defineProperty(shelf, 'scrollWidth', { value: 2400 })
}

it('springs the shelf sideways with a vertical wheel and keeps the page still', () => {
  const { getByTestId } = render(<Shelf />)
  const shelf = getByTestId('shelf')
  overflow(shelf)
  const event = new WheelEvent('wheel', { deltaY: 120, cancelable: true, bubbles: true })
  shelf.dispatchEvent(event)
  expect(wheelScrollTarget(shelf)).toBe(120)
  expect(event.defaultPrevented).toBe(true)
})

it('does not intercept a horizontal wheel', () => {
  const { getByTestId } = render(<Shelf />)
  const shelf = getByTestId('shelf')
  overflow(shelf)
  const event = new WheelEvent('wheel', { deltaX: 120, cancelable: true, bubbles: true })
  shelf.dispatchEvent(event)
  expect(wheelScrollTarget(shelf)).toBeUndefined()
  expect(event.defaultPrevented).toBe(false)
})
