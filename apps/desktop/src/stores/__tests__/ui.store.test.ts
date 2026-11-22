import { afterEach, expect, it, vi } from 'vitest'
import { useUiStore } from '@/stores/ui.store'

afterEach(() => {
  useUiStore.setState({ cursorHidden: false, navigationInput: 'pointer' })
})

it('changes state only on the first controller input after the pointer', () => {
  // Regression: every press, repeat and 60 Hz stick-scroll frame wrote a new
  // timestamp, re-rendering the whole app while playing with a controller.
  const listener = vi.fn()
  const unsubscribe = useUiStore.subscribe(listener)
  useUiStore.getState().markControllerActivity()
  useUiStore.getState().markControllerActivity()
  useUiStore.getState().markControllerActivity()
  expect(listener).toHaveBeenCalledTimes(1)
  expect(useUiStore.getState()).toMatchObject({
    cursorHidden: true,
    navigationInput: 'controller',
  })

  useUiStore.getState().markMouseActivity()
  useUiStore.getState().markMouseActivity()
  expect(listener).toHaveBeenCalledTimes(2)
  useUiStore.getState().markControllerActivity()
  expect(listener).toHaveBeenCalledTimes(3)
  unsubscribe()
})
