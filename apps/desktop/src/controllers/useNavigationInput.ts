import { useEffect } from 'react'
import { useUiStore } from '@/stores/ui.store'
import { focusManager } from './FocusManager'

/** One root attribute updates rings across pages and portals without rerendering cards. */
export function useNavigationInput() {
  useEffect(() => {
    const root = document.documentElement
    root.dataset.navigationInput = useUiStore.getState().navigationInput
    const unsubscribe = useUiStore.subscribe((state, previous) => {
      if (state.navigationInput !== previous.navigationInput) {
        root.dataset.navigationInput = state.navigationInput
      }
    })
    let pointer: { x: number; y: number } | null = null
    const onPointerMove = (event: PointerEvent) => {
      if (pointer?.x === event.clientX && pointer.y === event.clientY) return
      pointer = { x: event.clientX, y: event.clientY }
      useUiStore.getState().markMouseActivity()
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-focus-id]')
          : null
      const id = target?.dataset.focusId
      if (id && focusManager.getFocusedId() !== id) {
        // Pointer focus must not scroll content out from under an imminent click.
        focusManager.setFocus(id, { scroll: false })
      }
    }
    const onPointerDown = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY }
      useUiStore.getState().markMouseActivity()
    }
    window.addEventListener('pointermove', onPointerMove, true)
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      unsubscribe()
      window.removeEventListener('pointermove', onPointerMove, true)
      window.removeEventListener('pointerdown', onPointerDown, true)
      delete root.dataset.navigationInput
    }
  }, [])
}
