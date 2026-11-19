import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { isTauriRuntime } from '@/lib/devMockApi'
import { getNetworkStats } from '@/lib/tauri'
import type { NetworkStats } from '@/types/downloads'

const HISTORY = 40

/** Keeps the last `HISTORY` download rates for the sparkline. O(HISTORY). */
export function pushSample(samples: number[], rate: number): number[] {
  return [...samples.slice(1 - HISTORY), rate]
}

/**
 * The Mac's live network: download and upload rates plus online state,
 * pushed by Rust once a second, and a short history of download rates.
 */
export function useNetworkStats() {
  const [stats, setStats] = useState<NetworkStats | null>(null)
  const [samples, setSamples] = useState<number[]>([])
  useEffect(() => {
    if (!isTauriRuntime()) return
    let active = true
    let unlisten: (() => void) | undefined
    void getNetworkStats()
      .then((first) => {
        if (active) setStats((current) => current ?? first)
      })
      .catch(() => undefined)
    void listen<NetworkStats>('network-stats', ({ payload }) => {
      setStats(payload)
      setSamples((list) => pushSample(list, payload.downloadRate))
    }).then((stop) => {
      if (active) unlisten = stop
      else stop()
    })
    return () => {
      active = false
      unlisten?.()
    }
  }, [])
  return { stats, samples }
}
