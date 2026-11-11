import { isEditingKeyboardEvent } from '@/controllers/keyboard'
import { useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauriRuntime, setWindowFullscreen } from '@/lib/tauri'
import { useUiStore } from '@/stores/ui.store'

export function useFullscreen() {
  const fullscreen = useUiStore((s) => s.fullscreen)
  const setFullscreen = useUiStore((s) => s.setFullscreen)

  useEffect(() => {
    void setWindowFullscreen(fullscreen).catch((error) => {
      console.warn('Fullscreen toggle failed', error)
    })
  }, [fullscreen])

  // Sync the UI store when the user enters/exits fullscreen via native window
  // controls (e.g. the macOS traffic-light maximize button).
  useEffect(() => {
    if (!isTauriRuntime()) return

    const appWindow = getCurrentWindow()
    const sync = async () => {
      try {
        const state = await appWindow.isFullscreen()
        if (state !== useUiStore.getState().fullscreen) {
          setFullscreen(state)
        }
      } catch {
        // ignore
      }
    }

    const unlisten = appWindow.onResized(sync)
    void sync()

    return () => {
      unlisten.then((off) => off()).catch(() => {})
    }
  }, [setFullscreen])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditingKeyboardEvent(event)) return
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
