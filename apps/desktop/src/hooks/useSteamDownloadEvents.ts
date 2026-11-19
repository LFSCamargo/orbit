import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { isTauriRuntime } from '@/lib/devMockApi'
import { useDownloadStore } from '@/lib/downloadProgress'
import type { SetupProgress } from '@/types/runtime'

interface SteamDownloadEvent {
  key: string
  label: string
  done: boolean
  progress?: SetupProgress
  error?: string
  /** Cancelled or paused by the person; not a failure. */
  stopped?: boolean
}

/** Applies native SteamCMD / Steam setup progress to the shared download tracker. */
export function useSteamDownloadEvents() {
  const start = useDownloadStore((state) => state.start)
  const update = useDownloadStore((state) => state.update)
  const finish = useDownloadStore((state) => state.finish)
  const fail = useDownloadStore((state) => state.fail)
  const clear = useDownloadStore((state) => state.clear)

  useEffect(() => {
    if (!isTauriRuntime()) return
    let active = true
    let unlisten: (() => void) | undefined
    void listen<SteamDownloadEvent>('steam-download-progress', (event) => {
      const { key, label, progress, done, error, stopped } = event.payload
      if (error) {
        fail(key, error)
        return
      }
      if (stopped) {
        clear(key)
        return
      }
      if (!useDownloadStore.getState().tasks[key]) start({ key, label })
      if (progress) update(key, progress)
      if (done) finish(key)
    }).then((stop) => {
      if (active) unlisten = stop
      else stop()
    })
    return () => {
      active = false
      unlisten?.()
    }
  }, [clear, fail, finish, start, update])
}
