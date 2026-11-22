import { describe, expect, it } from 'vitest'
import {
  DEFAULT_APP_PREFERENCES,
  parseAppPreferences,
  resolveAppPreferences,
} from '../appPreferences'

describe('parseAppPreferences', () => {
  it('fills fields a saved value does not have yet', () => {
    expect(parseAppPreferences({ onboardingCompleted: true })).toEqual({
      ...DEFAULT_APP_PREFERENCES,
      onboardingCompleted: true,
    })
  })

  it('reads JSON text, as the browser build stores it', () => {
    expect(parseAppPreferences('{"scanOnStartup":false}')?.scanOnStartup).toBe(false)
  })

  it('ignores fields of the wrong type', () => {
    expect(parseAppPreferences({ scanOnStartup: 'yes' })?.scanOnStartup).toBe(
      DEFAULT_APP_PREFERENCES.scanOnStartup,
    )
  })

  it('keeps Orbit updates on for preferences saved before the option existed', () => {
    expect(parseAppPreferences({ scanOnStartup: false })?.autoUpdateApp).toBe(true)
    expect(parseAppPreferences({ autoUpdateApp: false })?.autoUpdateApp).toBe(false)
  })

  it('treats a missing or broken value as never saved', () => {
    expect(parseAppPreferences(null)).toBeNull()
    expect(parseAppPreferences('not json')).toBeNull()
    expect(parseAppPreferences([1, 2])).toBeNull()
  })
})

describe('resolveAppPreferences', () => {
  const fresh = { hasGames: false, hasManagedWine: false }

  it('starts a fresh install on onboarding with the recommended toggles on', () => {
    const { preferences, migrated } = resolveAppPreferences(null, fresh)
    expect(migrated).toBe(false)
    expect(preferences.onboardingCompleted).toBe(false)
    expect(preferences.scanOnStartup).toBe(true)
    expect(preferences.autoUpdateRuntimes).toBe(true)
    expect(preferences.autoUpdateApp).toBe(true)
  })

  it('skips onboarding for an existing library without turning on new background work', () => {
    for (const existing of [
      { hasGames: true, hasManagedWine: false },
      { hasGames: false, hasManagedWine: true },
    ]) {
      const { preferences, migrated } = resolveAppPreferences(null, existing)
      expect(migrated).toBe(true)
      expect(preferences.onboardingCompleted).toBe(true)
      expect(preferences.scanOnStartup).toBe(false)
      expect(preferences.autoUpdateRuntimes).toBe(false)
      // Orbit's own updates only download; nothing changes until Restart.
      expect(preferences.autoUpdateApp).toBe(true)
    }
  })

  it('keeps saved preferences as they are, even with games present', () => {
    const saved = { ...DEFAULT_APP_PREFERENCES, onboardingCompleted: false }
    const { preferences, migrated } = resolveAppPreferences(saved, {
      hasGames: true,
      hasManagedWine: true,
    })
    expect(migrated).toBe(false)
    expect(preferences).toEqual(saved)
  })
})
