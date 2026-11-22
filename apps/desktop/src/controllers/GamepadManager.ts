import {
  actionFromButton,
  detectControllerFamily,
  mappingForFamily,
  type ControllerAction,
  type ControllerFamily,
  type MappedButtons,
} from './ControllerMapping'
import { INITIAL_REPEAT_MS, REPEAT_MS, StickNavigator } from './stickNavigator'

export type GamepadEventHandler = (
  action: ControllerAction,
  event: GamepadActionEvent,
) => void

interface GamepadActionEvent {
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

const SCROLL_DEADZONE = 0.14
const SCROLL_SPEED_PX_PER_MS = 0.55

interface GamepadScrollEvent {
  deltaX: number
  deltaY: number
}

export type GamepadScrollHandler = (event: GamepadScrollEvent) => void

/**
 * How often Orbit looks for a pad while it knows none. WebKit can list no pads
 * (before the first press, while Orbit is inactive) and expose them later
 * without a `gamepadconnected` event, so events alone are not enough.
 */
export const DISCOVERY_MS = 500

/**
 * Polls the Gamepad API and emits normalized controller actions.
 * Supports hold-to-repeat for directional navigation.
 *
 * The frame loop runs only while a pad is connected and nothing suspended it
 * (a cloud game reading the pad itself); with no pad a cheap discovery check
 * runs every `DISCOVERY_MS` instead. A hidden window's frames already sleep.
 * O(buttons) per frame.
 */
export class GamepadManager {
  private rafId: number | null = null
  private discoveryId: number | null = null
  private running = false
  private suspended = false
  /** The next frame records held buttons without emitting them. */
  private priming = false
  private handlers = new Set<GamepadEventHandler>()
  private scrollHandlers = new Set<GamepadScrollHandler>()
  private buttonStates = new Map<string, Map<number, ButtonState>>()
  private sticks = new Map<string, StickNavigator>()
  private lastTickAt = 0
  private family: ControllerFamily = 'generic'
  private mapping: MappedButtons = mappingForFamily('generic')
  private connectedId: string | null = null
  private activityListeners = new Set<() => void>()
  private connectionListeners = new Set<() => void>()

  start() {
    if (this.running) return
    this.running = true
    window.addEventListener('gamepadconnected', this.onConnected)
    window.addEventListener('gamepaddisconnected', this.onDisconnected)
    document.addEventListener('visibilitychange', this.onVisibility)
    this.refreshConnected()
    this.schedule()
  }

  stop() {
    this.running = false
    this.schedule()
    window.removeEventListener('gamepadconnected', this.onConnected)
    window.removeEventListener('gamepaddisconnected', this.onDisconnected)
    document.removeEventListener('visibilitychange', this.onVisibility)
  }

  /** While suspended nothing is polled; on resume held buttons do not fire. */
  setSuspended(suspended: boolean) {
    if (this.suspended === suspended) return
    this.suspended = suspended
    if (!suspended) this.priming = true
    this.schedule()
  }

