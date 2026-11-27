import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GamepadManager } from '../GamepadManager'
import { applyNativeGamepad, clearNativePads, listPads } from '../nativePads'

const ID =
  '8BitDo Ultimate 2C Wireless Controller (XInput USB Vendor: 2dc8 Product: 310a)'
let frames: Array<() => void> = []

function state(pressed: number[] = []) {
  return {
    buttons: Array.from({ length: 17 }, (_, index) => pressed.includes(index)),
    axes: [0, 0, 0, 0],
  }
}

beforeEach(() => {
  frames = []
  vi.stubGlobal('requestAnimationFrame', (frame: () => void) => frames.push(frame))
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames = []
  })
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => [null],
  })
})

afterEach(() => {
  clearNativePads()
  vi.unstubAllGlobals()
})

it('uses native pads instead of the browser pads, and the browser pads without them', () => {
  // Regression: one controller seen by both WebKit and Orbit fired every
  // press twice; a pad only Orbit sees must still work.
  const browserPad = { id: 'Xbox Wireless Controller', connected: true } as Gamepad
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => [browserPad, null],
  })
  expect(listPads()).toEqual([browserPad, null])
  applyNativeGamepad({ id: ID, connected: true, state: state() })
  expect(listPads().map((pad) => pad?.id)).toEqual([ID])
  applyNativeGamepad({ id: ID, connected: false })
  expect(listPads()).toEqual([browserPad, null])
})

it('navigates menus with a pad only Orbit can read', () => {
  // Regression: the 8BitDo Ultimate 2C 2.4 GHz dongle has no macOS driver, so
  // WebKit listed no pad and menus ignored it once Steam for Mac was closed.
  const manager = new GamepadManager()
  const actions: string[] = []
  manager.subscribe((action) => actions.push(action))
  applyNativeGamepad({ id: ID, connected: true, state: state() })
  manager.start()
  expect(manager.getFamily()).toBe('xbox')
  frames.shift()?.()
  applyNativeGamepad({ id: ID, connected: true, state: state([0, 13]) })
  frames.shift()?.()
  expect(actions).toEqual(['confirm', 'navigate-down'])
  manager.stop()
})
