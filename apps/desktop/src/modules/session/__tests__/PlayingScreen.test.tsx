import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { PlayingScreen } from '../PlayingScreen'

afterEach(cleanup)

it('renders the current Orbit app icon in the session header', () => {
  const { container } = render(
    <QueryClientProvider client={new QueryClient()}>
      <PlayingScreen
        session={{
          id: 'session-1',
          gameId: 'game-1',
          provider: 'steam',
          startedAt: '2026-11-25T12:00:00Z',
          durationSeconds: 0,
        }}
        family="xbox"
      />
    </QueryClientProvider>,
  )
  const brandImg = container.querySelector('.session-brand img')
  expect(brandImg).toHaveAttribute('src', expect.stringContaining('app-icon'))
  expect(brandImg?.getAttribute('src')).not.toContain('orbit.svg')
})
