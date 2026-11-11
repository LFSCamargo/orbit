import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSetting, getGameHubLibrary, openGameHub } from '@/lib/tauri'

/** Only runs after the user enables background GameHub in the library manager. */
export function useGameHubBackground() {
  const { data: enabled } = useQuery({
    queryKey: ['settings', 'gameHubBackground'],
    queryFn: () => getSetting<boolean>('gameHubBackground'),
  })
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let checking = false
    const ensure = async () => {
      if (checking) return
      checking = true
      try {
        const status = await getGameHubLibrary()
        if (!cancelled && status.available && !status.running) await openGameHub(false)
      } catch {
        /* The manager exposes process status and explicit retry controls. */
      } finally {
        checking = false
      }
    }
    void ensure()
    const timer = window.setInterval(() => void ensure(), 30_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [enabled])
}
