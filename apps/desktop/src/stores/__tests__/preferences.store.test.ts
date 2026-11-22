import { beforeEach, expect, it, vi } from 'vitest'
import { loadAppPreferences, saveAppPreferences } from '@/lib/appPreferences'
import { usePreferencesStore } from '../preferences.store'

vi.mock('@/lib/appPreferences', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/appPreferences')>()),
  loadAppPreferences: vi.fn(),
  saveAppPreferences: vi.fn(),
}))

beforeEach(() => {
  usePreferencesStore.setState(usePreferencesStore.getInitialState())
  vi.mocked(saveAppPreferences).mockReset().mockResolvedValue(undefined)
})

it('is not ready until preferences load', async () => {
  vi.mocked(loadAppPreferences).mockResolvedValue({
    onboardingCompleted: true,
    scanOnStartup: false,
    autoUpdateRuntimes: true,
    autoUpdateApp: true,
    xboxCloudConnected: false,
  })
  expect(usePreferencesStore.getState().ready).toBe(false)
  await usePreferencesStore.getState().hydrate()
  expect(usePreferencesStore.getState().ready).toBe(true)
  expect(usePreferencesStore.getState().preferences.onboardingCompleted).toBe(true)
})

it('still becomes ready with defaults when loading fails', async () => {
  vi.mocked(loadAppPreferences).mockRejectedValue(new Error('db locked'))
  await usePreferencesStore.getState().hydrate()
  expect(usePreferencesStore.getState().ready).toBe(true)
  expect(usePreferencesStore.getState().preferences.onboardingCompleted).toBe(false)
})

it('saves a merged update', async () => {
  await usePreferencesStore.getState().update({ scanOnStartup: false })
  expect(usePreferencesStore.getState().preferences.scanOnStartup).toBe(false)
  expect(saveAppPreferences).toHaveBeenCalledWith(
    expect.objectContaining({ scanOnStartup: false }),
  )
})
