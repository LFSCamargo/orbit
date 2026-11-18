import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { DownloadProgress } from '../download-progress'
import { ProgressBar } from '../progress-bar'

afterEach(cleanup)

it('fills to the reported percentage and clamps out-of-range values', () => {
  render(<ProgressBar label="Copy" value={140} />)
  const bar = screen.getByRole('progressbar', { name: 'Copy' })
  expect(bar).toHaveAttribute('aria-valuenow', '100')
  expect(bar.firstElementChild).toHaveStyle({ width: '100%' })
})

it('shows a moving indeterminate bar while the size is unknown', () => {
  render(
    <DownloadProgress
      task={{
        key: 'steam:570',
        label: 'Dota 2',
        startedAt: '2026-11-17T00:00:00.000Z',
        progress: {
          phase: 'Installing',
          component: 'Dota 2',
          message: 'Updating SteamCMD',
        },
      }}
    />,
  )
  const bar = screen.getByRole('progressbar', { name: 'Dota 2 progress' })
  expect(bar).not.toHaveAttribute('aria-valuenow')
  expect(bar).toHaveAttribute('data-indeterminate', 'true')
  expect(screen.getByText('Updating SteamCMD · Dota 2…')).toBeTruthy()
})

it('fills with the fire gradient when asked', () => {
  render(<ProgressBar label="Setup" value={40} tone="fire" />)
  const fill = screen.getByRole('progressbar', { name: 'Setup' }).firstElementChild
  expect(fill?.className).toContain('orbit-progress-fire')
})
