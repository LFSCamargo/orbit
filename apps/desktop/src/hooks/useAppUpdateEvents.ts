import { useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { isTauriRuntime } from '@/lib/devMockApi'
import { appUpdateStatus } from '@/lib/tauri'
import { notify } from '@/lib/toast'
import { useAppUpdateStore } from '@/stores/appUpdate.store'
import { useSessionStore } from '@/stores/session.store'
import type { AppUpdateState } from '@/types/appUpdate'

/**
 * Mirrors Orbit's own update state into `appUpdate.store` and announces a
 * downloaded update once. Never over a running game: the toast waits for the
 * session to end. Mounted once in App.
 */
export function useAppUpdateEvents() {
  const setState = useAppUpdateStore((s) => s.setState)
  const state = useAppUpdateStore((s) => s.state)
  const playing = useSessionStore((s) => s.activeSession !== null)
  const announced = useRef<string | null>(null)

  useEffect(() => {
    if (!isTauriRuntime()) return
    let active = true
    let unlisten: (() => void) | undefined
    void appUpdateStatus()
      .then((current) => {
        if (active) setState(current)
      })
      .catch(() => undefined)
    void listen<AppUpdateState>('app-update', ({ payload }) => setState(payload)).then(
      (stop) => {
        if (active) unlisten = stop
        else stop()
      },
    )
    return () => {
      active = false
      unlisten?.()
    }
  }, [setState])

  useEffect(() => {
    if (state.status !== 'ready' || playing || announced.current === state.version) return
    announced.current = state.version
    notify.success(
      {
        title: `Orbit ${state.version} is ready`,
        message: 'Restart from the Home menu or Settings → General to update.',
      },
      { id: 'app-update-ready', duration: 12_000 },
    )
  }, [state, playing])
}
