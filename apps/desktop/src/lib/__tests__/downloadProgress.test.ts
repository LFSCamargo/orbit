import { beforeEach, expect, it, vi } from 'vitest'
import {
  downloadPercent,
  downloadStatus,
  downloadStep,
  elapsedSeconds,
  formatDuration,
  formatTransferRate,
  formatTransferSize,
  selectActive,
  selectBusy,
  selectCompleted,
  timeLeft,
  transferRate,
  useDownloadStore,
  type DownloadTask,
} from '@/lib/downloadProgress'

function task(partial: Partial<DownloadTask> = {}): DownloadTask {
  return {
    key: 'component:dxvk:v2.3',
    label: 'dxvk v2.3',
    progress: null,
    startedAt: '2026-11-12T00:00:00.000Z',
    rate: null,
    ...partial,
  }
}

beforeEach(() => {
  useDownloadStore.setState({ tasks: {}, failures: {} })
})

it('reports a percentage whenever the total size is known', () => {
  expect(
    downloadPercent({
      phase: 'Downloading',
      component: 'dxvk',
      downloadedBytes: 50,
      totalBytes: 200,
    }),
  ).toBe(25)
  expect(
    downloadPercent({
      phase: 'Downloading',
      component: 'dxvk',
      downloadedBytes: 10,
      totalBytes: 0,
    }),
  ).toBeNull()
  expect(downloadPercent(null)).toBeNull()
})

it('keeps clamps and byte counts in the spoken status', () => {
  expect(
    downloadStatus(
      task({
        progress: {
          phase: 'Downloading',
          component: 'dxvk v2.3',
          downloadedBytes: 1_000_000,
          totalBytes: 4_000_000,
        },
      }),
    ),
  ).toBe('Downloading dxvk v2.3 · 25% · 1.0 MB / 4.0 MB')
  expect(downloadStatus(task())).toBe('Preparing dxvk v2.3…')
  expect(
    downloadStatus(task({ progress: { phase: 'Verifying', component: 'dxvk' } })),
  ).toBe('Checking the download of dxvk v2.3…')
  expect(
    downloadStatus(task({ progress: { phase: 'Extracting', component: 'dxvk' } })),
  ).toBe('Unpacking dxvk v2.3…')
  expect(
    downloadStatus(task({ progress: { phase: 'Installing', component: 'dxvk' } })),
  ).toBe('Finishing setup for dxvk v2.3…')
})

it('tracks, completes and clears transfers by key', () => {
  const store = useDownloadStore.getState()
  store.start({ key: 'a', label: 'A' })
  expect(Object.keys(useDownloadStore.getState().tasks)).toEqual(['a'])
  useDownloadStore.getState().update('a', {
    phase: 'Downloading',
    component: 'A',
    downloadedBytes: 1,
    totalBytes: 2,
  })
  expect(useDownloadStore.getState().tasks.a.progress?.phase).toBe('Downloading')
  useDownloadStore.getState().finish('a')
  expect(useDownloadStore.getState().tasks.a.progress?.phase).toBe('Ready')

  useDownloadStore.getState().start({ key: 'b', label: 'B' })
  useDownloadStore.getState().fail('b', 'disk full')
  expect(useDownloadStore.getState().tasks.b).toBeUndefined()
  expect(useDownloadStore.getState().failures.b).toBe('disk full')

  // A retry clears the recorded failure for that key only.
  useDownloadStore.getState().start({ key: 'b', label: 'B' })
  expect(useDownloadStore.getState().failures.b).toBeUndefined()
  expect(useDownloadStore.getState().failures.a).toBeUndefined()
})

it('computes a transfer rate only after a stable sample', () => {
  expect(transferRate(null, { at: 1_000, bytes: 100 })).toBeNull()
  expect(transferRate({ at: 0, bytes: 0 }, { at: 100, bytes: 5_000 })).toBeNull()
  expect(transferRate({ at: 0, bytes: 1_000 }, { at: 1_000, bytes: 1_500_000 })).toBe(
    1_499_000,
  )
  expect(formatTransferRate(null)).toBe('Idle')
  expect(formatTransferRate(1_499_000)).toBe('1.5 MB/s')
})

it('keeps a percentage for every phase that reports bytes', () => {
  expect(
    downloadPercent({
      phase: 'Verifying',
      component: 'God of War',
      downloadedBytes: 30,
      totalBytes: 60,
    }),
  ).toBe(50)
  expect(
    downloadPercent({
      phase: 'Installing',
      component: 'God of War',
      message: 'Allocating disk space',
      downloadedBytes: 1,
      totalBytes: 4,
    }),
  ).toBe(25)
  expect(downloadPercent({ phase: 'Installing', component: 'God of War' })).toBeNull()
  expect(
    downloadPercent({ phase: 'Ready', component: 'God of War', message: 'Installed' }),
  ).toBe(100)
})

