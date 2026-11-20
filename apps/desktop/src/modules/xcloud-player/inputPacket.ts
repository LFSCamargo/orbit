// xCloud's binary input reports, sent on the `input` data channel.
//
// Header (14 bytes, little-endian): report type flags (u16), sequence (u32),
// timestamp (f64 ms). Then, in order, a metadata section (count + 28-byte
// frames) and a gamepad section (count + 23-byte frames: index, button mask,
// four i16 stick axes with Y up-positive, two u16 triggers, two u32
// physicality flags). Layout matches xbox.com's player.

export const REPORT = {
  metadata: 1,
  gamepad: 2,
  clientMetadata: 8,
  serverMetadata: 16,
  vibration: 128,
} as const

export interface GamepadFrame {
  gamepadIndex: number
  nexus: boolean
  menu: boolean
  view: boolean
  a: boolean
  b: boolean
  x: boolean
  y: boolean
  dpadUp: boolean
  dpadDown: boolean
  dpadLeft: boolean
  dpadRight: boolean
  leftShoulder: boolean
  rightShoulder: boolean
  leftThumb: boolean
  rightThumb: boolean
  /** -1..1, Gamepad API convention (down is positive). */
  leftStickX: number
  leftStickY: number
  rightStickX: number
  rightStickY: number
  /** 0..1 */
  leftTrigger: number
  rightTrigger: number
}

export const NEUTRAL_FRAME: GamepadFrame = {
  gamepadIndex: 0,
  nexus: false,
  menu: false,
  view: false,
  a: false,
  b: false,
  x: false,
  y: false,
  dpadUp: false,
  dpadDown: false,
  dpadLeft: false,
  dpadRight: false,
  leftShoulder: false,
  rightShoulder: false,
  leftThumb: false,
  rightThumb: false,
  leftStickX: 0,
  leftStickY: 0,
  rightStickX: 0,
  rightStickY: 0,
  leftTrigger: 0,
  rightTrigger: 0,
}

/** One rendered video frame's timing, from requestVideoFrameCallback. */
export interface VideoFrameTiming {
  serverDataKey: number
  receivedMs: number
  displayMs: number
}

const HEADER = 14
const METADATA_FRAME = 28
const GAMEPAD_FRAME = 23

const BUTTON_BITS: Array<[keyof GamepadFrame, number]> = [
  ['nexus', 2],
  ['menu', 4],
  ['view', 8],
  ['a', 16],
  ['b', 32],
  ['x', 64],
  ['y', 128],
  ['dpadUp', 256],
  ['dpadDown', 512],
  ['dpadLeft', 1024],
  ['dpadRight', 2048],
  ['leftShoulder', 4096],
  ['rightShoulder', 8192],
  ['leftThumb', 16384],
  ['rightThumb', 32768],
]

function axis(value: number) {
  const scaled = Math.trunc(Math.max(-1, Math.min(1, value)) * 32767)
  return Object.is(scaled, -0) ? 0 : scaled
}

function trigger(value: number) {
  return Math.trunc(Math.max(0, Math.min(1, value)) * 65535)
}

function header(view: DataView, type: number, sequence: number, now: number) {
  view.setUint16(0, type, true)
  view.setUint32(2, sequence >>> 0, true)
  view.setFloat64(6, now, true)
}

/** The first report on the input channel. */
export function clientMetadataPacket(
  sequence: number,
  maxTouchPoints: number,
  now: number,
) {
  const bytes = new Uint8Array(HEADER + 1)
  const view = new DataView(bytes.buffer)
  header(view, REPORT.clientMetadata, sequence, now)
  view.setUint8(HEADER, maxTouchPoints)
  return bytes
}

/** Video timings and gamepad frames in one report. O(frames). */
export function inputPacket(
  sequence: number,
  timings: VideoFrameTiming[],
  frames: GamepadFrame[],
  now: number,
) {
  const metadata = timings.slice(0, 30)
  const gamepads = frames.slice(0, 4)
  let size = HEADER
  let type = 0
  if (metadata.length) {
    type |= REPORT.metadata
    size += 1 + METADATA_FRAME * metadata.length
  }
  if (gamepads.length) {
    type |= REPORT.gamepad
    size += 1 + GAMEPAD_FRAME * gamepads.length
  }
  const bytes = new Uint8Array(size)
  const view = new DataView(bytes.buffer)
  header(view, type, sequence, now)
  let offset = HEADER
  if (metadata.length) {
    view.setUint8(offset++, metadata.length)
    for (const timing of metadata) {
      view.setUint32(offset, timing.serverDataKey >>> 0, true)
      view.setUint32(offset + 4, timing.receivedMs >>> 0, true)
      view.setUint32(offset + 8, timing.receivedMs >>> 0, true)
      view.setUint32(offset + 12, timing.displayMs >>> 0, true)
      view.setUint32(offset + 16, timing.displayMs >>> 0, true)
      view.setUint32(offset + 20, now >>> 0, true)
      view.setUint32(offset + 24, now >>> 0, true)
      offset += METADATA_FRAME
    }
  }
  if (gamepads.length) {
    view.setUint8(offset++, gamepads.length)
    for (const frame of gamepads) {
      view.setUint8(offset, frame.gamepadIndex)
      let mask = 0
      for (const [key, bit] of BUTTON_BITS) if (frame[key]) mask |= bit
      view.setUint16(offset + 1, mask, true)
      view.setInt16(offset + 3, axis(frame.leftStickX), true)
      view.setInt16(offset + 5, axis(-frame.leftStickY), true)
      view.setInt16(offset + 7, axis(frame.rightStickX), true)
      view.setInt16(offset + 9, axis(-frame.rightStickY), true)
      view.setUint16(offset + 11, trigger(frame.leftTrigger), true)
      view.setUint16(offset + 13, trigger(frame.rightTrigger), true)
      view.setUint32(offset + 15, 1, true)
      view.setUint32(offset + 19, 1, false)
      offset += GAMEPAD_FRAME
    }
  }
  return bytes
}
