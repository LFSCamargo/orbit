import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { OrbitWineUpdateModal } from '@/components/runtime/OrbitWineUpdateModal'
import { DEFAULT_APP_PREFERENCES } from '@/lib/appPreferences'
import { useDownloadStore } from '@/lib/downloadProgress'
import {
  installOrbitWineVersion,
  orbitWineUpdate,
  skipOrbitWineUpdate,
} from '@/lib/tauri'
import { usePreferencesStore } from '@/stores/preferences.store'
import { useSessionStore } from '@/stores/session.store'
import type { GameSession } from '@/types/game'
import { useOrbitWineUpdatePrompt } from '../useOrbitWineUpdatePrompt'

vi.mock('@/lib/tauri', () => ({
  orbitWineUpdate: vi.fn(),
  skipOrbitWineUpdate: vi.fn(),
  installOrbitWineVersion: vi.fn(),
}))
vi.mock('../../splash/useSplashHold', () => ({ useSplashActive: () => false }))

const update = {
  version: '26.3.0-2',
  installedVersion: '26.3.0',
  sizeBytes: 471_415_963,
  notes:
    'New in this build:\n- Games stop crackling under Rosetta.\n- 2.4 GHz pads reach games.',
  publishedAt: '2026-11-27T20:00:05Z',
  releaseUrl: 'https://github.com/LFSCamargo/orbit/releases/tag/orbit-wine-v26.3.0-2',
}

function Prompt() {
  const prompt = useOrbitWineUpdatePrompt()
  return (
    <OrbitWineUpdateModal
      update={prompt.update}
      onAccept={prompt.accept}
      onKeep={prompt.keep}
      onLater={prompt.later}
    />
  )
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

function prefs(patch: Partial<typeof DEFAULT_APP_PREFERENCES> = {}) {
  usePreferencesStore.setState({
    ready: true,
    preferences: { ...DEFAULT_APP_PREFERENCES, onboardingCompleted: true, ...patch },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(orbitWineUpdate).mockResolvedValue(update)
  vi.mocked(skipOrbitWineUpdate).mockResolvedValue(undefined)
  vi.mocked(installOrbitWineVersion).mockResolvedValue(undefined)
  useSessionStore.setState({ activeSession: null })
  useDownloadStore.setState({ tasks: {}, failures: {} })
  prefs()
})

afterEach(cleanup)

it('shows the release notes of a newer Orbit Wine build when Orbit opens', async () => {
  render(<Prompt />, { wrapper })
  const dialog = await screen.findByRole('dialog', {
    name: 'A better runtime for your games',
  })
  expect(dialog).toHaveTextContent('26.3.0')
  expect(dialog).toHaveTextContent('26.3.0-2')
  expect(dialog).toHaveTextContent('471 MB download')
  expect(screen.getByText('Games stop crackling under Rosetta.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Release page/ })).toHaveAttribute(
    'href',
    update.releaseUrl,
  )
  expect(orbitWineUpdate).toHaveBeenCalledTimes(1)
})

it('downloads the build when accepted, as the Orbit Wine task', async () => {
  render(<Prompt />, { wrapper })
  fireEvent.click(await screen.findByRole('button', { name: /Download update/ }))
  await waitFor(() =>
    expect(installOrbitWineVersion).toHaveBeenCalledWith(
      '26.3.0-2',
      expect.any(Function),
    ),
  )
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(skipOrbitWineUpdate).not.toHaveBeenCalled()
})

it('keeps the installed build and stops offering this one', async () => {
  render(<Prompt />, { wrapper })
  fireEvent.click(await screen.findByRole('button', { name: 'Keep 26.3.0' }))
  await waitFor(() => expect(skipOrbitWineUpdate).toHaveBeenCalledWith('26.3.0-2'))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(installOrbitWineVersion).not.toHaveBeenCalled()
})

it('closes on Escape without keeping or downloading, so it asks next launch', async () => {
  render(<Prompt />, { wrapper })
  await screen.findByRole('dialog')
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  })
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(skipOrbitWineUpdate).not.toHaveBeenCalled()
  expect(installOrbitWineVersion).not.toHaveBeenCalled()
})

it('waits for onboarding and for a running game to end', async () => {
  prefs({ onboardingCompleted: false })
  const { unmount } = render(<Prompt />, { wrapper })
  useSessionStore.setState({ activeSession: { id: 's1' } as GameSession })
  prefs()
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(orbitWineUpdate).not.toHaveBeenCalled()
  act(() => useSessionStore.setState({ activeSession: null }))
  await waitFor(() => expect(orbitWineUpdate).toHaveBeenCalledTimes(1))
  unmount()
})

it('shows nothing when Orbit Wine is current or GitHub is unreachable', async () => {
  vi.mocked(orbitWineUpdate).mockResolvedValue(null)
  render(<Prompt />, { wrapper })
  await waitFor(() => expect(orbitWineUpdate).toHaveBeenCalled())
  cleanup()
  vi.mocked(orbitWineUpdate).mockRejectedValue(new Error('offline'))
  render(<Prompt />, { wrapper })
  await waitFor(() => expect(orbitWineUpdate).toHaveBeenCalledTimes(2))
  expect(screen.queryByRole('dialog')).toBeNull()
})
