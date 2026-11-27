import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useQueryClient } from '@tanstack/react-query'
import { isTauriRuntime } from '@/lib/devMockApi'
import { formatBytes } from '@/lib/format'
import { notify } from '@/lib/toast'
import type { CompressionStatus } from '@/types/compression'

export const COMPRESSION_QUERY = ['game-compression'] as const
const TOAST_ID = 'game-compression'

/** 0-100 across every game, counting the current game's bytes. */
export function compressionPercent(status: CompressionStatus): number | null {
  if (status.gamesTotal === 0) return null
  const current = status.bytesTotal > 0 ? status.bytesDone / status.bytesTotal : 0
  const done = Math.min(status.gamesTotal, status.gamesDone + current)
  return Math.round((done / status.gamesTotal) * 100)
}

/**
 * One toast for the whole job: progress while it runs, then success or the
 * error. `previous` tells a finish apart from the idle state at startup.
 */
export function syncCompressionToast(
  previous: CompressionStatus | null,
  next: CompressionStatus,
) {
  const verb = next.compressing ? 'Compressing' : 'Decompressing'
  if (next.running) {
    const position = Math.min(next.gamesDone + 1, Math.max(next.gamesTotal, 1))
    const bytes =
      next.bytesTotal > 0
        ? `${formatBytes(next.bytesDone)} / ${formatBytes(next.bytesTotal)}`
        : undefined
    notify.progress({
      id: TOAST_ID,
      title: `${verb} games`,
      caption:
        next.gamesTotal > 0
          ? `Game ${position} of ${next.gamesTotal}${next.currentTitle ? ` · ${next.currentTitle}` : ''}`
          : 'Finding installed games',
      message: bytes,
      value: compressionPercent(next),
    })
    return
  }
  if (!previous?.running) return
  if (next.error) {
    notify.error({ title: `${verb} stopped`, message: next.error }, { id: TOAST_ID })
    return
  }
  const later =
    next.skippedGames > 0
      ? ` ${next.skippedGames} running or downloading ${next.skippedGames === 1 ? 'game was' : 'games were'} skipped.`
      : ''
  notify.success(
    next.compressing
      ? {
          title: 'Games compressed',
          message: `Saved ${formatBytes(Math.max(next.savedBytes, 0))} on disk.${later}`,
        }
      : {
          title: 'Games decompressed',
          message: `Every game is stored at full size again.${later}`,
        },
    { id: TOAST_ID },
  )
}

/** Mount once: keeps the compression query fresh and mirrors the job as a toast. */
export function useCompressionEvents() {
  const client = useQueryClient()
  useEffect(() => {
    if (!isTauriRuntime()) return
    let active = true
    let stop: (() => void) | null = null
    let previous: CompressionStatus | null = null
    void listen<CompressionStatus>('game-compression-progress', ({ payload }) => {
      syncCompressionToast(previous, payload)
      previous = payload
      client.setQueryData(COMPRESSION_QUERY, payload)
    }).then((unlisten) => {
      if (active) stop = unlisten
      else unlisten()
    })
    return () => {
      active = false
      stop?.()
    }
  }, [client])
}
