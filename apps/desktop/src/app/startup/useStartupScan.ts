import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { scanNativeApps, scanSteamInstallations, scanSteamLibrary } from '@/lib/tauri'
import { usePreferencesStore } from '@/stores/preferences.store'

/** Once per launch, after onboarding: quietly rescan Steam, Windows Steam and
 * Mac apps when "Scan for new games on startup" is on. A failing source does
 * not stop the others.
 */
export function useStartupScan() {
  const queryClient = useQueryClient()
  const ready = usePreferencesStore((s) => s.ready)
  const { onboardingCompleted, scanOnStartup } = usePreferencesStore((s) => s.preferences)
  const started = useRef(false)

  useEffect(() => {
    if (!ready || !onboardingCompleted || !scanOnStartup || started.current) return
    started.current = true
    void Promise.allSettled([
      scanSteamLibrary(),
      scanSteamInstallations(),
      scanNativeApps(),
    ]).then(() =>
      Promise.all(
        ['games', 'library', 'library-entry'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      ),
    )
  }, [ready, onboardingCompleted, scanOnStartup, queryClient])
}
