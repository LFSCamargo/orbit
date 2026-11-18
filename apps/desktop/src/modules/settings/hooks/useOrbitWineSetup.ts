import { useQueryClient } from '@tanstack/react-query'
import { installOrbitWine } from '@/lib/tauri'
import { useDownloadStore } from '@/lib/downloadProgress'

// Orbit Wine and its base container install as one tracked transfer, so the
// downloads sidebar and Settings show the same progress as onboarding.
export const ORBIT_WINE_KEY = 'component:orbit-wine'

export function useOrbitWineSetup() {
  const queryClient = useQueryClient()

  const install = async () => {
    const store = useDownloadStore.getState()
    const existing = store.tasks[ORBIT_WINE_KEY]
    if (existing && existing.progress?.phase !== 'Ready') return
    store.start({ key: ORBIT_WINE_KEY, label: 'Orbit Wine' })
    try {
      await installOrbitWine((progress) =>
        useDownloadStore.getState().update(ORBIT_WINE_KEY, progress),
      )
      useDownloadStore.getState().finish(ORBIT_WINE_KEY)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['orbit-wine'] }),
        queryClient.invalidateQueries({ queryKey: ['windows-compatibility'] }),
        queryClient.invalidateQueries({ queryKey: ['runtimes'] }),
      ])
    } catch (caught) {
      useDownloadStore.getState().fail(ORBIT_WINE_KEY, String(caught))
    }
  }

  return { install }
}
