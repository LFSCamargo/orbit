import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import type { GameSession } from '@/types/game'
import { useSessionStore } from '@/stores/session.store'
import { useQueryClient } from '@tanstack/react-query'

export function useSessionEvents() {
  const setActiveSession = useSessionStore((s) => s.setActiveSession)
  const queryClient = useQueryClient()

  useEffect(() => {
    const unlisteners: Array<() => void> = []

    void (async () => {
      unlisteners.push(
        await listen<GameSession>('game-session-started', (event) => {
          setActiveSession(event.payload)
          void queryClient.invalidateQueries({ queryKey: ['games'] })
          void queryClient.invalidateQueries({ queryKey: ['active-session'] })
        }),
      )
      unlisteners.push(
        await listen<GameSession>('game-session-ended', () => {
          setActiveSession(null)
          void queryClient.invalidateQueries({ queryKey: ['games'] })
          void queryClient.invalidateQueries({ queryKey: ['active-session'] })
        }),
      )
      unlisteners.push(
        await listen<{ message: string }>('game-session-error', (event) => {
          console.error('Game session error:', event.payload.message)
          void queryClient.invalidateQueries({ queryKey: ['active-session'] })
        }),
      )
    })()

    return () => {
      for (const unlisten of unlisteners) unlisten()
    }
  }, [queryClient, setActiveSession])
}
