import { snapToCard, springAtRest, stepSpring } from './shelfSpring'

/** Keep the focused shelf card inside the screen, scrolling slowly enough to
 * read at couch distance. Loop rebasing shifts any in-flight animation so the
 * shelf keeps moving forward instead of jumping back. O(1) per focus change.
 * Mouse wheels drive a spring instead, which lands on a card once the wheel stops.
 */

export const SHELF_FOCUS_SCROLL_MS = 640

export function prefersReducedMotion() {
  return (
    typeof matchMedia !== 'undefined' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function focusKeepInViewDelta(
  box: { left: number; right: number; width: number },
  viewportWidth: number,
  clientWidth: number,
) {
  const inset = Math.min(box.width + 22, clientWidth / 3)
  if (box.left < inset) return box.left - inset
  if (box.right > viewportWidth - inset) return box.right - (viewportWidth - inset)
  return 0
}

export function easeOutCubic(t: number) {
  const x = Math.max(0, Math.min(1, t))
  return 1 - (1 - x) ** 3
}

const runningScroll = new WeakMap<object, { from: number; to: number }>()

export function shiftShelfScrollAnimation(
  element: { scrollLeft: number },
  delta: number,
) {
  if (!delta) return
  const wheel = runningWheel.get(element)
  if (wheel) {
    wheel.target += delta
    wheel.position += delta
    wheel.written += delta
  }
  const anim = runningScroll.get(element)
  if (!anim) return
  anim.from += delta
  anim.to += delta
}

export function animateScrollBy(
  element: { scrollLeft: number },
  delta: number,
  options: {
    duration?: number
    reduceMotion?: boolean
    now?: () => number
    frame?: (callback: (time: number) => void) => number
    cancel?: (id: number) => void
  } = {},
) {
  runningScroll.delete(element)
  stopWheelSpring(element)
  if (!delta) return () => {}
  if (options.reduceMotion) {
    element.scrollLeft += delta
    return () => {}
  }
  const duration = options.duration ?? SHELF_FOCUS_SCROLL_MS
  const now = options.now ?? (() => performance.now())
  const frame = options.frame ?? ((callback) => requestAnimationFrame(callback))
  const cancel = options.cancel ?? ((id) => cancelAnimationFrame(id))
  const anim = { from: element.scrollLeft, to: element.scrollLeft + delta }
  runningScroll.set(element, anim)
  const start = now()
  let id = 0
  const step = (time: number) => {
    if (runningScroll.get(element) !== anim) return
    const t = Math.min(1, (time - start) / duration)
    element.scrollLeft = anim.from + (anim.to - anim.from) * easeOutCubic(t)
    if (t < 1) id = frame(step)
    else runningScroll.delete(element)
  }
  id = frame(step)
  return () => {
    if (runningScroll.get(element) === anim) runningScroll.delete(element)
    cancel(id)
  }
}

/** Quiet time after the last wheel event before the spring settles on a card. */
const SHELF_WHEEL_SNAP_MS = 120

type ScrollBox = { scrollLeft: number; scrollWidth: number; clientWidth: number }

interface WheelSpring {
  target: number
  position: number
  velocity: number
  /** Last scrollLeft the spring wrote; any other value means someone else scrolled. */
  written: number
  stride: number
  lastInput: number
  lastFrame: number
  /** Sign of the latest wheel delta; the spring lands on the next card that way. */
  direction: number
  snapped: boolean
  id: number
  cancel: (id: number) => void
}

const runningWheel = new WeakMap<object, WheelSpring>()

/** Where a running wheel spring is heading, if one is running. */
export function wheelScrollTarget(element: object) {
  return runningWheel.get(element)?.target
}

export function stopWheelSpring(element: object) {
  const wheel = runningWheel.get(element)
  if (!wheel) return
  runningWheel.delete(element)
  wheel.cancel(wheel.id)
}

export function springScrollBy(
  element: ScrollBox,
  delta: number,
  options: {
    /** Card width plus gap; the spring lands on a multiple of it. */
    stride: number
    reduceMotion?: boolean
    now?: () => number
    frame?: (callback: (time: number) => void) => number
    cancel?: (id: number) => void
  },
) {
  const max = Math.max(0, element.scrollWidth - element.clientWidth)
  const clamp = (value: number) => Math.min(max, Math.max(0, value))
  if (options.reduceMotion) {
    element.scrollLeft = clamp(element.scrollLeft + delta)
    return
  }
  runningScroll.delete(element)
  const now = options.now ?? (() => performance.now())
  const frame = options.frame ?? ((callback) => requestAnimationFrame(callback))
  let wheel = runningWheel.get(element)
  if (!wheel) {
    const start = now()
    wheel = {
      target: element.scrollLeft,
      position: element.scrollLeft,
      velocity: 0,
      written: element.scrollLeft,
      stride: options.stride,
      lastInput: start,
      lastFrame: start,
      direction: 0,
      snapped: false,
      id: 0,
      cancel: options.cancel ?? ((id) => cancelAnimationFrame(id)),
    }
    const spring = wheel
    runningWheel.set(element, spring)
    const step = () => {
      if (runningWheel.get(element) !== spring) return
      if (Math.abs(element.scrollLeft - spring.written) > 1) {
        runningWheel.delete(element)
        return
      }
      const time = now()
      if (!spring.snapped && time - spring.lastInput >= SHELF_WHEEL_SNAP_MS) {
        spring.target = snapToCard(spring.target, spring.stride, max, spring.direction)
        spring.snapped = true
      }
      const dt = Math.min(0.064, Math.max(0, time - spring.lastFrame) / 1000)
      spring.lastFrame = time
      Object.assign(spring, stepSpring(spring, spring.target, dt))
      if (spring.snapped && springAtRest(spring, spring.target)) {
        element.scrollLeft = spring.target
        runningWheel.delete(element)
        return
      }
      element.scrollLeft = spring.position
      spring.written = element.scrollLeft
      spring.id = frame(step)
    }
    spring.id = frame(step)
  }
  wheel.target = clamp(wheel.target + delta)
  wheel.stride = options.stride
  wheel.lastInput = now()
  wheel.direction = Math.sign(delta)
  wheel.snapped = false
}
