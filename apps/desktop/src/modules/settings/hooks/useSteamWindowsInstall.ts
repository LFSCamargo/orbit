import { useQueryClient } from '@tanstack/react-query'
import { installWindowsSteam } from '@/lib/tauri'
import { useDownloadStore } from '@/lib/downloadProgress'

export const STEAM_SETUP_KEY = 'steam:setup'
export const STEAM_SETUP_LABEL = 'Steam for Windows'

/** Installs official Windows Steam in Orbit's prefix and reports steam:setup progress. */
export function useSteamWindowsInstall() {
  const queryClient = useQueryClient()
  const task = useDownloadStore((state) => state.tasks[STEAM_SETUP_KEY])
  const error = useDownloadStore((state) => state.failures[STEAM_SETUP_KEY]) ?? ''
  const busy = useDownloadStore((state) => {
    const current = state.tasks[STEAM_SETUP_KEY]
    return Boolean(current) && current.progress?.phase !== 'Ready'
  })

  const install = async () => {
    const store = useDownloadStore.getState()
    const existing = store.tasks[STEAM_SETUP_KEY]
    if (existing && existing.progress?.phase !== 'Ready') return
    store.start({ key: STEAM_SETUP_KEY, label: STEAM_SETUP_LABEL })
    try {
      await installWindowsSteam()
      useDownloadStore.getState().finish(STEAM_SETUP_KEY)
      await queryClient.invalidateQueries({ queryKey: ['steam-windows-status'] })
    } catch (caught) {
      useDownloadStore
        .getState()
        .fail(STEAM_SETUP_KEY, caught instanceof Error ? caught.message : String(caught))
    }
  }

  return { busy, error, task, install }
}
