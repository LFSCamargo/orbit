import { useQueryClient } from '@tanstack/react-query'
import { installOrbitWineVersion } from '@/lib/tauri'
import { useDownloadStore } from '@/lib/downloadProgress'
import { ORBIT_WINE_KEY } from './useOrbitWineSetup'

/** Installs one published Orbit Wine build as the one tracked Orbit Wine
 * task, so Settings, the toast and the downloads sidebar show its progress.
 * Rust switches games to it once its container is ready. */
export function useOrbitWineInstall() {
  const queryClient = useQueryClient()

  const refresh = () =>
    Promise.all(
      [
        ['orbit-wine-versions'],
        ['orbit-wine'],
        ['runtimes'],
        ['windows-compatibility'],
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    )

  const install = async (version: string) => {
    const store = useDownloadStore.getState()
    const existing = store.tasks[ORBIT_WINE_KEY]
    if (existing && existing.progress?.phase !== 'Ready') return
    store.start({ key: ORBIT_WINE_KEY, label: `Orbit Wine ${version}` })
    try {
      await installOrbitWineVersion(version, (progress) =>
        useDownloadStore.getState().update(ORBIT_WINE_KEY, progress),
      )
      useDownloadStore.getState().finish(ORBIT_WINE_KEY)
      await refresh()
    } catch (caught) {
      useDownloadStore.getState().fail(ORBIT_WINE_KEY, String(caught))
    }
  }

  return { install, refresh }
}