it('reads out unknown totals and native step messages without fake zeros', () => {
  expect(
    downloadStatus(
      task({
        progress: {
          phase: 'Downloading',
          component: 'Steam',
          downloadedBytes: 2_500_000,
          totalBytes: 0,
        },
      }),
    ),
  ).toBe('Downloading dxvk v2.3 · 2.5 MB')
  expect(
    downloadStatus(
      task({
        progress: { phase: 'Installing', component: 'x', message: 'Updating SteamCMD' },
      }),
    ),
  ).toBe('Updating SteamCMD · dxvk v2.3…')
  expect(
    downloadStatus(
      task({
        progress: {
          phase: 'Verifying',
          component: 'x',
          downloadedBytes: 1,
          totalBytes: 4,
        },
      }),
    ),
  ).toBe('Checking the download of dxvk v2.3 · 25%')
  expect(formatTransferSize(42_100_000_000)).toBe('42.1 GB')
  expect(formatTransferSize(512)).toBe('512 B')
})

it('separates finished transfers so they never block new ones', () => {
  const ready = task({
    key: 'a',
    progress: { phase: 'Ready', component: 'A', message: 'Installed' },
  })
  const running = task({ key: 'b', progress: null })
  const tasks = { a: ready, b: running }
  expect(selectActive(tasks).map((item) => item.key)).toEqual(['b'])
  expect(selectCompleted(tasks).map((item) => item.key)).toEqual(['a'])
  expect(selectBusy({ a: ready })).toBe(false)
  expect(selectBusy(tasks)).toBe(true)

  useDownloadStore.setState({ tasks, failures: {} })
  useDownloadStore.getState().clearCompleted()
  expect(Object.keys(useDownloadStore.getState().tasks)).toEqual(['b'])
})

it('measures each download’s own speed from its byte updates', () => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const store = useDownloadStore.getState()
  store.start({ key: 'steam:312990', label: 'The Expendabros' })
  const at = (ms: number, bytes: number) => {
    vi.setSystemTime(ms)
    useDownloadStore.getState().update('steam:312990', {
      phase: 'Downloading',
      component: 'x',
      downloadedBytes: bytes,
      totalBytes: 129_000_000,
    })
  }
  at(0, 0)
  expect(useDownloadStore.getState().tasks['steam:312990'].rate).toBeNull()
  at(1_000, 10_000_000)
  expect(useDownloadStore.getState().tasks['steam:312990'].rate).toBe(10_000_000)
  at(2_000, 30_000_000)
  // Smoothed so one burst does not swing the readout.
  expect(useDownloadStore.getState().tasks['steam:312990'].rate).toBe(14_000_000)
  useDownloadStore
    .getState()
    .update('steam:312990', { phase: 'Verifying', component: 'x' })
  expect(useDownloadStore.getState().tasks['steam:312990'].rate).toBeNull()
  vi.useRealTimers()
})

it('names each step of a Steam game download', () => {
  const steam = (progress: DownloadTask['progress']) =>
    downloadStep(task({ key: 'steam:312990', progress }))
  expect(steam(null)).toEqual({ index: 1, count: 7, label: 'Preparing' })
  expect(
    steam({ phase: 'Installing', component: 'x', message: 'Signing in to Steam' }),
  ).toMatchObject({ index: 2, label: 'Signing in to Steam' })
  expect(
    steam({ phase: 'Installing', component: 'x', message: 'Starting download' }),
  ).toMatchObject({ index: 3, label: 'Starting download' })
  expect(
    steam({ phase: 'Installing', component: 'x', message: 'Allocating disk space' }),
  ).toMatchObject({ index: 4 })
  expect(
    steam({ phase: 'Downloading', component: 'x', downloadedBytes: 1, totalBytes: 2 }),
  ).toMatchObject({ index: 5, label: 'Downloading' })
  expect(steam({ phase: 'Verifying', component: 'x' })).toMatchObject({ index: 6 })
  expect(
    steam({ phase: 'Installing', component: 'x', message: 'Installing files' }),
  ).toMatchObject({ index: 7, label: 'Installing files' })
  expect(downloadStep(task({ key: 'component:dxvk:2.3' }))).toBeNull()
})

it('uses the rate the backend measured, including a stalled zero', () => {
  const store = useDownloadStore.getState()
  store.start({ key: 'steam:312990', label: 'The Expendabros' })
  const progress = (bytesPerSecond: number) =>
    useDownloadStore.getState().update('steam:312990', {
      phase: 'Downloading',
      component: 'x',
      downloadedBytes: 50,
      totalBytes: 100,
      bytesPerSecond,
    })
  progress(4_200_000)
  expect(useDownloadStore.getState().tasks['steam:312990'].rate).toBe(4_200_000)
  progress(0)
  // Regression: an unchanged byte count used to keep the last speed forever.
  expect(useDownloadStore.getState().tasks['steam:312990'].rate).toBe(0)
})

it('estimates time left and formats elapsed time', () => {
  const downloading = {
    phase: 'Downloading' as const,
    component: 'x',
    downloadedBytes: 40_000_000,
    totalBytes: 100_000_000,
  }
  expect(timeLeft(downloading, 2_000_000)).toBe(30)
  expect(timeLeft(downloading, 0)).toBeNull()
  expect(timeLeft(downloading, null)).toBeNull()
  expect(timeLeft({ phase: 'Verifying', component: 'x' }, 5)).toBeNull()
  expect(
    elapsedSeconds('2026-11-12T00:00:00.000Z', Date.parse('2026-11-12T00:01:05.900Z')),
  ).toBe(65)
  expect(elapsedSeconds('not a date', 0)).toBe(0)
  expect(formatDuration(42)).toBe('0:42')
  expect(formatDuration(725)).toBe('12:05')
  expect(formatDuration(3723)).toBe('1:02:03')
})
