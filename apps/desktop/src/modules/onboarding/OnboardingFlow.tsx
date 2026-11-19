import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { focusManager } from '@/controllers/FocusManager'
import { useOverlayBack } from '@/controllers/overlayStack'
import { useModalFocus } from '@/hooks/useModalFocus'
import { screenEntryFocusId } from '@/lib/navigation'
import { usePreferencesStore } from '@/stores/preferences.store'
import { useUiStore } from '@/stores/ui.store'
import { useSplashHold } from '@/app/splash/useSplashHold'
import { OnboardingFrame } from './components/OnboardingFrame'
import { useOnboardingReady } from './hooks/useOnboardingReady'
import { graphicsTier } from './lib/graphicsSupport'
import { ONBOARDING_PRIMARY_ID } from './components/OnboardingFooter'
import { nextStep, previousStep, type OnboardingStep } from './lib/onboardingSteps'
import { AccountStep } from './steps/AccountStep'
import { RecommendedStep } from './steps/RecommendedStep'
import { ScanStep } from './steps/ScanStep'
import { SetupStep } from './steps/SetupStep'
import { WelcomeStep } from './steps/WelcomeStep'

/** Each step starts on its primary action. Runs when the new step mounts,
 * after the previous one has finished leaving, so focus never lands on a
 * button that is about to disappear. For its first second it also holds the
 * trap: Orbit behind the overlay may still be mounting and claim focus for
 * its own screen, which would leave the ring on a window control or outside.
 */
const SETTLE_MS = [0, 120, 400, 900]
const WINDOW_CONTROLS = new Set(['onboarding-minimize', 'onboarding-skip'])

function FocusPrimaryOnMount() {
  useEffect(() => {
    const timers = SETTLE_MS.map((delay, attempt) =>
      window.setTimeout(() => {
        focusManager.setGroupPreference('onboarding', { trap: true })
        const focused = focusManager.getFocusedNode()
        const unsettled =
          attempt === 0 ||
          focused?.group !== 'onboarding' ||
          WINDOW_CONTROLS.has(focused.id)
        if (unsettled && focusManager.hasNode(ONBOARDING_PRIMARY_ID)) {
          focusManager.setFocus(ONBOARDING_PRIMARY_ID)
        }
      }, delay),
    )
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [])
  return null
}

/** Welcome → Setup → Account → Recommended → Scan → Home. Shown on first run
 * and when replayed from Settings; B goes back one step.
 */
export function OnboardingFlow() {
  const reduceMotion = useReducedMotion()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [confirmSkip, setConfirmSkip] = useState(false)
  const updatePreferences = usePreferencesStore((s) => s.update)
  const closeOnboarding = useUiStore((s) => s.closeOnboarding)
  const setScreen = useUiStore((s) => s.setScreen)
  // Shown only once whole: the startup splash, or a spinner when replayed,
  // covers the wait.
  const gpu = useMemo(() => graphicsTier() === 'gpu', [])
  const { ready, onSceneReady } = useOnboardingReady(gpu)
  useSplashHold(!ready)

  const back = () => setStep((current) => previousStep(current) ?? current)
  const next = () => setStep((current) => nextStep(current) ?? current)

  useModalFocus(true, 'onboarding', ONBOARDING_PRIMARY_ID)
  useOverlayBack(previousStep(step) !== null, back)

  const finish = async () => {
    await updatePreferences({ onboardingCompleted: true })
    closeOnboarding()
    setScreen('home')
    for (const key of ['games', 'library', 'library-entry']) {
      void queryClient.invalidateQueries({ queryKey: [key] })
    }
    window.setTimeout(
      () => focusManager.focusScreenEntry(screenEntryFocusId('home')),
      400,
    )
  }

  return (
    <OnboardingFrame
      step={step}
      onSkip={() => setConfirmSkip(true)}
      ready={ready}
      onSceneReady={onSceneReady}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          className="flex min-h-0 flex-1 flex-col"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
          transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
          data-step={step}
        >
          <FocusPrimaryOnMount />
          {step === 'welcome' && <WelcomeStep onNext={next} />}
          {step === 'setup' && <SetupStep onNext={next} onBack={back} />}
          {step === 'account' && <AccountStep onNext={next} onBack={back} />}
          {step === 'recommended' && <RecommendedStep onNext={next} onBack={back} />}
          {step === 'scan' && <ScanStep onFinish={() => void finish()} onBack={back} />}
        </motion.div>
      </AnimatePresence>
      <ConfirmDialog
        open={confirmSkip}
        title="Skip setup?"
        description="Orbit opens on Home. You can install components, sign in and scan for games later in Settings, or replay this from Settings → General."
        confirmLabel="Skip setup"
        onConfirm={() => {
          setConfirmSkip(false)
          void finish()
        }}
        onCancel={() => setConfirmSkip(false)}
      />
    </OnboardingFrame>
  )
}
