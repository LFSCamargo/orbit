import { useEffect } from 'react'
import { gamepadManager } from '@/controllers/GamepadManager'
import { xcloudStreamPlaying } from '@/lib/tauri'

/**
 * While the stream plays, the peer reads the pad itself: Orbit's poller stops
 * and Rust's controller and network loops back off as for a local game.
 * Paused (Orbit's menu over the stream) or closed, both come back.
 */
export function useStreamStandDown(paused: boolean) {
  useEffect(() => {
    if (paused) return
    gamepadManager.setSuspended(true)
    void xcloudStreamPlaying(true).catch(() => undefined)
    return () => {
      gamepadManager.setSuspended(false)
      void xcloudStreamPlaying(false).catch(() => undefined)
    }
  }, [paused])
}
