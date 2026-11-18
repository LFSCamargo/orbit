import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { NetworkCard, sparklinePoints } from '../NetworkCard'

afterEach(cleanup)

it('scales the sparkline to the busiest sample', () => {
  expect(sparklinePoints([5])).toBe('')
  expect(sparklinePoints([0, 10])).toBe('0,40 220,4')
})

it('reads the live rate when connected and a dash otherwise', () => {
  const { rerender } = render(<NetworkCard connected rate={58_400_000} samples={[]} />)
  expect(screen.getByText('58.4 MB/s')).toBeTruthy()
  rerender(<NetworkCard connected={false} rate={null} samples={[]} />)
  expect(screen.queryByText(/MB\/s/)).toBeNull()
})
