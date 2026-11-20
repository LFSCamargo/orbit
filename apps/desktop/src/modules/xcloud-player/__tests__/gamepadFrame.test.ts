import { expect, it } from 'vitest'
import { frameFromGamepad, sameFrame } from '../gamepadFrame'

function pad(pressed: number[], axes = [0, 0, 0, 0], triggers = [0, 0]) {
  const buttons = Array.from({ length: 17 }, (_, index) => ({
    pressed: pressed.includes(index),
    touched: false,
    value:
      index === 6
        ? triggers[0]
        : index === 7
          ? triggers[1]
          : pressed.includes(index)
            ? 1
            : 0,
  }))
  return { index: 0, mapping: 'standard', buttons, axes } as unknown as Gamepad
}

it('maps the standard Gamepad layout to Xbox buttons, sticks and triggers', () => {
  const frame = frameFromGamepad(
    pad([0, 1, 9, 8, 12, 16, 10], [0.5, -1, 0, 0.25], [0.3, 1]),
    0,
  )
  expect(
    frame.a && frame.b && frame.menu && frame.view && frame.dpadUp && frame.nexus,
  ).toBe(true)
  expect(frame.leftThumb).toBe(true)
  expect(frame.x || frame.y || frame.rightThumb).toBe(false)
  expect(frame.leftStickX).toBe(0.5)
  expect(frame.leftStickY).toBe(-1)
  expect(frame.rightStickY).toBe(0.25)
  expect(frame.leftTrigger).toBeCloseTo(0.3)
  expect(frame.rightTrigger).toBe(1)
})

it('ignores stick drift inside the deadzone', () => {
  const frame = frameFromGamepad(pad([], [0.05, -0.08, 0.02, 0]), 0)
  expect([frame.leftStickX, frame.leftStickY, frame.rightStickX]).toEqual([0, 0, 0])
})

it('only resends a frame when something changed', () => {
  const a = frameFromGamepad(pad([0]), 0)
  expect(sameFrame(a, frameFromGamepad(pad([0]), 0))).toBe(true)
  expect(sameFrame(a, frameFromGamepad(pad([1]), 0))).toBe(false)
})
