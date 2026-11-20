import { expect, it } from 'vitest'
import {
  clientMetadataPacket,
  inputPacket,
  NEUTRAL_FRAME,
  type GamepadFrame,
} from '../inputPacket'

it('opens the input channel with a 15-byte client metadata report', () => {
  const view = new DataView(clientMetadataPacket(0, 1, 0).buffer)
  expect(view.byteLength).toBe(15)
  expect(view.getUint16(0, true)).toBe(8) // ClientMetadata
  expect(view.getUint32(2, true)).toBe(0)
  expect(view.getUint8(14)).toBe(1) // max touch points
})

it('encodes a gamepad report the way xCloud reads it', () => {
  const frame: GamepadFrame = {
    ...NEUTRAL_FRAME,
    gamepadIndex: 0,
    a: true,
    menu: true,
    dpadUp: true,
    leftShoulder: true,
    leftStickX: 1,
    leftStickY: 1, // Gamepad API: pushed down
    rightStickX: -0.5,
    rightStickY: 0,
    leftTrigger: 0.5,
    rightTrigger: 2,
  }
  const view = new DataView(inputPacket(7, [], [frame], 0).buffer)
  expect(view.getUint16(0, true)).toBe(2) // Gamepad
  expect(view.getUint32(2, true)).toBe(7)
  expect(view.getUint8(14)).toBe(1) // one frame
  expect(view.getUint8(15)).toBe(0) // gamepad index
  expect(view.getUint16(16, true)).toBe(4 | 16 | 256 | 4096)
  expect(view.getInt16(18, true)).toBe(32767)
  expect(view.getInt16(20, true)).toBe(-32767) // Xbox Y is up-positive
  expect(view.getInt16(22, true)).toBe(-16383)
  expect(view.getInt16(24, true)).toBe(0)
  expect(view.getUint16(26, true)).toBe(32767)
  expect(view.getUint16(28, true)).toBe(65535) // clamped
  expect(view.getUint32(30, true)).toBe(1)
  expect(view.getUint32(34, false)).toBe(1)
  expect(view.byteLength).toBe(14 + 1 + 23)
})

it('puts video frame metadata before gamepad reports', () => {
  const view = new DataView(
    inputPacket(
      1,
      [{ serverDataKey: 42, receivedMs: 10, displayMs: 20 }],
      [NEUTRAL_FRAME],
      99,
    ).buffer,
  )
  expect(view.getUint16(0, true)).toBe(1 | 2)
  expect(view.getUint8(14)).toBe(1)
  expect(view.getUint32(15, true)).toBe(42)
  expect(view.getUint32(19, true)).toBe(10)
  expect(view.getUint32(27, true)).toBe(20)
  expect(view.getUint8(15 + 28)).toBe(1) // then one gamepad frame
})
