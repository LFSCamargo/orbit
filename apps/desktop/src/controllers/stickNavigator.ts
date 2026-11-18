import type { ControllerAction } from './ControllerMapping'

/** Past this deflection the stick moves focus. */
const ENGAGE = 0.5
/** Below this the stick counts as released (hysteresis against wobble). */
const RELEASE = 0.32
/** Same hold timing as the D-pad, so both feel identical. */
export const INITIAL_REPEAT_MS = 380
export const REPEAT_MS = 140

type Direction = Extract<
  ControllerAction,
  'navigate-up' | 'navigate-down' | 'navigate-left' | 'navigate-right'
>

function direction(x: number, y: number): Direction {
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'navigate-right' : 'navigate-left'
  return y > 0 ? 'navigate-down' : 'navigate-up'
}

/**
 * Turns a left-stick position into D-pad steps: one step per flick, then
 * hold-to-repeat after the D-pad's delay. O(1) per frame.
 */
export class StickNavigator {
  private held: Direction | null = null
  private heldSince = 0
  private lastStep = 0

  update(
    x: number,
    y: number,
    now: number,
  ): { action: Direction; repeating: boolean } | null {
    const magnitude = Math.max(Math.abs(x), Math.abs(y))
    if (this.held === null) {
      if (magnitude < ENGAGE) return null
      return this.press(direction(x, y), now)
    }
    if (magnitude < RELEASE) {
      this.held = null
      return null
    }
    const next = direction(x, y)
    if (next !== this.held && magnitude >= ENGAGE) return this.press(next, now)
    if (now - this.heldSince >= INITIAL_REPEAT_MS && now - this.lastStep >= REPEAT_MS) {
      this.lastStep = now
      return { action: this.held, repeating: true }
    }
    return null
  }

  private press(next: Direction, now: number) {
    this.held = next
    this.heldSince = now
    this.lastStep = now
    return { action: next, repeating: false }
  }
}
