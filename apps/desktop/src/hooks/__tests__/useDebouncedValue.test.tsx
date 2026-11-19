import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useDebouncedValue } from '../useDebouncedValue'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

it('passes a value on once it has stopped changing for the delay', () => {
  const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 250), {
    initialProps: { value: '' },
  })
  rerender({ value: 'z' })
  act(() => void vi.advanceTimersByTime(200))
  rerender({ value: 'ze' })
  act(() => void vi.advanceTimersByTime(200))
  rerender({ value: 'zel' })
  expect(result.current).toBe('')
  act(() => void vi.advanceTimersByTime(250))
  expect(result.current).toBe('zel')
})

it('applies an empty value at once, so clearing a search is instant', () => {
  const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 250), {
    initialProps: { value: 'halo' },
  })
  rerender({ value: '' })
  expect(result.current).toBe('')
})
