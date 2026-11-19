import { useLayoutEffect, type RefObject } from 'react'
import {
  syncLibraryFadeStyles,
  type LibraryFadeChrome,
} from '../lib/libraryViewportFadeDom'

/** O(1) per frame: mask on the compositor, rAF-batched, no React re-renders. */
export function useLibraryViewportFade(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const grid = ref.current
    if (!grid) return

    const scroller = grid.closest('.macos-main')
    const workspace = grid.closest('.library-workspace')
    const footer = document.querySelector('.macos-console-footer')

    let fadeKey = ''
    let frame = 0

    const readChrome = (): LibraryFadeChrome | null => {
      const el = ref.current
      if (!el) return null
      const toolbar = workspace?.querySelector('.library-toolbar') ?? null
      const gridBox = el.getBoundingClientRect()
      const toolbarBox = toolbar?.getBoundingClientRect()
      return {
        topSolid: toolbarBox?.top ?? 0,
        fadeTop: toolbarBox ? Math.max(toolbarBox.height, 1) : 0,
        bottomSolid: footer?.getBoundingClientRect().top ?? innerHeight,
        gridTop: gridBox.top,
        innerHeight,
      }
    }

    const paint = () => {
      frame = 0
      const el = ref.current
      const chrome = readChrome()
      if (!el || !chrome) return
      fadeKey = syncLibraryFadeStyles(el, chrome, fadeKey)
    }

    const schedule = () => {
      if (frame) return
      frame = requestAnimationFrame(paint)
    }

    paint()
    scroller?.addEventListener('scroll', schedule, { passive: true })
    addEventListener('resize', schedule)
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    observer?.observe(grid)
    const toolbar = workspace?.querySelector('.library-toolbar')
    if (toolbar) observer?.observe(toolbar)
    if (footer) observer?.observe(footer)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      scroller?.removeEventListener('scroll', schedule)
      removeEventListener('resize', schedule)
      observer?.disconnect()
      grid.style.webkitMaskImage = ''
      grid.style.maskImage = ''
      grid.style.webkitMaskSize = ''
      grid.style.maskSize = ''
      grid.style.webkitMaskPosition = ''
      grid.style.maskPosition = ''
      grid.style.webkitMaskRepeat = ''
      grid.style.maskRepeat = ''
    }
  }, [ref])
}
