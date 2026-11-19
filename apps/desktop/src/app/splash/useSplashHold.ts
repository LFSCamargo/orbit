import { useEffect, useSyncExternalStore } from 'react'
import { holdSplash, splashActive, subscribeSplash } from './splash'

/** Keeps the startup splash up while `loading` is true; `untilReleased`
 * (onboarding) is exempt from its safety limit. */
export function useSplashHold(loading: boolean, { untilReleased = false } = {}) {
  useEffect(
    () => (loading ? holdSplash({ untilReleased }) : undefined),
    [loading, untilReleased],
  )
}

/** Whether the startup splash is still up (showing or leaving). */
export function useSplashActive(): boolean {
  return useSyncExternalStore(subscribeSplash, splashActive, () => false)
}
