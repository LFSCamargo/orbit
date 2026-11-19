import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isTauriRuntime } from '@/lib/devMockApi'
import { getDownloadQueue } from '@/lib/tauri'
import type { DownloadQueue } from '@/types/downloads'

const QUEUE_KEY = ['download-queue'] as const
const EMPTY: DownloadQueue = { active: null, pending: [] }

/** The native download queue, kept live by `download-queue-changed` events. */
export function useDownloadQueue() {
  const client = useQueryClient()
  const query = useQuery({ queryKey: QUEUE_KEY, queryFn: getDownloadQueue })
  useEffect(() => {
    if (!isTauriRuntime()) return
    let active = true
    let unlisten: (() => void) | undefined
    void listen<DownloadQueue>('download-queue-changed', ({ payload }) => {
      client.setQueryData(QUEUE_KEY, payload)
    }).then((stop) => {
      if (active) unlisten = stop
      else stop()
    })
    return () => {
      active = false
      unlisten?.()
    }
  }, [client])
  return query.data ?? EMPTY
}

/** 1-based place of a waiting title, or null when it is not waiting. */
export function queuePosition(queue: DownloadQueue, appId: string | null): number | null {
  if (!appId) return null
  const index = queue.pending.findIndex((item) => item.appId === appId)
  return index < 0 ? null : index + 1
}
