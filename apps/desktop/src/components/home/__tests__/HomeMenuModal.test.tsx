import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_APP_PREFERENCES } from '@/lib/appPreferences'
import { appUpdateRestart, openXboxCloud } from '@/lib/tauri'
import { useAppUpdateStore } from '@/stores/appUpdate.store'
import { usePreferencesStore } from '@/stores/preferences.store'
import { useUiStore } from '@/stores/ui.store'
import { useXcloudPlayerStore } from '@/stores/xcloudPlayer.store'
import { HomeMenuModal } from '../HomeMenuModal'

vi.mock('@/lib/tauri', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tauri')>()),
  openXboxCloud: vi.fn(),
  appUpdateRestart: vi.fn(),
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

it('offers Xbox Cloud Gaming once it was opened from Settings', () => {
  usePreferencesStore.setState({
    ready: true,
    preferences: {
      ...DEFAULT_APP_PREFERENCES,
      onboardingCompleted: true,
      xboxCloudConnected: true,
    },
  })
  renderMenu()
  expect(screen.getByRole('button', { name: /Xbox Cloud Gaming/ })).toBeInTheDocument()
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

describe('a downloaded Orbit update', () => {
  beforeEach(() => {
    usePreferencesStore.setState({
      ready: true,
      preferences: { ...DEFAULT_APP_PREFERENCES, onboardingCompleted: true },
    })
    vi.mocked(appUpdateRestart).mockReset().mockResolvedValue(undefined)
  })
  afterEach(() => useAppUpdateStore.setState({ state: { status: 'idle' } }))

  it('is offered as Restart to update and installs on select', () => {
    useAppUpdateStore.setState({
      state: { status: 'ready', version: '2.2.0', notes: null },
    })
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /^Restart to update/ }))
    expect(appUpdateRestart).toHaveBeenCalled()
  })

  it('is not offered before it is ready', () => {
    useAppUpdateStore.setState({
      state: { status: 'downloading', version: '2.2.0', downloaded: 1, total: 2 },
    })
    renderMenu()
    expect(screen.queryByRole('button', { name: /Restart to update/ })).toBeNull()
  })
})

describe('during a cloud game', () => {
  beforeEach(() => {
    usePreferencesStore.setState({
      ready: true,
      preferences: { ...DEFAULT_APP_PREFERENCES, onboardingCompleted: true },
    })
    useXcloudPlayerStore.setState({
      stream: { productId: '9NVQBQ3F6W9W', title: 'Call of Duty' },
      paused: true,
    })
  })
  afterEach(() => useXcloudPlayerStore.setState({ stream: null, paused: false }))

  it('offers Continue, Stop game and Back to Orbit for the paused stream', () => {
    renderMenu()
    expect(screen.getByRole('heading', { name: 'Call of Duty' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Continue/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Stop game/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Back to Orbit/ })).toBeInTheDocument()
  })

  it('Continue goes back into the stream', () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /^Continue/ }))
    expect(useXcloudPlayerStore.getState()).toMatchObject({ paused: false })
    expect(useXcloudPlayerStore.getState().stream).not.toBeNull()
    expect(useUiStore.getState().homeMenuOpen).toBe(false)
  })

  it('Stop game ends the stream', () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /^Stop game/ }))
    expect(useXcloudPlayerStore.getState().stream).toBeNull()
    expect(useUiStore.getState().homeMenuOpen).toBe(false)
  })

  it('Back to Orbit keeps the stream paused in the background', () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /^Back to Orbit/ }))
    expect(useXcloudPlayerStore.getState()).toMatchObject({ paused: true })
    expect(useXcloudPlayerStore.getState().stream).not.toBeNull()
    expect(useUiStore.getState().homeMenuOpen).toBe(false)
  })
})
