import { useSyncExternalStore } from 'react'

const QUERY =
  '(prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)'

function snapshot() {
  return window.matchMedia?.(QUERY).matches ?? false
}

function subscribe(update: () => void) {
  const media = window.matchMedia?.(QUERY)
  media?.addEventListener?.('change', update)
  return () => media?.removeEventListener?.('change', update)
}

export function useReducedTransparency() {
  return useSyncExternalStore(subscribe, snapshot, () => true)
}
