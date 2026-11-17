import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { LaunchOverlay } from '../LaunchOverlay'
import { useLaunchProgress } from '@/hooks/useLaunchProgress'
import { useLaunchStore } from '@/stores/launch.store'
import type { Game } from '@/types/game'

const callbacks = vi.hoisted(
  () => new Map<string, (event: { payload: unknown }) => void>(),
)
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, callback: (event: { payload: unknown }) => void) => {
    callbacks.set(name, callback)
    return () => callbacks.delete(name)
  }),
}))

function ConnectedOverlay() {
  useLaunchProgress()
  return <LaunchOverlay />
}

const game: Game = {
  id: 'g1',
  title: 'God of War',
  sortTitle: 'god of war',
  provider: 'steam',
  platform: 'windows',
  sourceId: '1593500',
  launchConfig: {
    type: 'wine',
    profile: {
      executable: '/g.exe',
      runtimePath: '/wine',
      arguments: [],
      environment: {},
    },
  },
  artwork: {
    logo: 'https://cdn.example/logo.png',
    cover: 'https://cdn.example/cover.png',
    icon: 'https://cdn.example/icon.png',
    hero: 'https://cdn.example/hero.jpg',
  },
  favorite: false,
  hidden: false,
  dateAdded: '2026-01-01T00:00:00Z',
  totalPlaytimeSeconds: 0,
  achievements: [],
}

const useGame = vi.fn(() => ({ data: game }))
vi.mock('@/hooks/useGames', () => ({
  useGame: () => useGame(),
}))

const cancelGameLaunch = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/tauri', () => ({
  cancelGameLaunch: (...args: unknown[]) => cancelGameLaunch(...args),
}))

function wrap(node: ReactNode) {
  const client = new QueryClient()
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>
}

afterEach(() => {
  cleanup()
  useLaunchStore.getState().clear()
  cancelGameLaunch.mockClear()
  useGame.mockReturnValue({ data: game })
})

it('shows a landscape banner with hero art, logo, and the current caption', () => {
  useLaunchStore.setState({
    launch: {
      gameId: 'g1',
      step: 'prefix',
      message: 'Preparing the Windows environment',
      index: 2,
      total: 6,
      failed: false,
    },
  })
  render(wrap(<LaunchOverlay />))
  expect(screen.getByRole('img', { name: 'God of War' })).toHaveAttribute(
    'src',
    'https://cdn.example/logo.png',
  )
  expect(screen.getByTestId('launch-hero')).toHaveStyle({
    backgroundImage: 'url("https://cdn.example/hero.jpg")',
  })
  const banner = screen.getByTestId('launch-banner')
  expect(banner.className).not.toMatch(/\bborder\b/)
  expect(screen.getByRole('button', { name: 'Cancel launch' }).parentElement).toHaveClass(
    'launch-overlay-close-host',
  )
  expect(screen.getByText('Orbit')).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent(
    'Preparing the Windows environment…',
  )
  expect(screen.queryByText('Checking Steam for Windows')).not.toBeInTheDocument()
  expect(screen.queryByText('Finding the Windows install')).not.toBeInTheDocument()
})

it('shows the title when the logo fails to load', () => {
  // Regression: The Expendabros has no Steam logo.png, so the banner showed
  // a broken image instead of the game's name.
  useLaunchStore.setState({
    launch: {
      gameId: 'g1',
      step: 'prefix',
      message: 'Preparing the Windows environment',
      index: 2,
      total: 6,
      failed: false,
    },
  })
  render(wrap(<LaunchOverlay />))
  fireEvent.error(screen.getByRole('img', { name: 'God of War' }))
  expect(screen.queryByRole('img', { name: 'God of War' })).toBeNull()
  expect(screen.getByRole('heading', { name: 'God of War' })).toBeInTheDocument()
})

it('uses the Steam horizontal logo when the stored logo slot is empty', () => {
  useGame.mockReturnValue({
    data: { ...game, artwork: { hero: 'https://cdn.example/hero.jpg' } },
  })
  useLaunchStore.setState({
    launch: {
      gameId: 'g1',
      step: 'prefix',
      message: 'Preparing the Windows environment',
      index: 2,
      total: 6,
      failed: false,
    },
  })
  render(wrap(<LaunchOverlay />))
  expect(screen.getByRole('img', { name: 'God of War' })).toHaveAttribute(
    'src',
    'https://cdn.akamai.steamstatic.com/steam/apps/1593500/logo.png',
  )
  expect(screen.queryByRole('heading', { name: 'God of War' })).not.toBeInTheDocument()
})

it('keeps the failed caption on the banner and lets the user dismiss', () => {
  useLaunchStore.setState({
    launch: {
      gameId: 'g1',
      step: 'prefix',
      message: 'Wine environment setup failed',
      index: 2,
      total: 6,
      failed: true,
    },
  })
  render(wrap(<LaunchOverlay />))
  expect(screen.getByRole('alert')).toHaveTextContent('Wine environment setup failed')
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  expect(useLaunchStore.getState().launch).toBeNull()
})

it('cancels an in-flight launch from the banner close control', () => {
  useLaunchStore.setState({
    launch: {
      gameId: 'g1',
      step: 'runtime',
      message: 'Checking Steam for Windows',
      index: 1,
      total: 6,
      failed: false,
    },
  })
  render(wrap(<LaunchOverlay />))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel launch' }))
  expect(cancelGameLaunch).toHaveBeenCalledOnce()
})

it('shows a dismissible error after the game closes during startup', async () => {
  useLaunchStore.getState().begin('g1')
  const view = render(wrap(<ConnectedOverlay />))
  await waitFor(() => expect(callbacks.has('game-session-ended')).toBe(true))
  act(() => callbacks.get('game-session-started')?.({ payload: { gameId: 'g1' } }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  act(() =>
    callbacks.get('game-session-ended')?.({
      payload: { gameId: 'g1', exitCode: 53, stopReason: 'process-exited' },
    }),
  )
  expect(screen.getByRole('alert')).toHaveTextContent('Steam was not ready')
  expect(useLaunchStore.getState().launch?.failed).toBe(true)
  view.unmount()
  render(wrap(<ConnectedOverlay />))
  expect(screen.getByRole('alert')).toHaveTextContent('Steam was not ready')
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(useLaunchStore.getState().launch).toBeNull()
})

it('shows the payload title and Steam logo for a synthetic Steam for Windows launch', () => {
  useGame.mockReturnValue({ data: undefined as unknown as Game })
  useLaunchStore.setState({
    launch: {
      gameId: 'steam-windows:1593500',
      step: 'resolve',
      message: 'Download the game before playing',
      index: 0,
      total: 7,
      failed: true,
      title: 'God of War',
    },
  })
  render(wrap(<LaunchOverlay />))
  expect(screen.getByRole('img', { name: 'God of War' })).toHaveAttribute(
    'src',
    'https://cdn.akamai.steamstatic.com/steam/apps/1593500/logo.png',
  )
  expect(screen.queryByText('Your game')).not.toBeInTheDocument()
})
