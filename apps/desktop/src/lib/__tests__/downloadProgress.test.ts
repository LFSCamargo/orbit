import { beforeEach, expect, it } from 'vitest'
import {
  downloadPercent,
  downloadStatus,
  formatTransferRate,
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
  ).toBe('Downloading dxvk v2.3 · 25% · 1 of 4 MB')
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
