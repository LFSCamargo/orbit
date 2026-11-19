import type { ControllerAction } from '@/controllers/ControllerMapping'
import { usePreferencesStore } from '@/stores/preferences.store'
import { useUiStore } from '@/stores/ui.store'

/** First run (not completed yet) or replayed from Settings. */
export function onboardingVisible(): boolean {
  const { ready, preferences } = usePreferencesStore.getState()
  return (
    ready && (!preferences.onboardingCompleted || useUiStore.getState().onboardingOpen)
  )
}

export function useOnboardingVisible(): boolean {
  const ready = usePreferencesStore((s) => s.ready)
  const completed = usePreferencesStore((s) => s.preferences.onboardingCompleted)
  const open = useUiStore((s) => s.onboardingOpen)
  return ready && (!completed || open)
}

const ALLOWED: ReadonlySet<ControllerAction> = new Set([
  'navigate-up',
  'navigate-down',
  'navigate-left',
  'navigate-right',
  'confirm',
  'back',
])

/** Controller actions onboarding handles; the rest would leave it for a
 * screen hidden behind it.
 */
export function onboardingAllows(action: ControllerAction): boolean {
  return ALLOWED.has(action)
}
