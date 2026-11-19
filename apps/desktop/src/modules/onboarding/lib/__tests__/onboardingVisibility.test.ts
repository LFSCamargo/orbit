import { beforeEach, expect, it } from 'vitest'
import { DEFAULT_APP_PREFERENCES } from '@/lib/appPreferences'
import { usePreferencesStore } from '@/stores/preferences.store'
import { useUiStore } from '@/stores/ui.store'
import { onboardingAllows, onboardingVisible } from '../onboardingVisibility'

beforeEach(() => {
  usePreferencesStore.setState({
    ready: true,
    preferences: { ...DEFAULT_APP_PREFERENCES, onboardingCompleted: true },
  })
  useUiStore.setState({ onboardingOpen: false })
})

it('shows on first run and when replayed from Settings', () => {
  expect(onboardingVisible()).toBe(false)
  useUiStore.setState({ onboardingOpen: true })
  expect(onboardingVisible()).toBe(true)
  useUiStore.setState({ onboardingOpen: false })
  usePreferencesStore.setState({
    preferences: { ...DEFAULT_APP_PREFERENCES, onboardingCompleted: false },
  })
  expect(onboardingVisible()).toBe(true)
})

it('waits for preferences before deciding', () => {
  usePreferencesStore.setState({
    ready: false,
    preferences: { ...DEFAULT_APP_PREFERENCES, onboardingCompleted: false },
  })
  expect(onboardingVisible()).toBe(false)
})

it('lets the controller move, select and go back, but not leave onboarding', () => {
  for (const action of [
    'navigate-up',
    'navigate-down',
    'navigate-left',
    'navigate-right',
    'confirm',
    'back',
  ] as const) {
    expect(onboardingAllows(action)).toBe(true)
  }
  for (const action of [
    'menu',
    'home',
    'section-prev',
    'section-next',
    'secondary',
    'context',
  ] as const) {
    expect(onboardingAllows(action)).toBe(false)
  }
})
