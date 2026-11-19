import { useEffect, type RefObject } from 'react'
import {
  prefersReducedMotion,
  springScrollBy,
  stopWheelSpring,
  wheelScrollTarget,
} from '../lib/shelfScroll'
import { shelfWheelDelta } from '../lib/shelfWheel'

/** Lets a vertical mouse wheel scroll the horizontal shelf on a spring that
 * lands on a card; horizontal wheels stay native. Non-passive so the page does
 * not also scroll.
 */
export function useShelfWheel(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const shelf = ref.current
    if (!shelf) return
    const onWheel = (event: WheelEvent) => {
      const delta = shelfWheelDelta(event, {
        scrollLeft: wheelScrollTarget(shelf) ?? shelf.scrollLeft,
        clientWidth: shelf.clientWidth,
        scrollWidth: shelf.scrollWidth,
      })
      if (!delta) return
      event.preventDefault()
      springScrollBy(shelf, delta, {
        stride: cardStride(shelf),
        reduceMotion: prefersReducedMotion(),
      })
    }
    shelf.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      shelf.removeEventListener('wheel', onWheel)
      stopWheelSpring(shelf)
    }
  }, [ref])
}

function cardStride(shelf: HTMLElement) {
  const card = shelf.querySelector<HTMLElement>('[data-loop-copy]')
  if (!card) return 0
  return card.offsetWidth + (parseFloat(getComputedStyle(shelf).columnGap) || 0)
}
