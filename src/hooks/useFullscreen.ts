import { useEffect } from 'react'
import { setWindowFullscreen } from '@/lib/tauri'
import { useUiStore } from '@/stores/ui.store'

export function useFullscreen() {
  const fullscreen = useUiStore((s) => s.fullscreen)
  const setFullscreen = useUiStore((s) => s.setFullscreen)

  useEffect(() => {
    void setWindowFullscreen(fullscreen).catch((error) => {
      console.warn('Fullscreen toggle failed', error)
    })
  }, [fullscreen])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'F11' || (event.metaKey && event.key === 'f')) {
        event.preventDefault()
        setFullscreen(!useUiStore.getState().fullscreen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setFullscreen])

  return { fullscreen, setFullscreen }
}
