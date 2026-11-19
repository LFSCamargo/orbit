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

/** Right-stick scroll: moves the pane holding focus, falling back to the page. */
export function applyPageScroll(deltaX: number, deltaY: number) {
  if (deltaY !== 0) {
    const target = scrollTarget('y', deltaY)
    if (target) scrollBy(target, 'y', deltaY)
  }
  if (deltaX !== 0) {
    const target = scrollTarget('x', deltaX)
    if (target) scrollBy(target, 'x', deltaX)
  }
}
