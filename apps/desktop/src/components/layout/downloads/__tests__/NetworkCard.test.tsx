import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { NetworkCard, sparklinePoints } from '../NetworkCard'

afterEach(cleanup)

it('scales the sparkline to the busiest sample', () => {
  expect(sparklinePoints([5])).toBe('')
  expect(sparklinePoints([0, 10])).toBe('0,40 220,4')
})

it('reads the Mac’s live download and upload rates', () => {
  render(
    <NetworkCard
      stats={{ online: true, downloadRate: 58_400_000, uploadRate: 1_200_000 }}
      samples={[]}
    />,
  )
  expect(screen.getByText('58.4 MB/s')).toBeTruthy()
  expect(screen.getByText('1.2 MB/s')).toBeTruthy()
  expect(screen.getByText('Online')).toBeTruthy()
})

it('shows dashes before the first sample', () => {
  render(<NetworkCard stats={null} samples={[]} />)
  expect(screen.queryByText(/B\/s/)).toBeNull()
  expect(screen.getAllByText('—')).toHaveLength(2)
})

it('says downloads wait for the network while offline', () => {
  render(
    <NetworkCard
      stats={{ online: false, downloadRate: 0, uploadRate: 0 }}
      samples={[0, 0]}
    />,
  )
  expect(screen.getByText('Offline')).toBeTruthy()
  expect(screen.getByRole('status').textContent).toContain(
    'resume on their own when this Mac is back online',
  )
  expect(screen.queryByText(/B\/s/)).toBeNull()
})
