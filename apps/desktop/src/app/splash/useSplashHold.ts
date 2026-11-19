import { useEffect } from 'react'
import { holdSplash } from './splash'

/** Keeps the startup splash up while `loading` is true. */
export function useSplashHold(loading: boolean) {
  useEffect(() => (loading ? holdSplash() : undefined), [loading])
}
