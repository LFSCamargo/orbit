import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DEFAULT_APP_PREFERENCES, saveAppPreferences } from '@/lib/appPreferences'
import { usePreferencesStore } from '@/stores/preferences.store'
import { useUiStore } from '@/stores/ui.store'
import { GeneralPreferences } from '../GeneralPreferences'

vi.mock('@/lib/appPreferences', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/appPreferences')>()),
  saveAppPreferences: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(saveAppPreferences).mockReset().mockResolvedValue(undefined)
  usePreferencesStore.setState({
    ready: true,
    preferences: { ...DEFAULT_APP_PREFERENCES, onboardingCompleted: true },
  })
  useUiStore.setState({ onboardingOpen: false })
})

afterEach(cleanup)

it('turns scanning on startup and runtime updates off and on', () => {
  render(<GeneralPreferences />)
  fireEvent.click(screen.getByRole('switch', { name: 'Scan for new games on startup' }))
  expect(usePreferencesStore.getState().preferences.scanOnStartup).toBe(false)
  fireEvent.click(screen.getByRole('switch', { name: 'Update runtimes automatically' }))
  expect(usePreferencesStore.getState().preferences.autoUpdateRuntimes).toBe(false)
  expect(saveAppPreferences).toHaveBeenCalledTimes(2)
})

it('replays onboarding without forgetting that it was completed', () => {
  render(<GeneralPreferences />)
  fireEvent.click(screen.getByRole('button', { name: 'Show onboarding' }))
  expect(useUiStore.getState().onboardingOpen).toBe(true)
  expect(usePreferencesStore.getState().preferences.onboardingCompleted).toBe(true)
})

it('gives each toggle a stable controller focus id, the first being Settings’ entry', async () => {
  const { screenEntryFocusId } = await import('@/lib/navigation')
  render(<GeneralPreferences />)
  const scan = screen.getByRole('switch', { name: 'Scan for new games on startup' })
  expect(scan).toHaveAttribute('data-focus-id', 'settings-pref-scanOnStartup')
  expect(screenEntryFocusId('settings')).toBe('settings-pref-scanOnStartup')
  expect(
    screen.getByRole('switch', { name: 'Update runtimes automatically' }),
  ).toHaveAttribute('data-focus-id', 'settings-pref-autoUpdateRuntimes')
})
