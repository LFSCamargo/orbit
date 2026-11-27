import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AppUpdateModal } from '@/components/runtime/AppUpdateModal'
import { DEFAULT_APP_PREFERENCES } from '@/lib/appPreferences'
import { useDownloadStore } from '@/lib/downloadProgress'
import { appUpdateCheck, appUpdateInstall, orbitWineUpdate } from '@/lib/tauri'
import { usePreferencesStore } from '@/stores/preferences.store'
import { useSessionStore } from '@/stores/session.store'
import { useAppUpdatePrompt } from '../useAppUpdatePrompt'
import { useOrbitWineUpdatePrompt } from '../useOrbitWineUpdatePrompt'

vi.mock('@/lib/tauri', () => ({
  appUpdateCheck: vi.fn(),
  appUpdateInstall: vi.fn(),
  orbitWineUpdate: vi.fn(),
  skipOrbitWineUpdate: vi.fn(),
  installOrbitWineVersion: vi.fn(),
}))
vi.mock('../../splash/useSplashHold', () => ({ useSplashActive: () => false }))

const update = {
  version: '2.6.1',
  currentVersion: '2.6.0',
  notes:
    '## Highlights\n- **Update from inside Orbit.** No more downloads from the site.',
  publishedAt: '2026-11-28T12:00:00Z',
}

/** The App's order: the Orbit dialog first, then Orbit Wine's. */
function Prompts() {
  const app = useAppUpdatePrompt()
  useOrbitWineUpdatePrompt(!app.settled)
  return (
    <AppUpdateModal
      update={app.update}
      busy={app.busy}
      task={app.task}
      error={app.error}
      onUpdate={() => void app.install()}
      onLater={app.later}
    />
  )
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(appUpdateCheck).mockResolvedValue(update)
  vi.mocked(appUpdateInstall).mockResolvedValue(undefined)
  vi.mocked(orbitWineUpdate).mockResolvedValue(null)
  useSessionStore.setState({ activeSession: null })
  useDownloadStore.setState({ tasks: {}, failures: {} })
  usePreferencesStore.setState({
    ready: true,
    preferences: { ...DEFAULT_APP_PREFERENCES, onboardingCompleted: true },
  })
})

afterEach(cleanup)

it('offers a newer Orbit with its release notes', async () => {
  render(<Prompts />, { wrapper })
  const dialog = await screen.findByRole('dialog', { name: 'Orbit 2.6.1 is here' })
  expect(dialog).toHaveTextContent('2.6.0')
  expect(dialog).toHaveTextContent('Released')
  expect(screen.getByText('Highlights')).toBeInTheDocument()
  expect(
    screen.getByText('Update from inside Orbit. No more downloads from the site.'),
  ).toBeInTheDocument()
})

it('installs the offered release with progress, as one tracked task', async () => {
  let progress!: (value: never) => void
  let finish!: () => void
  vi.mocked(appUpdateInstall).mockImplementation((_version, onProgress) => {
    progress = onProgress as never
    return new Promise((resolve) => {
      finish = () => resolve()
    })
  })
  render(<Prompts />, { wrapper })
  fireEvent.click(await screen.findByRole('button', { name: /Update and restart/ }))
  await waitFor(() =>
    expect(appUpdateInstall).toHaveBeenCalledWith('2.6.1', expect.any(Function)),
  )
  act(() =>
    progress({
      phase: 'Downloading',
      component: 'Orbit 2.6.1',
      downloadedBytes: 50,
      totalBytes: 100,
    } as never),
  )
  expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
  expect(screen.getByRole('button', { name: /Updating/ })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Later' })).toBeDisabled()
  act(() => finish())
})

it('shows a failed update in the dialog and lets the person try again', async () => {
  vi.mocked(appUpdateInstall).mockRejectedValueOnce(
    new Error('Quit the running game before updating Orbit'),
  )
  render(<Prompts />, { wrapper })
  fireEvent.click(await screen.findByRole('button', { name: /Update and restart/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Quit the running game')
  fireEvent.click(screen.getByRole('button', { name: /Update and restart/ }))
  await waitFor(() => expect(appUpdateInstall).toHaveBeenCalledTimes(2))
})

it('asks about Orbit Wine only after the Orbit dialog closes', async () => {
  render(<Prompts />, { wrapper })
  await screen.findByRole('dialog')
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(orbitWineUpdate).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Later' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  await waitFor(() => expect(orbitWineUpdate).toHaveBeenCalledTimes(1))
  expect(appUpdateInstall).not.toHaveBeenCalled()
})

it('goes straight to Orbit Wine when Orbit is current or offline', async () => {
  vi.mocked(appUpdateCheck).mockRejectedValue(new Error('offline'))
  render(<Prompts />, { wrapper })
  await waitFor(() => expect(orbitWineUpdate).toHaveBeenCalledTimes(1))
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('waits for a running game to end', async () => {
  useSessionStore.setState({ activeSession: { id: 's1' } as never })
  render(<Prompts />, { wrapper })
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(appUpdateCheck).not.toHaveBeenCalled()
  act(() => useSessionStore.setState({ activeSession: null }))
  await waitFor(() => expect(appUpdateCheck).toHaveBeenCalledTimes(1))
})
