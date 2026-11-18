import { useEffect, useState } from 'react'
import { transferRate, useDownloadStore } from '@/lib/downloadProgress'

const SAMPLE_MS = 1_000
const HISTORY = 40

function downloadingBytes(): number | null {
  let total: number | null = null
  for (const task of Object.values(useDownloadStore.getState().tasks)) {
    if (task.progress?.phase === 'Downloading')
      total = (total ?? 0) + task.progress.downloadedBytes
  }
  return total
}

/**
 * Combined download rate, sampled once a second, plus a short history for the
 * sparkline. Idle seconds record zero so the line falls when transfers stop.
 */
export function useTransferRate() {
  const [rate, setRate] = useState<number | null>(null)
  const [samples, setSamples] = useState<number[]>([])
  useEffect(() => {
    let previous: { at: number; bytes: number } | null = null
    const timer = window.setInterval(() => {
      const bytes = downloadingBytes()
      if (bytes === null) {
        previous = null
        setRate(null)
        setSamples((list) => (list.length ? [...list.slice(1 - HISTORY), 0] : list))
        return
      }
      const next = { at: Date.now(), bytes }
      const measured = transferRate(previous, next)
      previous = next
      if (measured === null) return
      setRate(measured)
      setSamples((list) => [...list.slice(1 - HISTORY), measured])
    }, SAMPLE_MS)
    return () => window.clearInterval(timer)
  }, [])
  return { rate, samples }
}
