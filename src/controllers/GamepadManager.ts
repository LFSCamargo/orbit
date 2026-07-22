import {
  actionFromButton,
  detectControllerFamily,
  mappingForFamily,
  type ControllerAction,
  type ControllerFamily,
  type MappedButtons,
} from './ControllerMapping'

export type GamepadEventHandler = (action: ControllerAction, event: GamepadActionEvent) => void

export interface GamepadActionEvent {
  action: ControllerAction
  family: ControllerFamily
  gamepadId: string
  repeating: boolean
}

interface ButtonState {
  pressed: boolean
  holdStartedAt: number | null
  lastRepeatAt: number | null
}

const DEADZONE = 0.45
const INITIAL_REPEAT_MS = 380
const REPEAT_MS = 140
const AXIS_COOLDOWN_MS = 180

/**
 * Polls the Gamepad API and emits normalized controller actions.
 * Supports hold-to-repeat for directional navigation.
 */
export class GamepadManager {
  private rafId: number | null = null
  private running = false
  private handlers = new Set<GamepadEventHandler>()
  private buttonStates = new Map<string, Map<number, ButtonState>>()
  private axisCooldownUntil = 0
  private family: ControllerFamily = 'generic'
  private mapping: MappedButtons = mappingForFamily('generic')
  private connectedId: string | null = null
  private activityListeners = new Set<() => void>()

  start() {
    if (this.running) return
    this.running = true
    window.addEventListener('gamepadconnected', this.onConnected)
    window.addEventListener('gamepaddisconnected', this.onDisconnected)
    this.refreshConnected()
    this.rafId = requestAnimationFrame(this.tick)
  }

  stop() {
    this.running = false
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    window.removeEventListener('gamepadconnected', this.onConnected)
    window.removeEventListener('gamepaddisconnected', this.onDisconnected)
  }

  subscribe(handler: GamepadEventHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  onActivity(listener: () => void): () => void {
    this.activityListeners.add(listener)
    return () => this.activityListeners.delete(listener)
  }

  getFamily() {
    return this.family
  }

  getConnectedId() {
    return this.connectedId
  }

  private onConnected = () => {
    this.refreshConnected()
  }

  private onDisconnected = () => {
    this.refreshConnected()
  }

  private refreshConnected() {
    const pads = navigator.getGamepads?.() ?? []
    const pad = pads.find((entry) => entry)
    if (!pad) {
      this.connectedId = null
      this.family = 'generic'
      this.mapping = mappingForFamily('generic')
      return
    }
    this.connectedId = pad.id
    this.family = detectControllerFamily(pad.id)
    this.mapping = mappingForFamily(this.family)
  }

  private emit(action: ControllerAction, repeating: boolean) {
    const event: GamepadActionEvent = {
      action,
      family: this.family,
      gamepadId: this.connectedId ?? 'unknown',
      repeating,
    }
    for (const handler of this.handlers) {
      handler(action, event)
    }
    for (const listener of this.activityListeners) {
      listener()
    }
  }

  private ensureStates(padId: string) {
    if (!this.buttonStates.has(padId)) {
      this.buttonStates.set(padId, new Map())
    }
    return this.buttonStates.get(padId)!
  }

  private tick = () => {
    if (!this.running) return
    const pads = navigator.getGamepads?.() ?? []
    const now = performance.now()

    for (const pad of pads) {
      if (!pad) continue
      if (this.connectedId !== pad.id) {
        this.connectedId = pad.id
        this.family = detectControllerFamily(pad.id)
        this.mapping = mappingForFamily(this.family)
      }

      const states = this.ensureStates(pad.id)

      pad.buttons.forEach((button, index) => {
        const pressed = button.pressed || button.value > 0.5
        const prev = states.get(index) ?? {
          pressed: false,
          holdStartedAt: null,
          lastRepeatAt: null,
        }

        const action = actionFromButton(index, this.mapping)
        const isNav =
          action === 'navigate-up' ||
          action === 'navigate-down' ||
          action === 'navigate-left' ||
          action === 'navigate-right'

        if (pressed && !prev.pressed) {
          if (action) this.emit(action, false)
          states.set(index, {
            pressed: true,
            holdStartedAt: now,
            lastRepeatAt: now,
          })
        } else if (pressed && prev.pressed && isNav && action) {
          const holdStartedAt = prev.holdStartedAt ?? now
          const lastRepeatAt = prev.lastRepeatAt ?? now
          const heldFor = now - holdStartedAt
          const sinceRepeat = now - lastRepeatAt
          if (heldFor >= INITIAL_REPEAT_MS && sinceRepeat >= REPEAT_MS) {
            this.emit(action, true)
            states.set(index, {
              pressed: true,
              holdStartedAt,
              lastRepeatAt: now,
            })
          }
        } else if (!pressed && prev.pressed) {
          states.set(index, {
            pressed: false,
            holdStartedAt: null,
            lastRepeatAt: null,
          })
        } else if (!states.has(index)) {
          states.set(index, prev)
        }
      })

      if (now >= this.axisCooldownUntil) {
        const axisAction = this.axisToAction(pad.axes[0] ?? 0, pad.axes[1] ?? 0)
        if (axisAction) {
          this.emit(axisAction, false)
          this.axisCooldownUntil = now + AXIS_COOLDOWN_MS
        }
      }
    }

    this.rafId = requestAnimationFrame(this.tick)
  }

  private axisToAction(x: number, y: number): ControllerAction | null {
    if (Math.abs(x) < DEADZONE && Math.abs(y) < DEADZONE) return null
    if (Math.abs(x) > Math.abs(y)) {
      return x > 0 ? 'navigate-right' : 'navigate-left'
    }
    return y > 0 ? 'navigate-down' : 'navigate-up'
  }
}

export const gamepadManager = new GamepadManager()
