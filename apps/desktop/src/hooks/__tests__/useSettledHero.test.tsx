import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { HERO_SETTLE_MS, useSettledHero } from '@/hooks/useSettledHero'
import { useUiStore } from '@/stores/ui.store'

beforeEach(() => {
  vi.useFakeTimers()
  useUiStore.setState({ heroGameId: null })
})

afterEach(() => {
  vi.useRealTimers()
})

it('changes the hero once focus rests, not for every tile passed on the way', () => {
  // Regression: holding the D-pad loaded, decoded and sampled full-size art
  // for every tile focus crossed, dropping frames while navigating.
  const { result } = renderHook(() => useSettledHero())
  act(() => {
    result.current('a')
    vi.advanceTimersByTime(HERO_SETTLE_MS - 1)
    result.current('b')
    vi.advanceTimersByTime(HERO_SETTLE_MS - 1)
    result.current('c')
  })
  expect(useUiStore.getState().heroGameId).toBeNull()
  act(() => vi.advanceTimersByTime(HERO_SETTLE_MS))
  expect(useUiStore.getState().heroGameId).toBe('c')
})

it('drops a pending change when the screen goes away', () => {
  const { result, unmount } = renderHook(() => useSettledHero())
  act(() => result.current('a'))
  unmount()
  act(() => vi.advanceTimersByTime(HERO_SETTLE_MS))
  expect(useUiStore.getState().heroGameId).toBeNull()
})
