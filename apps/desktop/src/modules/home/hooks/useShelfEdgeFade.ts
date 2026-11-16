import { useLayoutEffect, useState, type RefObject } from 'react'
import { shelfEdgeFade, type ShelfEdgeFade } from '../lib/carouselFade'
import { INFINITE_CAROUSEL_MIN } from './useInfiniteCarousel'

/** Looping shelves always overflow; finite shelves fade only while content is clipped. */
export function useShelfEdgeFade(
  ref: RefObject<HTMLDivElement | null>,
  looping: boolean,
  count = INFINITE_CAROUSEL_MIN,
) {
  const [fade, setFade] = useState<ShelfEdgeFade>(looping ? 'both' : 'none')
  useLayoutEffect(() => {
    const shelf = ref.current
    if (!shelf) return
    const shortStrip = !looping && count < INFINITE_CAROUSEL_MIN
    const update = () => {
      if (shortStrip) {
        setFade('none')
        return
      }
      if (looping) {
        setFade('both')
        return
      }
      setFade(shelfEdgeFade(shelf.scrollLeft, shelf.clientWidth, shelf.scrollWidth))
    }
    update()
    shelf.addEventListener('scroll', update, { passive: true })
    if (typeof ResizeObserver === 'undefined') {
      return () => shelf.removeEventListener('scroll', update)
    }
    const observer = new ResizeObserver(update)
    observer.observe(shelf)
    return () => {
      shelf.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [ref, looping, count])
  return fade
}
