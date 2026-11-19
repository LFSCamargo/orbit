import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useQueryClient } from '@tanstack/react-query'
import { isTauriRuntime } from '@/lib/devMockApi'
import { notify } from '@/lib/toast'

/** Invalidate shared catalog views once the native background job saves details. */
export function useSteamLibraryEvents() {
  const client = useQueryClient()
  useEffect(() => {
    if (!isTauriRuntime()) return
    let active = true
    const stops: Array<() => void> = []
    const attach = (stop: () => void) => {
      if (active) stops.push(stop)
      else stop()
    }
    void listen('steam-library-updated', () => {
      for (const key of ['steam-windows-library', 'library', 'library-entry', 'games']) {
        void client.invalidateQueries({ queryKey: [key] })
      }
    }).then(attach)
    void listen<string>('steam-library-error', ({ payload }) => {
      notify.warning({ title: 'Steam library', message: payload })
    }).then(attach)
    return () => {
      active = false
      stops.forEach((stop) => stop())
    }
  }, [client])
}
