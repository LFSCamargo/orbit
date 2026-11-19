import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DEFAULT_APP_PREFERENCES, saveAppPreferences } from '@/lib/appPreferences'
import { openXboxCloud } from '@/lib/tauri'
import { usePreferencesStore } from '@/stores/preferences.store'
import { XboxCloudSettings } from '../XboxCloudSettings'

vi.mock('@/lib/appPreferences', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/appPreferences')>()),
  saveAppPreferences: vi.fn(),
}))
vi.mock('@/lib/tauri', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tauri')>()),
  openXboxCloud: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(saveAppPreferences).mockReset().mockResolvedValue(undefined)
  vi.mocked(openXboxCloud).mockReset().mockResolvedValue(undefined)
  usePreferencesStore.setState({
    ready: true,
    preferences: { ...DEFAULT_APP_PREFERENCES, onboardingCompleted: true },
  })
})

afterEach(cleanup)

it('opens Xbox Cloud Gaming and remembers it for the Home menu', async () => {
  render(<XboxCloudSettings />)
  fireEvent.click(screen.getByRole('button', { name: 'Open Xbox Cloud Gaming' }))
  await waitFor(() =>
    expect(usePreferencesStore.getState().preferences.xboxCloudConnected).toBe(true),
  )
  expect(openXboxCloud).toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Remove from Orbit' })).toBeInTheDocument()
})

it('removes it from the Home menu', () => {
  usePreferencesStore.setState({
    preferences: {
      ...DEFAULT_APP_PREFERENCES,
      onboardingCompleted: true,
      xboxCloudConnected: true,
    },
  })
  render(<XboxCloudSettings />)
  fireEvent.click(screen.getByRole('button', { name: 'Remove from Orbit' }))
  expect(usePreferencesStore.getState().preferences.xboxCloudConnected).toBe(false)
})

it('shows when the window cannot open', async () => {
  vi.mocked(openXboxCloud).mockRejectedValue(new Error('no webview'))
  render(<XboxCloudSettings />)
  fireEvent.click(screen.getByRole('button', { name: 'Open Xbox Cloud Gaming' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/could not open/i)
  expect(usePreferencesStore.getState().preferences.xboxCloudConnected).toBe(false)
})
