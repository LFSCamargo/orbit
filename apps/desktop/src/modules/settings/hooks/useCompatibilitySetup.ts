import { useQueryClient } from '@tanstack/react-query'
import { installWindowsCompatibility } from '@/lib/tauri'
import { useDownloadStore } from '@/lib/downloadProgress'

// The recommended setup is one tracked transfer among many, so it survives
// panel navigation through the shared download store instead of its own copy.
export const RECOMMENDED_SETUP_KEY = 'component:wine-stable:recommended'

export function useCompatibilitySetup() {
  const queryClient = useQueryClient()
  const task = useDownloadStore((state) => state.tasks[RECOMMENDED_SETUP_KEY])
  const error = useDownloadStore((state) => state.failures[RECOMMENDED_SETUP_KEY]) ?? ''
  const ready = useDownloadStore(
    (state) => state.tasks[RECOMMENDED_SETUP_KEY]?.progress?.phase === 'Ready',
  )
  const busy = useDownloadStore((state) => {
    const current = state.tasks[RECOMMENDED_SETUP_KEY]
    return Boolean(current) && current.progress?.phase !== 'Ready'
  })

  const install = async () => {
    const store = useDownloadStore.getState()
    const existing = store.tasks[RECOMMENDED_SETUP_KEY]
    if (existing && existing.progress?.phase !== 'Ready') return
    store.start({ key: RECOMMENDED_SETUP_KEY, label: 'Windows compatibility' })
    try {
      await installWindowsCompatibility((progress) =>
        useDownloadStore.getState().update(RECOMMENDED_SETUP_KEY, progress),
      )
      useDownloadStore.getState().finish(RECOMMENDED_SETUP_KEY)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['windows-compatibility'] }),
        queryClient.invalidateQueries({ queryKey: ['runtimes'] }),
        queryClient.invalidateQueries({ queryKey: ['component-status'] }),
      ])
    } catch (caught) {
      useDownloadStore.getState().fail(RECOMMENDED_SETUP_KEY, String(caught))
    }
  }

  return {
    busy,
    complete: Boolean(ready),
    error,
    progress: task?.progress ?? null,
    task,
    install,
    dismiss: () => useDownloadStore.getState().clear(RECOMMENDED_SETUP_KEY),
  }
}
