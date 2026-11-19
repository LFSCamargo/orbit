/** The guided first run, in order. Each step owns its own sub-states. */
export const ONBOARDING_STEPS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'setup', label: 'Setup' },
  { id: 'account', label: 'Account' },
  { id: 'recommended', label: 'Recommended' },
  { id: 'scan', label: 'Scan Games' },
] as const

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]['id']

const order = ONBOARDING_STEPS.map((step) => step.id)

export function nextStep(step: OnboardingStep): OnboardingStep | null {
  return order[order.indexOf(step) + 1] ?? null
}

export function previousStep(step: OnboardingStep): OnboardingStep | null {
  const index = order.indexOf(step)
  return index > 0 ? order[index - 1] : null
}

export function stepperState(current: OnboardingStep) {
  const at = order.indexOf(current)
  return ONBOARDING_STEPS.map((step, index) => ({
    ...step,
    state: index < at ? 'done' : index === at ? 'current' : 'upcoming',
  })) as { id: OnboardingStep; label: string; state: 'done' | 'current' | 'upcoming' }[]
}
