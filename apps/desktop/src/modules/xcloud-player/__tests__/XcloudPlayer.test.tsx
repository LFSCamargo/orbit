import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useXcloudPlayerStore } from '@/stores/xcloudPlayer.store'
import { useUiStore } from '@/stores/ui.store'
import { XcloudPlayer } from '../XcloudPlayer'
import { runStream } from '../runStream'
import { NEUTRAL_FRAME, type GamepadFrame } from '../inputPacket'

const peerEvents: { onFrame?: (frame: GamepadFrame) => void } = {}
vi.mock('../xcloudPeer', () => ({
  createXcloudPeer: (
    _video: unknown,
    events: { onFrame?: (frame: GamepadFrame) => void },
  ) => {
    peerEvents.onFrame = events.onFrame
    return { close: vi.fn(), setPaused: vi.fn() }
  },
}))
vi.mock('../runStream', () => ({ runStream: vi.fn() }))
vi.mock('@/hooks/useFullscreen', () => ({ requestFullscreen: vi.fn() }))

beforeEach(() => {
  useXcloudPlayerStore.setState({
    stream: { productId: '9NBLGGH4R315', title: 'Dead Space' },
  })
})

afterEach(() => {
  cleanup()
  useXcloudPlayerStore.setState({ stream: null, paused: false })
  useUiStore.setState({ homeMenuOpen: false })
})

it('shows the queue while Xbox Cloud Gaming finds a server', async () => {
  vi.mocked(runStream).mockImplementation(({ onStatus }) => {
    onStatus('queued')
    return new Promise(() => undefined)
  })
  render(<XcloudPlayer />)
  expect(await screen.findByText('Dead Space')).toBeTruthy()
  expect(screen.getByText(/Waiting in line/)).toBeTruthy()
  expect(screen.getByRole('dialog', { name: 'Dead Space' })).toBeTruthy()
})

it('shows why a stream failed and closes on request', async () => {
  vi.mocked(runStream).mockRejectedValue(new Error('No servers'))
  render(<XcloudPlayer />)
  expect(await screen.findByRole('alert')).toHaveTextContent('No servers')
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(useXcloudPlayerStore.getState().stream).toBeNull()
})

it('pauses the stream into the Home menu on Escape instead of stopping it', async () => {
  const stop = vi.fn()
  vi.mocked(runStream).mockImplementation(async ({ onStatus }) => {
    onStatus('playing')
    return stop
  })
  render(<XcloudPlayer />)
  await act(async () => undefined)
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(useXcloudPlayerStore.getState()).toMatchObject({ paused: true })
  expect(useXcloudPlayerStore.getState().stream).not.toBeNull()
  expect(useUiStore.getState().homeMenuOpen).toBe(true)
  expect(stop).not.toHaveBeenCalled()
})

it('pauses when the Home menu opens and hides and mutes the paused stream', async () => {
  vi.mocked(runStream).mockImplementation(async ({ onStatus }) => {
    onStatus('playing')
    return () => undefined
  })
  render(<XcloudPlayer />)
  await act(async () => undefined)
  act(() => useUiStore.getState().openHomeMenu())
  expect(useXcloudPlayerStore.getState().paused).toBe(true)
  const player = document.querySelector('[role="dialog"][aria-label="Dead Space"]')
  expect(player).toHaveAttribute('hidden')
  expect(
    screen.getByLabelText('Dead Space stream', { selector: 'video' }),
  ).toHaveProperty('muted', true)
  act(() => useXcloudPlayerStore.getState().resume())
  expect(player).not.toHaveAttribute('hidden')
})

it('opens the menu from the controller guide button the game never sees', async () => {
  // Regression: the native Home listener does not know every pad (8BitDo
  // Ultimate 2 over Bluetooth), so Home did nothing in a stream.
  vi.mocked(runStream).mockImplementation(async ({ onStatus }) => {
    onStatus('playing')
    return () => undefined
  })
  render(<XcloudPlayer />)
  await act(async () => undefined)
  act(() => peerEvents.onFrame?.({ ...NEUTRAL_FRAME, nexus: true }))
  expect(useXcloudPlayerStore.getState().paused).toBe(true)
  expect(useUiStore.getState().homeMenuOpen).toBe(true)
  // Holding it does not toggle the menu again.
  act(() => peerEvents.onFrame?.({ ...NEUTRAL_FRAME, nexus: true }))
  expect(useUiStore.getState().homeMenuOpen).toBe(true)
})
