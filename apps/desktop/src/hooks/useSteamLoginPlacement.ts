import { useEffect, useState } from 'react'
import { placeSteamWindowsLogin } from '@/lib/tauri'
import { steamLoginHostFrame } from '@/lib/steamLoginFrame'

/** One bounded positioning request at a time; follows moves and display changes. */
export function useSteamLoginPlacement(enabled: boolean, host: HTMLDivElement | null) {
  const [placed, setPlaced] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  useEffect(() => {
    setPlaced(false)
    setError(null)
    if (!enabled || !host) return
    let disposed = false
    let pending = false
    let stopped = false
    const started = Date.now()
    const place = async () => {
      if (disposed || pending || stopped) return
      pending = true
      try {
        const result = await placeSteamWindowsLogin(
          steamLoginHostFrame(host.getBoundingClientRect()),
        )
        if (disposed) return
        setPlaced(result.placed)
        if (!result.placed && Date.now() - started >= 30_000) {
          stopped = true
          setError(
            new Error(
              'Steam’s sign-in window could not be shown. Close this dialog and try again.',
            ),
          )
        }
      } catch (cause) {
        if (!disposed) {
          stopped = true
          setPlaced(false)
          setError(cause instanceof Error ? cause : new Error(String(cause)))
        }
      } finally {
        pending = false
      }
    }
    void place()
    const timer = window.setInterval(() => void place(), 500)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [enabled, host])
  return { placed, error }
}
