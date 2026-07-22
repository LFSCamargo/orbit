import { useEffect } from 'react'
import { useUiStore } from '@/stores/ui.store'

const HIDE_AFTER_MS = 2_400

export function useCursorAutoHide() {
  const cursorHidden = useUiStore((s) => s.cursorHidden)
  const markMouseActivity = useUiStore((s) => s.markMouseActivity)
  const setCursorHidden = useUiStore((s) => s.setCursorHidden)
  const lastControllerActivityAt = useUiStore((s) => s.lastControllerActivityAt)

  useEffect(() => {
    const onMove = () => markMouseActivity()
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [markMouseActivity])

  useEffect(() => {
    if (!lastControllerActivityAt) return
    const timer = window.setTimeout(() => {
      setCursorHidden(true)
    }, HIDE_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [lastControllerActivityAt, setCursorHidden])

  useEffect(() => {
    document.documentElement.style.cursor = cursorHidden ? 'none' : ''
    document.body.style.cursor = cursorHidden ? 'none' : ''
  }, [cursorHidden])
}
