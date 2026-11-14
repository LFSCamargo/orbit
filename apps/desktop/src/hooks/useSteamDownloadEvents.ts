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
}

/** Applies native SteamCMD progress to the shared download tracker. */
export function useSteamDownloadEvents() {
  const start = useDownloadStore((state) => state.start)
  const update = useDownloadStore((state) => state.update)
  const finish = useDownloadStore((state) => state.finish)

  useEffect(() => {
    if (!isTauriRuntime()) return
    let active = true
    let unlisten: (() => void) | undefined
    void listen<SteamDownloadEvent>('steam-download-progress', (event) => {
      const { key, label, progress, done } = event.payload
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
  }, [finish, start, update])
}
