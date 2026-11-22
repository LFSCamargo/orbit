import { useEffect } from 'react'
import { useUiStore } from '@/stores/ui.store'

/** Hides the cursor while the controller drives Orbit; the mouse brings it back. */
export function useCursorAutoHide() {
  const cursorHidden = useUiStore((s) => s.cursorHidden)

  useEffect(() => {
    document.documentElement.style.cursor = cursorHidden ? 'none' : ''
    document.body.style.cursor = cursorHidden ? 'none' : ''
  }, [cursorHidden])
}
