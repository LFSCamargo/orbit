import { useCallback, useEffect, useRef } from 'react'
import { useUiStore } from '@/stores/ui.store'

/** Focus must rest this long before the hero (and its full-size art) changes. */
export const HERO_SETTLE_MS = 160

/**
 * A stable `select(id)` that sets the hero once focus stops moving. Holding
 * the D-pad passes many tiles in a second; each hero change loads, decodes
 * and samples full-size art, so only the tile focus rests on pays for it.
 */
export function useSettledHero() {
  const timer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )
  return useCallback((gameId: string) => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      useUiStore.getState().setHeroGameId(gameId)
    }, HERO_SETTLE_MS)
  }, [])
}
