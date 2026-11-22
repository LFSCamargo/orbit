import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DISCOVERY_MS, GamepadManager } from '../GamepadManager'

type Frame = () => void

let frames: Frame[] = []
let pads: Array<Gamepad | null> = []
let polls = 0

function pad(pressed: number[] = [], id = 'Xbox Wireless Controller'): Gamepad {
  return {
    id,
    index: 0,
    connected: true,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, index) => ({
      pressed: pressed.includes(index),
      touched: false,
      value: pressed.includes(index) ? 1 : 0,
    })),
  } as unknown as Gamepad
}

/** Runs the frames queued so far (each tick queues the next). */
function runFrame() {
  const pending = frames
  frames = []
  for (const frame of pending) frame()
}

beforeEach(() => {
  frames = []
  pads = []
  polls = 0
  vi.stubGlobal('requestAnimationFrame', (frame: Frame) => {
    frames.push(frame)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames = []
  })
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => {
      polls += 1
      return pads
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

it('does not poll every frame while no controller is connected', () => {
  // Regression: the loop ran getGamepads() every frame for mouse players too.
  const manager = new GamepadManager()
  manager.start()
  expect(frames).toHaveLength(0)

  pads = [pad()]
  window.dispatchEvent(new Event('gamepadconnected'))
  expect(frames).toHaveLength(1)
  runFrame()
  expect(frames).toHaveLength(1)

  pads = []
  window.dispatchEvent(new Event('gamepaddisconnected'))
  runFrame()
  expect(frames).toHaveLength(0)
  manager.stop()
})

it('stands down while suspended and does not replay a held button on resume', () => {
  pads = [pad()]
  const manager = new GamepadManager()
  const actions: string[] = []
  manager.subscribe((action) => actions.push(action))
  manager.start()

  pads = [pad([0])]
  runFrame()
  expect(actions).toEqual(['confirm'])
  pads = [pad()]
  runFrame()

  // A cloud game owns the pad: Orbit stops polling entirely.
  manager.setSuspended(true)
  const before = polls
  runFrame()
  expect(frames).toHaveLength(0)
  expect(polls).toBe(before)

  // A was released and pressed again in the game; it is still held on resume.
  pads = [pad([0])]
  manager.setSuspended(false)
  runFrame()
  runFrame()
  expect(actions).toEqual(['confirm'])

  pads = [pad()]
  runFrame()
  pads = [pad([1])]
  runFrame()
  expect(actions).toEqual(['confirm', 'back'])
  manager.stop()
})

it('reports the controller family only when the connected pad changes', () => {
  pads = [pad()]
  const manager = new GamepadManager()
  const families: string[] = []
  manager.onConnectionChange(() => families.push(manager.getFamily()))
  manager.start()
  runFrame()
  runFrame()
  expect(families).toEqual(['xbox'])

  pads = [pad([], 'DualSense Wireless Controller')]
  runFrame()
  expect(families).toEqual(['xbox', 'playstation'])
  manager.stop()
})

it('finds a pad that WebKit exposes without a gamepadconnected event', () => {
  // Regression: the loop stopped while getGamepads() was empty (before the
  // first press, or while Orbit was inactive) and waited for an event WebKit
  // never sent, so the controller did nothing in Orbit's interface.
  // Only the discovery interval is faked; frames stay on the stub above.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  try {
    const manager = new GamepadManager()
    const actions: string[] = []
    manager.subscribe((action) => actions.push(action))
    manager.start()
    expect(frames).toHaveLength(0)

    pads = [pad()]
    vi.advanceTimersByTime(DISCOVERY_MS)
    expect(frames).toHaveLength(1)
    runFrame()
    pads = [pad([0])]
    runFrame()
    expect(actions).toEqual(['confirm'])

    // The list empties again (Orbit inactive): discovery resumes, no event.
    pads = []
    runFrame()
    expect(frames).toHaveLength(0)
    pads = [pad()]
    vi.advanceTimersByTime(DISCOVERY_MS)
    expect(frames).toHaveLength(1)

    // Once polling, discovery stops; stopping the manager ends both.
    const before = polls
    vi.advanceTimersByTime(DISCOVERY_MS * 4)
    expect(polls).toBe(before)
    manager.stop()
    pads = []
    vi.advanceTimersByTime(DISCOVERY_MS * 4)
    expect(polls).toBe(before)
  } finally {
    vi.useRealTimers()
  }
})

it('keeps reading the pad whatever visibility WebKit reports', () => {
  // The frame loop already sleeps in a hidden window; gating on
  // visibilityState only risked a dead controller.
  pads = [pad()]
  const manager = new GamepadManager()
  const actions: string[] = []
  manager.subscribe((action) => actions.push(action))
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'hidden',
  })
  try {
    manager.start()
    expect(frames).toHaveLength(1)
    runFrame()
    pads = [pad([0])]
    runFrame()
    expect(actions).toEqual(['confirm'])
  } finally {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
    manager.stop()
  }
})
