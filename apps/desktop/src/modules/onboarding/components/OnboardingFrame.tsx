import { motion, useReducedMotion } from 'framer-motion'
import { Spinner } from '@/components/feedback/Spinner'
import type { ReactNode } from 'react'
import { Minus, X } from 'lucide-react'
import orbitLogo from '@/assets/brand/orbit-logo.png'
import { Focusable } from '@/components/focus/Focusable'
import { minimizeOrbitWindow } from '@/lib/tauri'
import type { OnboardingStep } from '../lib/onboardingSteps'
import { OnboardingEffects } from './OnboardingEffects'
import { OnboardingStepper } from './OnboardingStepper'

const WINDOW_CONTROL =
  'grid size-8 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white'

/** A card floating over Orbit (dimmed and blurred behind it), holding the
 * scenery, the logo, the window controls and the step dots.
 */
export function OnboardingFrame({
  step,
  onSkip,
  ready = true,
  overSplash = false,
  onSceneReady,
  children,
}: {
  step: OnboardingStep
  onSkip: () => void
  /** Everything has loaded: until then the card stays hidden behind the
   * backdrop and a spinner, so it appears whole rather than filling in. */
  ready?: boolean
  /** Over the startup splash: a lighter veil so the splash shows through,
   * blurred, and no spinner (the splash is the wait). */
  overSplash?: boolean
  onSceneReady?: () => void
  children: ReactNode
}) {
  const reduceMotion = useReducedMotion()
  return (
    <div
      className="onboarding fixed inset-0 z-[60] grid place-items-center overflow-clip p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div
        aria-hidden="true"
        className={
          overSplash
            ? 'absolute inset-0 bg-[rgb(6_5_8/0.38)] backdrop-blur-[18px]'
            : 'absolute inset-0 bg-[rgb(6_5_8/0.62)] backdrop-blur-[14px]'
        }
      />
      {!ready && !overSplash && (
        <div
          role="status"
          aria-label="Preparing setup"
          className="absolute inset-0 grid place-items-center text-[rgb(var(--orbit-fire-via))]"
        >
          <Spinner size={34} />
        </div>
      )}
      <motion.div
        data-ready={ready}
        inert={!ready}
        initial={false}
        animate={
          ready
            ? { opacity: 1, scale: 1, y: 0 }
            : { opacity: 0, scale: reduceMotion ? 1 : 0.97, y: reduceMotion ? 0 : 14 }
        }
        transition={{ duration: reduceMotion ? 0.15 : 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="onboarding-card relative isolate flex h-[min(700px,calc(100vh-48px))] w-[min(1080px,calc(100vw-48px))] flex-col overflow-clip rounded-[28px] border border-white/[0.1] bg-[linear-gradient(180deg,#1a1215,#0e0b0e_55%,#0a0809)] shadow-[0_50px_140px_rgb(0_0_0/0.7),inset_0_1px_0_rgb(255_255_255/0.07)] [container-type:size]"
      >
        <OnboardingEffects onSceneReady={onSceneReady} />
        <header className="relative z-10 flex items-center justify-between px-7 pt-6">
          <img src={orbitLogo} alt="Orbit" className="h-[26px] w-auto" />
          <div className="flex items-center gap-1">
            <Focusable
              focusId="onboarding-minimize"
              group="onboarding"
              order={199}
              noScale
              noRing
              onClick={() => void minimizeOrbitWindow()}
              aria-label="Minimize Orbit"
              title="Minimize"
              className={WINDOW_CONTROL}
            >
              <Minus size={18} />
            </Focusable>
            <Focusable
              focusId="onboarding-skip"
              group="onboarding"
              order={200}
              noScale
              noRing
              onClick={onSkip}
              aria-label="Skip setup"
              title="Skip setup"
              className={WINDOW_CONTROL}
            >
              <X size={18} />
            </Focusable>
          </div>
        </header>
        <div className="relative z-10 mt-1 flex justify-center">
          <OnboardingStepper step={step} />
        </div>
        <main className="onboarding-step relative z-10 mt-[clamp(10px,3cqh,28px)] flex min-h-0 flex-1 flex-col overflow-y-auto px-[clamp(20px,4cqw,44px)] pb-[clamp(16px,4cqh,30px)]">
          {children}
        </main>
      </motion.div>
    </div>
  )
}
