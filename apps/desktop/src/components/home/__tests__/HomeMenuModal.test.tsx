import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DEFAULT_APP_PREFERENCES } from '@/lib/appPreferences'
import { openXboxCloud } from '@/lib/tauri'
import { usePreferencesStore } from '@/stores/preferences.store'
import { useUiStore } from '@/stores/ui.store'
import { HomeMenuModal } from '../HomeMenuModal'

vi.mock('@/lib/tauri', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tauri')>()),
  openXboxCloud: vi.fn(),
}))

function renderMenu() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <HomeMenuModal family="xbox" />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.mocked(openXboxCloud).mockReset().mockResolvedValue(undefined)
  useUiStore.setState({ homeMenuOpen: true })
})

afterEach(cleanup)

it('keeps Xbox Cloud Gaming out of the menu while it is coming soon', () => {
  usePreferencesStore.setState({
    ready: true,
    preferences: {
      ...DEFAULT_APP_PREFERENCES,
      onboardingCompleted: true,
      xboxCloudConnected: true,
    },
  })
  renderMenu()
  expect(
    screen.queryByRole('button', { name: /Xbox Cloud Gaming/ }),
  ).not.toBeInTheDocument()
  expect(openXboxCloud).not.toHaveBeenCalled()
})

it('leaves it out until then', () => {
  usePreferencesStore.setState({
    ready: true,
    preferences: { ...DEFAULT_APP_PREFERENCES, onboardingCompleted: true },
  })
  renderMenu()
  expect(
    screen.queryByRole('button', { name: /Xbox Cloud Gaming/ }),
  ).not.toBeInTheDocument()
})
