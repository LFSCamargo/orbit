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
  downloadedBytes?: number
  totalBytes?: number
  stage?: string
  error?: string
  /** Cancelled or paused by the person; not a failure. */
  stopped?: boolean
}

/** Applies native SteamCMD / Steam & Microsoft Store setup progress to the shared download tracker. */
export function useSteamDownloadEvents() {
  const start = useDownloadStore((state) => state.start)
  const update = useDownloadStore((state) => state.update)
  const finish = useDownloadStore((state) => state.finish)
  const fail = useDownloadStore((state) => state.fail)
  const clear = useDownloadStore((state) => state.clear)

  useEffect(() => {
    if (!isTauriRuntime()) return
    let active = true
    let unlistenSteam: (() => void) | undefined
    let unlistenMsStore: (() => void) | undefined
    const handle = (payload: SteamDownloadEvent) => {
      const {
        key,
        label,
        progress,
        downloadedBytes,
        totalBytes,
        stage,
        done,
        error,
        stopped,
      } = payload
      if (error) {
        fail(key, error)
        return
      }
      if (stopped) {
        clear(key)
        return
      }
      if (!useDownloadStore.getState().tasks[key]) start({ key, label })
      if (progress) {
        update(key, progress)
      } else if (typeof downloadedBytes === 'number' && typeof totalBytes === 'number') {
        update(key, {
          phase: done ? 'Ready' : 'Downloading',
          component: stage ?? label,
          downloadedBytes,
          totalBytes,
          message: stage ?? 'Ready',
        } as SetupProgress)
      }
      if (done) finish(key)
    }
    void listen<SteamDownloadEvent>('steam-download-progress', (event) =>
      handle(event.payload),
    ).then((stop) => {
      if (active) unlistenSteam = stop
      else stop()
    })
    void listen<SteamDownloadEvent>('msstore-download-progress', (event) =>
      handle(event.payload),
    ).then((stop) => {
      if (active) unlistenMsStore = stop
      else stop()
    })
    return () => {
      active = false
      unlistenSteam?.()
      unlistenMsStore?.()
    }
  }, [clear, fail, finish, start, update])
}
