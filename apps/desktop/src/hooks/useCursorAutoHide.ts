import { useEffect } from 'react'
import { useUiStore } from '@/stores/ui.store'

const HIDE_AFTER_MS = 2_400

export function useCursorAutoHide() {
  const cursorHidden = useUiStore((s) => s.cursorHidden)
  const setCursorHidden = useUiStore((s) => s.setCursorHidden)
  const lastControllerActivityAt = useUiStore((s) => s.lastControllerActivityAt)

  useEffect(() => {
    if (!lastControllerActivityAt) return
    const timer = window.setTimeout(() => {
      if (useUiStore.getState().navigationInput === 'controller') setCursorHidden(true)
    }, HIDE_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [lastControllerActivityAt, setCursorHidden])

  useEffect(() => {
    document.documentElement.style.cursor = cursorHidden ? 'none' : ''
    document.body.style.cursor = cursorHidden ? 'none' : ''
  }, [cursorHidden])
}
