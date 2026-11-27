import { afterEach, expect, it, vi } from 'vitest'
import type { CompressionStatus } from '@/types/compression'
import { compressionPercent, syncCompressionToast } from '../useCompressionEvents'

vi.mock('@/lib/toast', () => ({
  notify: { progress: vi.fn(), success: vi.fn(), error: vi.fn() },
}))
import { notify } from '@/lib/toast'

afterEach(() => vi.clearAllMocks())

const base: CompressionStatus = {
  enabled: true,
  running: true,
  compressing: true,
  gamesDone: 1,
  gamesTotal: 4,
  currentTitle: 'God of War Ragnarök',
  bytesDone: 52_428_800,
  bytesTotal: 104_857_600,
  savedBytes: 0,
  skippedGames: 0,
  error: null,
}

it('shows one progress toast across every game', () => {
  expect(compressionPercent(base)).toBe(38)
  expect(compressionPercent({ ...base, gamesTotal: 0 })).toBeNull()
  syncCompressionToast(null, base)
  expect(notify.progress).toHaveBeenCalledWith({
    id: 'game-compression',
    title: 'Compressing games',
    caption: 'Game 2 of 4 · God of War Ragnarök',
    message: '50 MB / 100 MB',
    value: 38,
  })
})

it('finishes with the space saved, or the error', () => {
  const done = { ...base, running: false, gamesDone: 4, savedBytes: 3_221_225_472 }
  syncCompressionToast(base, done)
  expect(notify.success).toHaveBeenCalledWith(
    { title: 'Games compressed', message: 'Saved 3.0 GB on disk.' },
    { id: 'game-compression' },
  )
  syncCompressionToast(
    { ...base, compressing: false },
    { ...done, compressing: false, error: 'The disk is full.' },
  )
  expect(notify.error).toHaveBeenCalledWith(
    { title: 'Decompressing stopped', message: 'The disk is full.' },
    { id: 'game-compression' },
  )
})

it('stays quiet for an idle status, and names skipped games', () => {
  syncCompressionToast(null, { ...base, running: false })
  expect(notify.success).not.toHaveBeenCalled()
  syncCompressionToast(base, {
    ...base,
    running: false,
    compressing: false,
    skippedGames: 1,
  })
  expect(notify.success).toHaveBeenCalledWith(
    {
      title: 'Games decompressed',
      message:
        'Every game is stored at full size again. 1 running or downloading game was skipped.',
    },
    { id: 'game-compression' },
  )
})
