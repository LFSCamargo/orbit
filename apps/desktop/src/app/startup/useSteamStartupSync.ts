import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { refreshSteamWindowsLibrary, steamWindowsStatus } from '@/lib/tauri'
import { usePreferencesStore } from '@/stores/preferences.store'

/** Once per launch, after onboarding: quietly refresh the signed-in Steam
 * owned library so newly purchased games appear without a manual Refresh.
 * Runs regardless of `scanOnStartup` (which gates filesystem folder scans).
 */
export function useSteamStartupSync() {
  const queryClient = useQueryClient()
  const ready = usePreferencesStore((s) => s.ready)
  const onboardingCompleted = usePreferencesStore(
    (s) => s.preferences.onboardingCompleted,
  )
  const status = useQuery({
    queryKey: ['steam-windows-status'],
    queryFn: steamWindowsStatus,
    enabled: ready && onboardingCompleted,
  })
  const signedIn = status.data?.signedIn === true
  const started = useRef(false)

  useEffect(() => {
    if (!ready || !onboardingCompleted || !signedIn || started.current) return
    started.current = true
    void refreshSteamWindowsLibrary()
      .then(() =>
        Promise.all(
          [
            'steam-windows-library',
            'steam-windows-status',
            'library',
            'library-entry',
            'games',
          ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
        ),
      )
      .catch(() => {
        // Offline or incomplete sign-in: keep the saved SQLite snapshot.
      })
  }, [ready, onboardingCompleted, signedIn, queryClient])
}
