/**
 * Pads Orbit reads natively on macOS (`platform/macos/native_pads.rs`): every
 * HID pad over Bluetooth or USB through gilrs, and XInput-only USB pads and
 * 2.4 GHz dongles through libusb. Shaped like Gamepad API pads so the
 * GamepadManager reads them like the browser's own.
 */
export interface NativeGamepadPayload {
  id: string
  connected: boolean
  state?: { buttons: boolean[]; axes: number[] }
}

const pads = new Map<string, Gamepad>()

function toGamepad(
  id: string,
  state: NonNullable<NativeGamepadPayload['state']>,
): Gamepad {
  return {
    id,
    index: -1,
    connected: true,
    mapping: 'standard',
    timestamp: performance.now(),
    axes: state.axes,
    buttons: state.buttons.map((pressed) => ({
      pressed,
      touched: pressed,
      value: pressed ? 1 : 0,
    })),
  } as unknown as Gamepad
}

export function applyNativeGamepad(payload: NativeGamepadPayload) {
  if (payload.connected && payload.state)
    pads.set(payload.id, toGamepad(payload.id, payload.state))
  else pads.delete(payload.id)
}

/**
 * Orbit's native pads when it reports any, else the browser's. Native pads
 * cover every controller WebKit lists (and more), so using both would read
 * one controller twice.
 */
export function listPads(): Array<Gamepad | null> {
  if (pads.size > 0) return [...pads.values()]
  return Array.from(navigator.getGamepads?.() ?? [])
}

/** Tests only. */
export function clearNativePads() {
  pads.clear()
}
