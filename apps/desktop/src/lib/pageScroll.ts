import { focusManager } from '@/controllers/FocusManager'

const SCROLL_ROOT_SELECTOR = '.macos-main'
const DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"], [aria-modal="true"]'

/** Scroll container for the active theme shell or the document. */
export function getPageScrollRoot(): HTMLElement {
  return (
    document.querySelector<HTMLElement>(SCROLL_ROOT_SELECTOR) ??
    (document.scrollingElement as HTMLElement | null) ??
    document.documentElement
  )
}

type Axis = 'x' | 'y'

/** True when `element` scrolls on `axis` and still has room toward `delta`. */
function canScroll(element: HTMLElement, axis: Axis, delta: number): boolean {
  const style = window.getComputedStyle(element)
  const overflow = axis === 'y' ? style.overflowY : style.overflowX
  if (!/auto|scroll|overlay/.test(overflow) && !element.matches(SCROLL_ROOT_SELECTOR))
    return false
  const max =
    axis === 'y'
      ? element.scrollHeight - element.clientHeight
      : element.scrollWidth - element.clientWidth
  if (max <= 1) return false
  const position = axis === 'y' ? element.scrollTop : element.scrollLeft
  return delta > 0 ? position < max - 0.5 : position > 0.5
}

/** Where the person is looking: the focused control, else the newest open modal. */
function scrollOrigin(): { start: Element; boundary: Element | null } | null {
  const modals = document.querySelectorAll('[aria-modal="true"]')
  const modal = modals[modals.length - 1] ?? null
  const focused =
    focusManager.getFocusedNode()?.element ??
    (document.activeElement !== document.body ? document.activeElement : null)
  const start = focused?.isConnected ? focused : null
  if (modal && !(start && modal.contains(start))) return { start: modal, boundary: modal }
  if (!start) return null
  return { start, boundary: start.closest(DIALOG_SELECTOR) }
}

/**
 * The innermost container that can move on `axis`, walking out from the focused
 * control. Never leaves an open dialog, so the page behind it stays put.
 * O(depth) per frame.
 */
function scrollTarget(axis: Axis, delta: number): HTMLElement | null {
  const origin = scrollOrigin()
  if (!origin) return getPageScrollRoot()
  for (
    let element: Element | null = origin.start;
    element && element !== document.body;
    element = element.parentElement
  ) {
    if (element instanceof HTMLElement && canScroll(element, axis, delta)) return element
    if (element === origin.boundary) return null
  }
  return getPageScrollRoot()
}

function scrollBy(element: HTMLElement, axis: Axis, delta: number) {
  if (element === document.documentElement || element === document.scrollingElement) {
    window.scrollBy({
      left: axis === 'x' ? delta : 0,
      top: axis === 'y' ? delta : 0,
      behavior: 'instant',
    })
    return
  }
  if (axis === 'y') element.scrollTop += delta
  else element.scrollLeft += delta
}

/** A stick gesture keeps its pane while frames keep coming this close together. */
const GESTURE_GAP_MS = 150

interface Gesture {
  focused: Element | null
  axis: Axis
  forward: boolean
  target: HTMLElement | null
  lastAt: number
}

const gestures: Record<Axis, Gesture | null> = { x: null, y: null }

/** Room left toward `delta`, reading only scroll metrics (no styles). */
function hasRoom(element: HTMLElement, axis: Axis, delta: number) {
  if (element === document.documentElement || element === document.scrollingElement)
    return true
  const max =
    axis === 'y'
      ? element.scrollHeight - element.clientHeight
      : element.scrollWidth - element.clientWidth
  const position = axis === 'y' ? element.scrollTop : element.scrollLeft
  return delta > 0 ? position < max - 0.5 : position > 0.5
}

/**
 * The pane for this frame: the walk in `scrollTarget` runs once per gesture,
 * then later frames (60 Hz) reuse it while focus, direction and room hold.
 * O(1) per frame within a gesture.
 */
function gestureTarget(axis: Axis, delta: number, now: number) {
  const focused = focusManager.getFocusedNode()?.element ?? null
  const forward = delta > 0
  const previous = gestures[axis]
  if (
    previous &&
    now - previous.lastAt < GESTURE_GAP_MS &&
    previous.focused === focused &&
    previous.forward === forward &&
    (!previous.target ||
      (previous.target.isConnected && hasRoom(previous.target, axis, delta)))
  ) {
    previous.lastAt = now
    return previous.target
  }
  const target = scrollTarget(axis, delta)
  gestures[axis] = { focused, axis, forward, target, lastAt: now }
  return target
}

/** Right-stick scroll: moves the pane holding focus, falling back to the page. */
export function applyPageScroll(deltaX: number, deltaY: number) {
  const now = performance.now()
  if (deltaY !== 0) {
    const target = gestureTarget('y', deltaY, now)
    if (target) scrollBy(target, 'y', deltaY)
  }
  if (deltaX !== 0) {
    const target = gestureTarget('x', deltaX, now)
    if (target) scrollBy(target, 'x', deltaX)
  }
}
