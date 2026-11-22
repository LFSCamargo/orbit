import { NEUTRAL_FRAME, type GamepadFrame } from './inputPacket'

const STICK_DEADZONE = 0.1

function stick(value: number | undefined) {
  const v = value ?? 0
  return Math.abs(v) < STICK_DEADZONE ? 0 : v
}

/** A standard-mapping Gamepad (W3C layout) as an Xbox frame. O(1). */
export function frameFromGamepad(pad: Gamepad, gamepadIndex: number): GamepadFrame {
  const pressed = (index: number) => Boolean(pad.buttons[index]?.pressed)
  const value = (index: number) => pad.buttons[index]?.value ?? 0
  return {
    ...NEUTRAL_FRAME,
    gamepadIndex,
    a: pressed(0),
    b: pressed(1),
    x: pressed(2),
    y: pressed(3),
    leftShoulder: pressed(4),
    rightShoulder: pressed(5),
    leftTrigger: value(6),
    rightTrigger: value(7),
    view: pressed(8),
    menu: pressed(9),
    leftThumb: pressed(10),
    rightThumb: pressed(11),
    dpadUp: pressed(12),
    dpadDown: pressed(13),
    dpadLeft: pressed(14),
    dpadRight: pressed(15),
    nexus: pressed(16),
    leftStickX: stick(pad.axes[0]),
    leftStickY: stick(pad.axes[1]),
    rightStickX: stick(pad.axes[2]),
    rightStickY: stick(pad.axes[3]),
  }
}

const FRAME_KEYS = Object.keys(NEUTRAL_FRAME) as Array<keyof GamepadFrame>

/** Compared every input tick (60 Hz): one fixed key list, no allocation. */
export function sameFrame(a: GamepadFrame, b: GamepadFrame) {
  for (const key of FRAME_KEYS) if (a[key] !== b[key]) return false
  return true
}
