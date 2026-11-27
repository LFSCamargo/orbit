import { useEffect, useRef, useState } from 'react'
import { orbitWineUpdate, skipOrbitWineUpdate } from '@/lib/tauri'
import { useOrbitWineInstall } from '@/modules/settings/hooks/useOrbitWineInstall'
import { useOnboardingVisible } from '@/modules/onboarding/lib/onboardingVisibility'
import { usePreferencesStore } from '@/stores/preferences.store'
import { useSessionStore } from '@/stores/session.store'
import type { OrbitWineUpdate } from '@/types/runtime'
import { useSplashActive } from '../splash/useSplashHold'

/** Once per launch, after onboarding and the splash and with no game
 * running: offer a newer Orbit Wine build. Accept installs it and switches
 * games to it; Keep remembers the version so it is not offered again; Later
 * (Back, Escape) asks again next launch. Offline, nothing is shown. `paused`
 * holds the check while another dialog (an Orbit update) has its turn.
 */
export function useOrbitWineUpdatePrompt(paused = false) {
  const ready = usePreferencesStore((s) => s.ready)
  const onboardingCompleted = usePreferencesStore(
    (s) => s.preferences.onboardingCompleted,
  )
  const onboarding = useOnboardingVisible()
  const splash = useSplashActive()
  const playing = useSessionStore((s) => s.activeSession !== null)
  const { install } = useOrbitWineInstall()
  const [update, setUpdate] = useState<OrbitWineUpdate | null>(null)
  const checked = useRef(false)

  useEffect(() => {
    if (paused || !ready || !onboardingCompleted || onboarding || splash || playing)
      return
    if (checked.current) return
    checked.current = true
    orbitWineUpdate()
      .then(setUpdate)
      .catch(() => {
        // Offline or GitHub unavailable: ask next launch.
      })
  }, [paused, ready, onboardingCompleted, onboarding, splash, playing])

  const accept = () => {
    if (!update) return
    setUpdate(null)
    void install(update.version)
  }

  const keep = () => {
    if (!update) return
    setUpdate(null)
    skipOrbitWineUpdate(update.version).catch(() => {
      // Not remembered: the offer returns next launch.
    })
  }

  const later = () => setUpdate(null)

  return { update, accept, keep, later }
}
