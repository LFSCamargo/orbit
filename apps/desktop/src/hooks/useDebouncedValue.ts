import { useEffect, useState } from 'react'

/** `value` once it has stopped changing for `delayMs`. An empty value applies
 * at once, so clearing (a search, for instance) never waits. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value)
  const immediate = value === '' || value === null || value === undefined
  useEffect(() => {
    if (immediate) return
    const timer = window.setTimeout(() => setSettled(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs, immediate])
  return immediate ? value : settled
}
