import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useQueryClient } from '@tanstack/react-query'
import { isTauriRuntime } from '@/lib/devMockApi'
import type { SteamWindowsStatus } from '@/types/steam'

/** Patch the shared Steam status whenever the silent client phase changes. */
export function useSteamClientEvents() {
  const client = useQueryClient()
  useEffect(() => {
    if (!isTauriRuntime()) return
    let active = true
    let stop: (() => void) | undefined
    void listen<SteamWindowsStatus>('steam-client', ({ payload }) => {
      client.setQueryData(['steam-windows-status'], payload)
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
