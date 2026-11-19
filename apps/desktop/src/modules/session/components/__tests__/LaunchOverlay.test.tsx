import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { LaunchOverlay, controllerLabel, runtimeChips } from '../LaunchOverlay'
import { launchStepPercent } from '@/lib/launchProgress'
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
const steamControllerSupport = vi.fn().mockResolvedValue('full')
vi.mock('@/lib/tauri', () => ({
  cancelGameLaunch: (...args: unknown[]) => cancelGameLaunch(...args),
  steamControllerSupport: (...args: unknown[]) => steamControllerSupport(...args),
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

it('shows the art, title, what runs it and a percent bar for the current step', async () => {
  useGame.mockReturnValue({
    data: {
      ...game,
      launchConfig: {
        type: 'wine',
        profile: {
          executable: '/g.exe',
          runtimePath: '/wine',
          arguments: [],
          environment: {},
          compatibility: { graphics: 'd3dmetal' },
        },
      },
    } as Game,
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
  expect(screen.getByTestId('launch-art-image')).toHaveAttribute(
    'src',
    'https://cdn.example/icon.png',
  )
  expect(screen.getByRole('heading', { name: 'God of War' })).toBeInTheDocument()
  expect(screen.getByText('Launching game…')).toBeInTheDocument()
  const chips = screen.getByRole('list', { name: 'Runs with' })
  expect(chips).toHaveTextContent('Wine')
  expect(chips).toHaveTextContent('GPTK')
  expect(await screen.findByText('Full controller support')).toBeInTheDocument()
  expect(steamControllerSupport).toHaveBeenCalledWith('1593500')
  // prefix is step 8 of 10, the same as the launch toast.
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '80')
  expect(screen.getByText('80%')).toBeInTheDocument()
  expect(screen.getByTestId('launch-planet')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Cancel launch' }).parentElement).toHaveClass(
    'launch-overlay-close-host',
  )
  expect(screen.getByRole('status')).toHaveTextContent(
    'Preparing the Windows environment…',
  )
})

it('hides controller support Steam does not list', async () => {
  steamControllerSupport.mockResolvedValueOnce('none')
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
  await waitFor(() => expect(steamControllerSupport).toHaveBeenCalled())
  expect(screen.queryByText(/controller support/)).toBeNull()
})

it('names controller support levels, runtimes and progress', () => {
  expect(controllerLabel('full')).toBe('Full controller support')
  expect(controllerLabel('partial')).toBe('Partial controller support')
  expect(controllerLabel('none')).toBeNull()
  expect(controllerLabel(null)).toBeNull()
  expect(runtimeChips(undefined, true).map((chip) => chip.label)).toEqual(['Wine'])
  expect(
    runtimeChips(
      { ...game, platform: 'macos', launchConfig: { type: 'native' } } as never,
      false,
    ).map((chip) => chip.label),
  ).toEqual(['Native'])
  expect(launchStepPercent('resolve')).toBe(10)
  expect(launchStepPercent('spawn')).toBe(100)
  expect(launchStepPercent('running')).toBe(100)
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

it('shows the payload title and Steam art for a synthetic Steam for Windows launch', () => {
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
  expect(screen.getByTestId('launch-art-image')).toHaveAttribute(
    'src',
    'https://cdn.akamai.steamstatic.com/steam/apps/1593500/library_600x900.jpg',
  )
  expect(screen.getByRole('heading', { name: 'God of War' })).toBeInTheDocument()
  expect(screen.getByText('Could not start')).toBeInTheDocument()
  expect(screen.queryByText('Your game')).not.toBeInTheDocument()
})
