import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { focusManager } from '@/controllers/FocusManager'
import { useUiStore } from '@/stores/ui.store'
import { Focusable } from '../Focusable'
import { useNavigationInput } from '@/controllers/useNavigationInput'

afterEach(() => {
  cleanup()
  act(() => {
    focusManager.setFocus(null)
  })
})

it('scales up the focused control unless noScale is set', () => {
  render(
    <>
      <Focusable focusId="scale-on" group="test">
        Scalable
      </Focusable>
      <Focusable focusId="scale-off" group="test" noScale>
        Static
      </Focusable>
    </>,
  )
  act(() => {
    focusManager.setFocus('scale-on')
  })
  expect(screen.getByText('Scalable').closest('button')).toHaveClass(
    'scale-[1.03]',
    'z-10',
  )
  expect(screen.getByText('Static').closest('button')).not.toHaveClass(
    'scale-[1.03]',
    'z-10',
  )
  act(() => {
    focusManager.setFocus('scale-off')
  })
  expect(screen.getByText('Scalable').closest('button')).not.toHaveClass(
    'scale-[1.03]',
    'z-10',
  )
  expect(screen.getByText('Static').closest('button')).not.toHaveClass(
    'scale-[1.03]',
    'z-10',
  )
})

it('does not steal controller focus when scrolling moves a control underneath the pointer', () => {
  function Controls() {
    useNavigationInput()
    return (
      <>
        <Focusable focusId="pad-target" group="test">
          Current
        </Focusable>
        <Focusable focusId="under-pointer" group="test">
          Other
        </Focusable>
      </>
    )
  }
  render(<Controls />)
  act(() => {
    focusManager.setFocus('pad-target')
    useUiStore.getState().markControllerActivity()
  })
  fireEvent.mouseEnter(screen.getByText('Other'))
  expect(focusManager.getFocusedId()).toBe('pad-target')
  expect(useUiStore.getState().navigationInput).toBe('controller')
  fireEvent(
    screen.getByText('Other'),
    new MouseEvent('pointermove', { bubbles: true, clientX: 50, clientY: 40 }),
  )
  expect(focusManager.getFocusedId()).toBe('under-pointer')
  expect(useUiStore.getState().navigationInput).toBe('pointer')
  act(() => {
    focusManager.setFocus('pad-target')
    useUiStore.getState().markControllerActivity()
  })
  fireEvent(
    screen.getByText('Other'),
    new MouseEvent('pointermove', { bubbles: true, clientX: 50, clientY: 40 }),
  )
  expect(focusManager.getFocusedId()).toBe('pad-target')
  expect(useUiStore.getState().navigationInput).toBe('controller')
})
