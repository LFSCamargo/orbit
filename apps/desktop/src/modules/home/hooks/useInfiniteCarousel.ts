import { useLayoutEffect, useMemo, useState, type RefObject } from 'react'
import { focusManager } from '@/controllers/FocusManager'
import { shiftShelfScrollAnimation } from '../lib/shelfScroll'
import type { LibraryEntry } from '@/types/library'

/** Three bounded copies recenter native scrolling by a full cycle. Repeated
 * cycles fill wide windows; shelves with seven or fewer games stay a finite strip.
 */

export const INFINITE_CAROUSEL_MIN = 8

export function shouldLoopCarousel(count: number) {
  return count >= INFINITE_CAROUSEL_MIN
}

export function useInfiniteCarousel(
  ref: RefObject<HTMLDivElement | null>,
  entries: LibraryEntry[],
) {
  const [repeats, setRepeats] = useState(1)
  const looping = shouldLoopCarousel(entries.length)
  const cards = useMemo(() => {
    const copies = looping ? repeats * 3 : 1
    return Array.from({ length: copies }, (_, copy) =>
      entries.map((entry) => ({
        entry,
        copy,
        focusId:
          !looping || copy === repeats
            ? `macos-game-${entry.id}`
            : `macos-game-${entry.id}-loop-${copy}`,
      })),
    ).flat()
  }, [entries, looping, repeats])

  useLayoutEffect(() => {
    const shelf = ref.current
    if (!shelf) return
    if (!looping) {
      shelf.scrollLeft = 0
      return
    }
    if (typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const first = shelf.querySelector<HTMLElement>('[data-loop-copy]')
      if (!first) return
      const gap = parseFloat(getComputedStyle(shelf).columnGap) || 0
      const stride = first.offsetWidth + gap
      if (stride)
        setRepeats(
          Math.max(
            1,
            Math.ceil((shelf.clientWidth + stride) / (entries.length * stride)),
          ),
        )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(shelf)
    return () => observer.disconnect()
  }, [ref, looping, entries.length])

  useLayoutEffect(() => {
    const shelf = ref.current
    if (!shelf || !looping) return
    const nodes = Array.from(shelf.querySelectorAll<HTMLElement>('[data-loop-copy]'))
    const first = nodes[0]
    const middle = nodes.find((node) => Number(node.dataset.loopCopy) === repeats)
    if (!first || !middle) return
    const cycleWidth = middle.offsetLeft - first.offsetLeft
    if (!cycleWidth) return
    shelf.scrollLeft = cycleWidth
    const recenter = () => {
      const current = shelf.scrollLeft
      if (current >= cycleWidth && current < 2 * cycleWidth) return
      const normalized =
        cycleWidth + ((((current - cycleWidth) % cycleWidth) + cycleWidth) % cycleWidth)
      const shiftAmount = normalized - current
      shiftShelfScrollAnimation(shelf, shiftAmount)
      const shift = Math.round(shiftAmount / cycleWidth) * repeats
      const focused = focusManager.getFocusedNode()?.element
      const target =
        focused && shelf.contains(focused)
          ? nodes.find(
              (node) =>
                Number(node.dataset.loopCopy) ===
                  Number(focused.dataset.loopCopy) + shift &&
                node.dataset.loopEntry === focused.dataset.loopEntry,
            )
          : undefined
      shelf.scrollLeft = normalized
      if (target?.dataset.focusId) {
        const nativeFocus = document.activeElement === focused
        target.dataset.loopRebased = 'true'
        focusManager.setFocus(target.dataset.focusId, { scroll: false })
        if (nativeFocus) target.focus({ preventScroll: true })
      }
    }
    shelf.addEventListener('scroll', recenter, { passive: true })
    return () => shelf.removeEventListener('scroll', recenter)
  }, [ref, cards, looping, repeats])
  return cards
}
