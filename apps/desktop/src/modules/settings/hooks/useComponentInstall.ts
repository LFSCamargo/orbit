import { useQueryClient } from '@tanstack/react-query'
import {
  installComponent,
  installGptkViaHomebrew,
  installLocalGptkPackage,
} from '@/lib/tauri'
import { useDownloadStore, type DownloadTask } from '@/lib/downloadProgress'
import type { ComponentSpec, GptkFormula, LocalGptkPackage } from '@/types/runtime'

/**
 * Task identity for one compatibility component version. The same key drives
 * the store, the retry affordance and the progress row, so navigating away
 * cannot orphan an in-flight download.
 */
export function componentTaskKey(componentId: string, version: string): string {
  return `component:${componentId}:${version}`
}

export function useComponentInstall() {
  const queryClient = useQueryClient()
  const tasks = useDownloadStore((state) => state.tasks)
  const failures = useDownloadStore((state) => state.failures)

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['component-status'] }),
      queryClient.invalidateQueries({ queryKey: ['windows-compatibility'] }),
      queryClient.invalidateQueries({ queryKey: ['runtimes'] }),
      queryClient.invalidateQueries({ queryKey: ['compatibility-settings'] }),
      queryClient.invalidateQueries({ queryKey: ['active-components'] }),
    ])
  }

  const perform = async (key: string, label: string, work: () => Promise<unknown>) => {
    const store = useDownloadStore.getState()
    const existing = store.tasks[key]
    if (existing && existing.progress?.phase !== 'Ready') return ''
    store.start({ key, label })
    try {
      await work()
      store.finish(key)
      await refresh()
      return ''
    } catch (error) {
      store.fail(key, String(error))
      return String(error)
    }
  }

  const installCatalogComponent = (spec: ComponentSpec) => {
    const key = componentTaskKey(spec.id, spec.version)
    return perform(key, `${spec.id} ${spec.version}`, () =>
      installComponent(spec, (progress) =>
        useDownloadStore.getState().update(key, progress),
      ),
    )
  }

  const installHomebrew = (formula: GptkFormula) => {
    const key = componentTaskKey('gptk', formula.version)
    return perform(key, `Apple GPTK ${formula.version}`, () =>
      installGptkViaHomebrew(formula, (message) =>
        useDownloadStore
          .getState()
          .update(key, { phase: 'Installing', component: message }),
      ),
    )
  }

  const importLocal = (package_: LocalGptkPackage) => {
    const key = componentTaskKey('gptk', package_.version)
    return perform(key, `Apple GPTK ${package_.version}`, () =>
      installLocalGptkPackage(package_.path, (progress) =>
        useDownloadStore.getState().update(key, progress),
      ),
    )
  }

  const taskFor = (componentId: string, version: string): DownloadTask | undefined =>
    tasks[componentTaskKey(componentId, version)]

  const failureFor = (componentId: string, version: string): string =>
    failures[componentTaskKey(componentId, version)] ?? ''

  const dismiss = (componentId: string, version: string) =>
    useDownloadStore.getState().clear(componentTaskKey(componentId, version))

  return {
    tasks,
    taskFor,
    failureFor,
    installCatalogComponent,
    installHomebrew,
    importLocal,
    dismiss,
  }
}
