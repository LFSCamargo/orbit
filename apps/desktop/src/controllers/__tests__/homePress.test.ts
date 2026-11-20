import { afterEach, expect, it, vi } from 'vitest'
import { useUiStore } from '@/stores/ui.store'
import { handleHomePress } from '../useController'

vi.mock('@/lib/tauri', () => ({
  isTauriRuntime: () => false,
  showOrbitWindow: vi.fn(),
}))

afterEach(() => {
  vi.useRealTimers()
  useUiStore.setState({ homeMenuOpen: false })
})

it('one Home press seen twice (native and in-page) keeps the menu open', async () => {
  vi.useFakeTimers()
  await handleHomePress(true)
  expect(useUiStore.getState().homeMenuOpen).toBe(true)
  vi.advanceTimersByTime(100)
  await handleHomePress(true)
  expect(useUiStore.getState().homeMenuOpen).toBe(true)
})

it('a later Home press still closes the menu', async () => {
  vi.useFakeTimers()
  await handleHomePress(true)
  vi.advanceTimersByTime(1000)
  await handleHomePress(true)
  expect(useUiStore.getState().homeMenuOpen).toBe(false)
})
