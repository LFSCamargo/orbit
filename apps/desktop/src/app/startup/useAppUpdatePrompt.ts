import { useEffect, useRef, useState } from 'react'
import { appUpdateCheck, appUpdateInstall } from '@/lib/tauri'
import { useDownloadStore } from '@/lib/downloadProgress'
import { useOnboardingVisible } from '@/modules/onboarding/lib/onboardingVisibility'
import { usePreferencesStore } from '@/stores/preferences.store'
import { useSessionStore } from '@/stores/session.store'
import type { AppUpdate } from '@/types/runtime'
import { useSplashActive } from '../splash/useSplashHold'

const APP_UPDATE_KEY = 'app:update'

/** Once per launch, after onboarding and the splash and with no game
 * running: offer a newer Orbit. Update downloads the signed release as one
 * tracked task, installs it and restarts Orbit; Later asks again next launch.
 * `settled` turns true once nothing is offered or the dialog closed, so the
 * next prompt (Orbit Wine) waits its turn.
 */
export function useAppUpdatePrompt() {
  const ready = usePreferencesStore((s) => s.ready)
  const onboardingCompleted = usePreferencesStore(
    (s) => s.preferences.onboardingCompleted,
  )
  const onboarding = useOnboardingVisible()
  const splash = useSplashActive()
  const playing = useSessionStore((s) => s.activeSession !== null)
  const task = useDownloadStore((s) => s.tasks[APP_UPDATE_KEY])
  const error = useDownloadStore((s) => s.failures[APP_UPDATE_KEY])
  const [update, setUpdate] = useState<AppUpdate | null>(null)
  const [settled, setSettled] = useState(false)
  const [busy, setBusy] = useState(false)
  const checked = useRef(false)

  useEffect(() => {
    if (!ready || !onboardingCompleted || onboarding || splash || playing) return
    if (checked.current) return
    checked.current = true
    appUpdateCheck()
      .then((found) => {
        setUpdate(found)
        if (!found) setSettled(true)
      })
      .catch(() => {
        // Offline or no release feed: ask next launch.
        setSettled(true)
      })
  }, [ready, onboardingCompleted, onboarding, splash, playing])

  const install = async () => {
    if (!update || busy) return
    setBusy(true)
    const store = useDownloadStore.getState()
    store.start({ key: APP_UPDATE_KEY, label: `Orbit ${update.version}` })
    try {
      // Orbit restarts once the update is installed.
      await appUpdateInstall(update.version, (progress) =>
        useDownloadStore.getState().update(APP_UPDATE_KEY, progress),
      )
      useDownloadStore.getState().finish(APP_UPDATE_KEY)
    } catch (caught) {
      useDownloadStore.getState().fail(APP_UPDATE_KEY, String(caught))
    } finally {
      setBusy(false)
    }
  }

  const later = () => {
    if (busy) return
    setUpdate(null)
    setSettled(true)
  }

  return { update, settled, busy, task, error, install, later }
}
