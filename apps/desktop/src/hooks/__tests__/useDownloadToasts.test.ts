import { afterEach, expect, it, vi } from 'vitest'
import { syncDownloadToasts } from '../useDownloadToasts'
import type { DownloadTask } from '@/lib/downloadProgress'

vi.mock('@/lib/toast', () => ({
  notify: {
    progress: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}))
import { notify } from '@/lib/toast'

afterEach(() => vi.clearAllMocks())

const task = (
  progress: DownloadTask['progress'],
  rate: number | null = null,
): DownloadTask => ({
  key: 'steam:312990',
  label: 'The Expendabros',
  startedAt: '2026-11-17T00:00:00Z',
  progress,
  rate,
})
const empty = { tasks: {}, failures: {} }

it('shows one progress toast per transfer and finishes it as success', () => {
  const signing = task({
    phase: 'Installing',
    component: 'x',
    message: 'Signing in to Steam',
  })
  syncDownloadToasts(empty, { tasks: { [signing.key]: signing }, failures: {} })
  expect(notify.progress).toHaveBeenLastCalledWith({
    id: 'steam:312990',
    title: 'The Expendabros',
    caption: 'Step 2 of 7 · Signing in to Steam',
    message: undefined,
    value: null,
  })
  const running = task(
    {
      phase: 'Downloading',
      component: 'x',
      downloadedBytes: 64_000_000,
      totalBytes: 128_000_000,
    },
    12_300_000,
  )
  syncDownloadToasts(
    { tasks: { [signing.key]: signing }, failures: {} },
    { tasks: { [running.key]: running }, failures: {} },
  )
  expect(notify.progress).toHaveBeenLastCalledWith({
    id: 'steam:312990',
    title: 'The Expendabros',
    caption: 'Step 5 of 7 · Downloading',
    message: '12.3 MB/s · 64.0 MB / 128.0 MB · 6s left',
    value: 50,
  })
  const done = task({ phase: 'Ready', component: 'x', message: 'Installed' })
  syncDownloadToasts(
    { tasks: { [running.key]: running }, failures: {} },
    { tasks: { [done.key]: done }, failures: {} },
  )
  expect(notify.success).toHaveBeenCalledWith(
    { title: 'The Expendabros', message: 'Installed' },
    { id: 'steam:312990' },
  )
})

it('turns a failure into an error toast and a cancel into a dismissal', () => {
  const running = task(null)
  const before = { tasks: { [running.key]: running }, failures: {} }
  syncDownloadToasts(before, {
    tasks: {},
    failures: { 'steam:312990': 'Steam refused the login.' },
  })
  expect(notify.error).toHaveBeenCalledWith(
    { title: 'The Expendabros did not finish', message: 'Steam refused the login.' },
    { id: 'steam:312990' },
  )
  syncDownloadToasts(before, empty)
  expect(notify.dismiss).toHaveBeenCalledWith('steam:312990')
})

it('stays quiet while onboarding shows its own install progress', async () => {
  const { renderHook, cleanup } = await import('@testing-library/react')
  const { useDownloadToasts } = await import('../useDownloadToasts')
  const { useDownloadStore } = await import('@/lib/downloadProgress')
  const { usePreferencesStore } = await import('@/stores/preferences.store')
  const { DEFAULT_APP_PREFERENCES } = await import('@/lib/appPreferences')
  usePreferencesStore.setState({
    ready: true,
    preferences: { ...DEFAULT_APP_PREFERENCES },
  })
  renderHook(() => useDownloadToasts())
  useDownloadStore.getState().fail('component:dxmt:v1', 'offline')
  expect(notify.error).not.toHaveBeenCalled()

  usePreferencesStore.setState({
    preferences: { ...DEFAULT_APP_PREFERENCES, onboardingCompleted: true },
  })
  useDownloadStore.getState().fail('component:dxmt:v1', 'still offline')
  expect(notify.error).toHaveBeenCalledTimes(1)
  cleanup()
})
