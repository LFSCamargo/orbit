/** Keep the focused shelf card inside the screen, scrolling slowly enough to
 * read at couch distance. Loop rebasing shifts any in-flight animation so the
 * shelf keeps moving forward instead of jumping back. O(1) per focus change.
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
