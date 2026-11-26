'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

/**
 * Start every page at the top. The App Router only scrolls when the new page's
 * first element is out of view, and the fixed sky behind every page made it
 * look visible, so navigating kept the previous scroll position and landed
 * below the new page's hero. Links to an anchor (`/#faq`) keep their target,
 * and Back/Forward keep the browser's restored position.
 */
export function ScrollReset() {
  const pathname = usePathname()
  const fromHistory = useRef(false)
  const first = useRef(true)

  useEffect(() => {
    const onPopState = () => {
      fromHistory.current = true
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (fromHistory.current) {
      fromHistory.current = false
      return
    }
    if (window.location.hash) return
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname])

  return null
}