  subscribe(handler: GamepadEventHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  onScroll(handler: GamepadScrollHandler): () => void {
    this.scrollHandlers.add(handler)
    return () => this.scrollHandlers.delete(handler)
  }

  onActivity(listener: () => void): () => void {
    this.activityListeners.add(listener)
    return () => this.activityListeners.delete(listener)
  }

  /** Fires when the connected pad (and so its family) changes. */
  onConnectionChange(listener: () => void): () => void {
    this.connectionListeners.add(listener)
    return () => this.connectionListeners.delete(listener)
  }

  getFamily() {
    return this.family
  }

  getConnectedId() {
    return this.connectedId
  }

  private onConnected = () => {
    this.refreshConnected()
    this.schedule()
  }

  private onDisconnected = () => {
    this.refreshConnected()
    this.schedule()
  }

  /** Back from hidden: buttons held meanwhile belong to whatever had focus. */
  private onVisibility = () => {
    if (document.visibilityState !== 'hidden') this.priming = true
  }

  private shouldPoll() {
    return this.running && !this.suspended && this.connectedId !== null
  }

  private shouldDiscover() {
    return this.running && !this.suspended && this.connectedId === null
  }

  private discover = () => {
    this.refreshConnected()
    this.schedule()
  }

  /** Starts or stops the frame loop and discovery to match the state. */
  private schedule() {
    if (this.shouldDiscover()) {
      this.discoveryId ??= window.setInterval(this.discover, DISCOVERY_MS)
    } else if (this.discoveryId !== null) {
      window.clearInterval(this.discoveryId)
      this.discoveryId = null
    }
    if (this.shouldPoll()) {
      if (this.rafId === null) {
        this.lastTickAt = 0
        this.rafId = requestAnimationFrame(this.tick)
      }
    } else if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  private refreshConnected() {
    const pads = navigator.getGamepads?.() ?? []
    this.setConnected(pads.find((entry) => entry)?.id ?? null)
  }

  private setConnected(id: string | null) {
    if (this.connectedId === id) return
    this.connectedId = id
    this.family = id ? detectControllerFamily(id) : 'generic'
    this.mapping = mappingForFamily(this.family)
    for (const listener of this.connectionListeners) listener()
  }

  private emitScroll(deltaX: number, deltaY: number) {
    if (deltaX === 0 && deltaY === 0) return
    const event: GamepadScrollEvent = { deltaX, deltaY }
    for (const handler of this.scrollHandlers) {
      handler(event)
    }
    for (const listener of this.activityListeners) {
      listener()
    }
  }

  private emit(action: ControllerAction, repeating: boolean) {
    if (this.priming) return
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
    let states = this.buttonStates.get(padId)
    if (!states) {
      states = new Map()
      this.buttonStates.set(padId, states)
    }
    return states
  }

  private tick = () => {
    this.rafId = null
    if (!this.shouldPoll()) return
    const pads = navigator.getGamepads?.() ?? []
    const now = performance.now()
    const dt = this.lastTickAt > 0 ? Math.min(now - this.lastTickAt, 32) : 16
    this.lastTickAt = now

    let seen: string | null = null
    for (const pad of pads) {
      if (!pad) continue
      seen ??= pad.id
      if (this.connectedId !== pad.id) this.setConnected(pad.id)
      this.readPad(pad, now, dt)
    }
    this.priming = false
    if (seen === null) this.setConnected(null)
    this.schedule()
  }

  private readPad(pad: Gamepad, now: number, dt: number) {
    const states = this.ensureStates(pad.id)

    for (let index = 0; index < pad.buttons.length; index += 1) {
      const button = pad.buttons[index]
      const pressed = button.pressed || button.value > 0.5
      const prev = states.get(index)
      const wasPressed = prev?.pressed ?? false
      if (pressed === wasPressed && !pressed) continue

      const action = actionFromButton(index, this.mapping)
      if (pressed && !wasPressed) {
        if (action) this.emit(action, false)
        states.set(index, { pressed: true, holdStartedAt: now, lastRepeatAt: now })
      } else if (!pressed) {
        states.set(index, { pressed: false, holdStartedAt: null, lastRepeatAt: null })
      } else if (prev && action && isNavigation(action)) {
        const holdStartedAt = prev.holdStartedAt ?? now
        const lastRepeatAt = prev.lastRepeatAt ?? now
        if (now - holdStartedAt >= INITIAL_REPEAT_MS && now - lastRepeatAt >= REPEAT_MS) {
          this.emit(action, true)
          prev.lastRepeatAt = now
        }
      }
    }

    // Left stick: one focus step per flick, then the D-pad's hold-to-repeat.
    let stick = this.sticks.get(pad.id)
    if (!stick) {
      stick = new StickNavigator()
      this.sticks.set(pad.id, stick)
    }
    const step = stick.update(pad.axes[0] ?? 0, pad.axes[1] ?? 0, now)
    if (step) this.emit(step.action, step.repeating)

    if (this.scrollHandlers.size === 0) return
    const scrollX = this.scrollAxisValue(pad.axes[2] ?? 0)
    const scrollY = this.scrollAxisValue(pad.axes[3] ?? 0)
    if (scrollX !== 0 || scrollY !== 0) {
      this.emitScroll(
        scrollX * SCROLL_SPEED_PX_PER_MS * dt,
        scrollY * SCROLL_SPEED_PX_PER_MS * dt,
      )
    }
  }

  private scrollAxisValue(value: number): number {
    const abs = Math.abs(value)
    if (abs < SCROLL_DEADZONE) return 0
    const normalized = (abs - SCROLL_DEADZONE) / (1 - SCROLL_DEADZONE)
    const curved = normalized ** 1.35
    return Math.sign(value) * curved
  }
}

function isNavigation(action: ControllerAction) {
  return (
    action === 'navigate-up' ||
    action === 'navigate-down' ||
    action === 'navigate-left' ||
    action === 'navigate-right'
  )
}

export const gamepadManager = new GamepadManager()
