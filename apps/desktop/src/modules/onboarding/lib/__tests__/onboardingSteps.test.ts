import { expect, it } from 'vitest'
import {
  ONBOARDING_STEPS,
  nextStep,
  previousStep,
  stepperState,
} from '../onboardingSteps'

it('walks Welcome → Setup → Account → Recommended → Scan', () => {
  expect(ONBOARDING_STEPS.map((s) => s.id)).toEqual([
    'welcome',
    'setup',
    'account',
    'recommended',
    'scan',
  ])
  expect(nextStep('welcome')).toBe('setup')
  expect(nextStep('recommended')).toBe('scan')
  expect(nextStep('scan')).toBeNull()
})

it('goes back one step, and nowhere from Welcome', () => {
  expect(previousStep('account')).toBe('setup')
  expect(previousStep('welcome')).toBeNull()
})

it('marks finished, current and upcoming steps for the stepper', () => {
  expect(stepperState('account').map((s) => s.state)).toEqual([
    'done',
    'done',
    'current',
    'upcoming',
    'upcoming',
  ])
})
