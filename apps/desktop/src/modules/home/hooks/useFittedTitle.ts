import { useLayoutEffect, useRef } from 'react'

/** Measure at the viewport-relative preferred size; shrink only when needed. */
export function useFittedTitle(title: string) {
  const ref = useRef<HTMLHeadingElement>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    let disposed = false
    const fit = () => {
      if (disposed) return
      element.style.fontSize = 'max(36px, 4.2vw)'
      const preferred = parseFloat(getComputedStyle(element).fontSize)
      if (!element.clientWidth || element.scrollWidth <= element.clientWidth) return
      // Font hinting and kerning are not perfectly proportional: bounded search
      // measures the actual rendered overflow rather than estimating a ratio.
      let low = 0
      let high = preferred
      for (let step = 0; step < 12; step++) {
        const size = (low + high) / 2
        element.style.fontSize = `${size}px`
        if (element.scrollWidth <= element.clientWidth) low = size
        else high = size
      }
      element.style.fontSize = `${low}px`
    }
    fit()
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null
    if (element.parentElement) observer?.observe(element.parentElement)
    window.addEventListener('resize', fit)
    void document.fonts?.ready.then(fit)
    return () => {
      disposed = true
      observer?.disconnect()
      window.removeEventListener('resize', fit)
    }
  }, [title])
  return ref
}
