import { isEditingKeyboardEvent } from '@/controllers/keyboard'
import { useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauriRuntime, setWindowFullscreen } from '@/lib/tauri'
import { useUiStore } from '@/stores/ui.store'

/**
 * Apply a fullscreen change the user asked for. This is the only path that
 * commands the window: echoing the window's own reports back started a new
 * animation from an in-between state and looped (with the system alert sound).
 */
export function requestFullscreen(fullscreen: boolean) {
  useUiStore.getState().setFullscreen(fullscreen)
  void setWindowFullscreen(fullscreen).catch((error) => {
    console.warn('Fullscreen toggle failed', error)
  })
}

/**
 * Mount once (App). Mirrors the native window into the store — the window
 * config already enters fullscreen at launch — and binds ⌘F / F11.
 */
export function useFullscreenSync() {
  const setFullscreen = useUiStore((s) => s.setFullscreen)

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
        requestFullscreen(!useUiStore.getState().fullscreen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Read the state and request changes; safe to use from any screen. */
export function useFullscreen() {
  const fullscreen = useUiStore((s) => s.fullscreen)
  return { fullscreen, setFullscreen: requestFullscreen }
}
