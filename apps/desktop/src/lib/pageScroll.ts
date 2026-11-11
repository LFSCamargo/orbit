const SCROLL_ROOT_SELECTOR = '.macos-main'

/** Scroll container for the active theme shell or the document. */
export function getPageScrollRoot(): HTMLElement {
  return (
    document.querySelector<HTMLElement>(SCROLL_ROOT_SELECTOR) ??
    (document.scrollingElement as HTMLElement | null) ??
    document.documentElement
  )
}

export function applyPageScroll(deltaX: number, deltaY: number) {
  if (deltaX === 0 && deltaY === 0) return

  const root = getPageScrollRoot()
  if (root.matches(SCROLL_ROOT_SELECTOR)) {
    root.scrollTop += deltaY
    root.scrollLeft += deltaX
    return
  }

  window.scrollBy({ left: deltaX, top: deltaY, behavior: 'instant' })
}
