import { useEffect, useRef } from 'react'
import { getCompatibilityCatalog, getComponentStatus } from '@/lib/tauri'
import { runtimeUpdates } from '@/lib/runtimeUpdates'
import { useComponentInstall } from '@/modules/settings/hooks/useComponentInstall'
import { usePreferencesStore } from '@/stores/preferences.store'

/** Once per launch, after onboarding: when "Update runtimes automatically" is
 * on, queue newer releases of installed components. They install one at a
 * time through the downloads queue, so progress shows in the sidebar.
 */
export function useRuntimeAutoUpdate() {
  const { installCatalogComponent } = useComponentInstall()
  const ready = usePreferencesStore((s) => s.ready)
  const { onboardingCompleted, autoUpdateRuntimes } = usePreferencesStore(
    (s) => s.preferences,
  )
  const started = useRef(false)

  useEffect(() => {
    if (!ready || !onboardingCompleted || !autoUpdateRuntimes || started.current) return
    started.current = true
    void (async () => {
      try {
        const [catalog, installed] = await Promise.all([
          getCompatibilityCatalog(false),
          getComponentStatus(),
        ])
        for (const spec of runtimeUpdates(catalog.components, installed)) {
          await installCatalogComponent(spec)
        }
      } catch {
        // Offline or unsupported: try again next launch.
      }
    })()
  }, [ready, onboardingCompleted, autoUpdateRuntimes, installCatalogComponent])
}
