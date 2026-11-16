import { useEffect } from 'react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { playExitMessage, type LaunchProgress } from '@/lib/launchProgress'
import type { GameSession } from '@/types/game'
import { useLaunchStore } from '@/stores/launch.store'

/** O(1) event apply: one launch overlay payload at a time. */
export function useLaunchProgress() {
  const apply = useLaunchStore((s) => s.apply)
  const clear = useLaunchStore((s) => s.clear)

  useEffect(() => {
    let disposed = false
    const unlisteners: UnlistenFn[] = []
    const register = (subscription: Promise<UnlistenFn>) => {
      void subscription.then((unlisten) => {
        if (disposed) unlisten()
        else unlisteners.push(unlisten)
      })
    }
    register(
      listen<LaunchProgress>('game-launch-progress', (event) => {
        apply(event.payload)
      }),
    )
    register(
      listen('game-session-started', () => {
        clear()
      }),
    )
    register(
      listen<GameSession>('game-session-ended', ({ payload: session }) => {
        if (
          session.stopReason !== 'process-exited' ||
          session.exitCode == null ||
          session.exitCode === 0
        )
          return
        const store = useLaunchStore.getState()
        if (store.launch && store.launch.gameId !== session.gameId) return
        if (store.launch?.failed) return
        store.fail(session.gameId, 'spawn', playExitMessage(session.exitCode))
      }),
    )
    return () => {
      disposed = true
      for (const unlisten of unlisteners) unlisten()
    }
  }, [apply, clear])
}
